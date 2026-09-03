/*
 * Receipt verification (anti-forgery) — DB-backed integration.
 *
 * Covers the full receipt trust chain:
 *   · the QR signing key + device fingerprint are provisioned on this DB,
 *   · demo receipts arrive with verification codes (startup provisioning),
 *   · verify() finds receipts by code AND by receipt number,
 *   · verifyQr() accepts a genuine signed payload, rejects a tampered one
 *     (bad-signature) and reports an unknown code as not-found,
 *   · a new donation gets a code the moment its receipt is assembled
 *     (same lazy backfill as receipt numbers),
 *   · certificate verification keeps working and now returns SIGNED payloads.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDB } from "../db/connection.js";
import { donations, certificates as certs } from "./data.service.js";
import { ensureDonationVerificationCode } from "./receipt.service.js";
import { parseQrPayload, verifyQrSignature, signQrPayload } from "./qr-code.js";
import { getQrPrintContext } from "./qr-signing.js";

describe("QR trust chain provisioning", () => {
  beforeAll(() => { getDB(); /* schema + migrations + demo provisioning */ });

  it("provisions a stable 64-hex signing key (never printed, never re-rolled)", () => {
    const row = getDB().prepare("SELECT qr_signing_key, device_fingerprint FROM settings WHERE id = 1").get() as
      | { qr_signing_key?: string; device_fingerprint?: string }
      | undefined;
    expect(row?.qr_signing_key).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.device_fingerprint).toMatch(/^[0-9A-F]{16}$/);
    // The context helper returns exactly the stored values.
    const ctx = getQrPrintContext();
    expect(ctx.signingKey).toBe(row!.qr_signing_key);
    expect(ctx.fingerprint).toBe(row!.device_fingerprint);
  });

  it("gives every issued demo receipt a verification code", () => {
    const db = getDB();
    const missingDon = db.prepare("SELECT COUNT(*) AS c FROM donations WHERE receipt_number != '' AND (verification_code IS NULL OR verification_code = '')").get() as { c: number };
    const missingSub = db.prepare("SELECT COUNT(*) AS c FROM subscription_payments WHERE receipt_number != '' AND (verification_code IS NULL OR verification_code = '')").get() as { c: number };
    expect(missingDon.c).toBe(0);
    expect(missingSub.c).toBe(0);
  });
});

describe("receipt verification (verify + verifyQr)", () => {
  beforeAll(() => { getDB(); });

  it("finds a receipt by its verification code", () => {
    const db = getDB();
    const row = db.prepare("SELECT verification_code, receipt_number, donor_name, amount FROM donations WHERE verification_code IS NOT NULL AND verification_code != '' LIMIT 1").get() as any;
    expect(row).toBeTruthy();
    const res: any = certs.verify(row.verification_code);
    expect(res.valid).toBe(true);
    expect(res.kind).toBe("RECEIPT");
    expect(res.receipt.receipt_number).toBe(row.receipt_number);
    expect(res.receipt.payer).toBe(row.donor_name);
    expect(res.receipt.amount).toBe(Number(row.amount));
    expect(res.deviceFingerprint).toMatch(/^[0-9A-F]{16}$/);
  });

  it("finds a receipt by its receipt NUMBER (the office types what is printed)", () => {
    const db = getDB();
    const row = db.prepare("SELECT receipt_number FROM donations WHERE receipt_number IS NOT NULL AND receipt_number != '' LIMIT 1").get() as any;
    const res: any = certs.verify(row.receipt_number);
    expect(res.valid).toBe(true);
    expect(res.kind).toBe("RECEIPT");
    expect(res.receipt.receipt_number).toBe(row.receipt_number);
  });

  it("reports unknown codes as invalid", () => {
    const res = certs.verify("ZZZZ-ZZZZ-ZZZZ");
    expect(res.valid).toBe(false);
    expect(res.kind).toBeNull();
  });

  it("round-trips a genuine SIGNED QR payload through verifyQr", () => {
    const byNumber: any = (() => {
      const db = getDB();
      const row = db.prepare("SELECT verification_code, receipt_number FROM donations WHERE verification_code != '' LIMIT 1").get() as any;
      return certs.verify(row.receipt_number);
    })();
    expect(byNumber.qrPayload).toMatch(/^MMS\|RCP\|/);
    expect(String(byNumber.qrPayload).split("|")).toHaveLength(7); // signed

    const parsed = parseQrPayload(String(byNumber.qrPayload));
    expect(parsed?.kind).toBe("RCP");
    const { signingKey } = getQrPrintContext();
    expect(verifyQrSignature(parsed, signingKey)).toBe(true);

    const checked: any = certs.verifyQr(String(byNumber.qrPayload));
    expect(checked.valid).toBe(true);
    expect(checked.kind).toBe("RECEIPT");
    expect(checked.receiptMatchesRegister).toBe(true);
    expect(checked.issuedOnThisDevice).toBe(true);
    expect(checked.qr.signed).toBe(true);
  });

  it("rejects a TAMPERED payload — bad-signature (forged QR)", () => {
    const db = getDB();
    const row = db.prepare("SELECT receipt_number FROM donations WHERE verification_code != '' LIMIT 1").get() as any;
    const genuine = certs.verify(row.receipt_number).qrPayload as string;
    // Forger alters the receipt number by one digit, keeping the tag.
    const parts = genuine.split("|");
    parts[2] = parts[2].slice(0, -1) + (parts[2].endsWith("9") ? "8" : "9");
    const forged = parts.join("|");
    // The structure still parses…
    expect(parseQrPayload(forged)).not.toBeNull();
    // …but the signature check fails, so verification reports it.
    const res = certs.verifyQr(forged);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("bad-signature");
  });

  it("reports a well-formed signed payload with an unknown code as not-found", () => {
    const db = getDB();
    const row = db.prepare("SELECT receipt_number FROM donations WHERE verification_code != '' LIMIT 1").get() as any;
    const genuine = String((certs.verify(row.receipt_number) as any).qrPayload);
    const parts = genuine.split("|");
    parts[3] = "ZZZZ-ZZZZ-ZZZZ"; // unknown code — recompute the tag so only the lookup fails
    parts[6] = signQrPayload(parts.slice(0, 6).join("|"), getQrPrintContext().signingKey);
    const res: any = certs.verifyQr(parts.join("|"));
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("not-found");
  });

  it("gives a new donation a verification code the moment its receipt is assembled", () => {
    const cat = getDB().prepare("SELECT id FROM donation_categories ORDER BY id LIMIT 1").get() as { id: number };
    const created = donations.create({ donorName: "Verify Backfill", amount: 100, categoryId: cat.id, donationDate: "2026-09-02" });
    const id = Number(created.id);
    try {
      const before = getDB().prepare("SELECT verification_code FROM donations WHERE id = ?").get(id) as { verification_code?: string };
      expect(String(before.verification_code || "")).toBe(""); // not yet issued
      const code = ensureDonationVerificationCode(id);
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      // Stable: a second call returns the SAME code (issued codes never change).
      expect(ensureDonationVerificationCode(id)).toBe(code);
      // And now the code verifies.
      const res: any = certs.verify(code);
      expect(res.valid).toBe(true);
      expect(res.kind).toBe("RECEIPT");
      expect(res.receipt.payer).toBe("Verify Backfill");
    } finally {
      donations.remove(id);
    }
  });

  it("certificate verification still works and now returns SIGNED payloads", () => {
    const db = getDB();
    const cert = db.prepare("SELECT certificate_number, verification_code, issued_to FROM certificates WHERE verification_code != '' ORDER BY id LIMIT 1").get() as any;
    expect(cert).toBeTruthy();
    const res: any = certs.verify(cert.certificate_number);
    expect(res.valid).toBe(true);
    expect(res.kind).toBe("CERTIFICATE");
    expect(res.certificate.issued_to).toBe(cert.issued_to);
    expect(String(res.qrPayload).split("|")).toHaveLength(7);
    const checked: any = certs.verifyQr(String(res.qrPayload));
    expect(checked.valid).toBe(true);
    expect(checked.certificateMatchesRegister).toBe(true);
    // A tampered certificate payload is likewise rejected.
    const parts = String(res.qrPayload).split("|");
    parts[5] = "2020-01-01";
    const tampered: any = certs.verifyQr(parts.join("|"));
    expect(tampered.valid).toBe(false);
    expect(tampered.reason).toBe("bad-signature");
  });
});

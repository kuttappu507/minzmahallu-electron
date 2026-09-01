/*
 * Unified document numbering — PREFIX/YYYY/MM/NNN.
 * Pure helpers are checked directly; the DB-backed allocation is exercised
 * through the real CRUD layer (donations / subscriptions / certificates) on
 * the demo database, exactly as the app uses it.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDB } from "../db/connection.js";
import { donations, subscriptions, certificates } from "./data.service.js";
import {
  sanitizePrefix,
  mahalluInitials,
  formatDocNumber,
  maxSeriesUsed,
  fileNameSafe,
  nextReceiptNumber,
  nextCertificateNumber,
  ensureDonationReceiptNumber,
} from "./doc-number.service.js";

const NUM = /^[A-Z]{1,5}\/\d{4}\/\d{2}\/\d{3,}$/;

describe("doc-number pure helpers", () => {
  it("sanitizes prefixes to 1–5 capital letters", () => {
    expect(sanitizePrefix("mmh 2!", "RC")).toBe("MMH");
    expect(sanitizePrefix("KMJ", "RC")).toBe("KMJ");
    expect(sanitizePrefix("ABCDEFGH", "RC")).toBe("ABCDE");
    expect(sanitizePrefix("മിൻസ്", "RC")).toBe("RC");
    expect(sanitizePrefix("", "RC")).toBe("RC");
    expect(sanitizePrefix(null, "RC")).toBe("RC");
  });

  it("derives mahallu initials from the name", () => {
    expect(mahalluInitials("Minz Mahallu")).toBe("MM");
    expect(mahalluInitials("Kunnoth P O")).toBe("KPO");
    expect(mahalluInitials("Noor")).toBe("NOO");
    expect(mahalluInitials("മിൻസ് മഹല്ല്")).toBe("");
    expect(mahalluInitials("")).toBe("");
  });

  it("formats PREFIX/YYYY/MM/NNN with 3-digit padding that grows past 999", () => {
    expect(formatDocNumber("MMH", "2026", "02", 1)).toBe("MMH/2026/02/001");
    expect(formatDocNumber("MMH", "2026", "02", 42)).toBe("MMH/2026/02/042");
    expect(formatDocNumber("DT", "2026", "09", 1000)).toBe("DT/2026/09/1000");
  });

  it("finds the highest used sequence, ignoring legacy formats and other months", () => {
    const used = [
      "MMH/2026/02/001",
      "MMH/2026/02/012",
      "MMH/2026/02/007",
      "MMH/2026/03/001", // different month
      "MMH/2025/02/999", // different year
      "DON-003",
      "RCP-0001",
      "",
    ];
    expect(maxSeriesUsed(used, "MMH", "2026", "02")).toBe(12);
    expect(maxSeriesUsed(used, "MMH", "2026", "03")).toBe(1);
    expect(maxSeriesUsed(used, "MMH", "2026", "01")).toBe(0);
  });

  it("makes numbers file-name safe", () => {
    expect(fileNameSafe("MMH/2026/09/001")).toBe("MMH-2026-09-001");
    expect(fileNameSafe(123)).toBe("123");
  });
});

describe("doc-number allocation (real CRUD layer)", () => {
  beforeAll(() => {
    const db = getDB(); // loads schema + migrations + demo data
    // Deterministic prefix source: initials of the mahallu name; the stored
    // prefix stays at the legacy "RCP" placeholder, which must be ignored.
    db.prepare("UPDATE settings SET mahallu_name = 'Minz Mahallu', receipt_prefix = 'RCP' WHERE id = 1").run();
  });

  it("numbers donations MM/YYYY/MM/NNN, sequencing per month, honoring manual numbers", () => {
    const cat = getDB().prepare("SELECT id FROM donation_categories ORDER BY id LIMIT 1").get() as { id: number } | undefined;
    expect(cat).toBeTruthy();
    const created: number[] = [];
    try {
      const first = donations.create({ donorName: "Numbering One", amount: 100, categoryId: cat!.id, donationDate: "2026-09-01" });
      expect(first.receiptNumber).toBe("MM/2026/09/001");

      const second = donations.create({ donorName: "Numbering Two", amount: 100, categoryId: cat!.id, donationDate: "2026-09-02" });
      expect(second.receiptNumber).toBe("MM/2026/09/002");

      // A manual number (book migration) is honored verbatim.
      const manual = donations.create({ donorName: "Numbering Book", amount: 100, categoryId: cat!.id, donationDate: "2026-09-03", receiptNumber: "BOOK-77" });
      expect(manual.receiptNumber).toBe("BOOK-77");

      // A different month starts its own sequence.
      const aug = donations.create({ donorName: "Numbering Aug", amount: 100, categoryId: cat!.id, donationDate: "2026-08-15" });
      expect(aug.receiptNumber).toMatch(/^MM\/2026\/08\/\d{3}$/);

      created.push(first.id, second.id, manual.id, aug.id);
    } finally {
      for (const id of created) donations.remove(id);
    }
  });

  it("uses a customized prefix the moment the mahallu sets one", () => {
    const db = getDB();
    db.prepare("UPDATE settings SET receipt_prefix = 'KMJ' WHERE id = 1").run();
    try {
      expect(nextReceiptNumber("2026-09-01")).toMatch(/^KMJ\/2026\/09\/\d{3}$/);
    } finally {
      db.prepare("UPDATE settings SET receipt_prefix = 'RCP' WHERE id = 1").run();
    }
  });

  it("numbers subscription payments in the shared receipt series and never renumbers an issued receipt", () => {
    const pending = getDB()
      .prepare("SELECT id, period_start, amount FROM subscriptions WHERE status = 'Pending' AND amount > 0 AND period_start = '2026-08-01' ORDER BY id LIMIT 1")
      .get() as { id: number; period_start: string; amount: number } | undefined;
    expect(pending).toBeTruthy();

    const paid = subscriptions.applyPayment(pending!.id, { amountPaid: 100, paymentDate: "2026-08-20", paymentMethod: "Cash" });
    expect(paid.receiptNumber).toMatch(NUM);

    // Re-recording the SAME month (member tops up the payment) must keep the
    // receipt number that may already be printed / sent on WhatsApp.
    const topped = subscriptions.applyPayment(pending!.id, { amountPaid: pending!.amount, paymentDate: "2026-08-21", paymentMethod: "Cash" });
    expect(topped.receiptNumber).toBe(paid.receiptNumber);

    const ledger = getDB()
      .prepare("SELECT receipt_number FROM subscription_payments WHERE subscription_id = ? AND period_start = ? LIMIT 1")
      .get(pending!.id, pending!.period_start) as { receipt_number: string };
    expect(ledger.receipt_number).toBe(paid.receiptNumber);
  });

  it("numbers certificates per type — DT for death, MB for membership", () => {
    // Certificates are append-only (delete triggers guard the register), so
    // the issued rows are verified in place — the test database is a
    // throwaway per-process copy.
    const death = certificates.issueDeath("DTH-2026-0001", 1);
    expect(death.certificateNumber).toMatch(/^DT\/\d{4}\/\d{2}\/\d{3}$/);
    const deathRow = getDB().prepare("SELECT certificate_number, type FROM certificates WHERE id = ?").get(death.id) as { certificate_number: string; type: string };
    expect(deathRow.certificate_number).toBe(death.certificateNumber);
    expect(deathRow.type).toBe("Death");

    const member = certificates.issueMembership("MEM-001", 1);
    expect(member.certificateNumber).toMatch(/^MB\/\d{4}\/\d{2}\/\d{3}$/);
    const memberRow = getDB().prepare("SELECT certificate_number, type FROM certificates WHERE id = ?").get(member.id) as { certificate_number: string; type: string };
    expect(memberRow.certificate_number).toBe(member.certificateNumber);
    expect(memberRow.type).toBe("Membership");

    // Every certificate type has its own series, so numbers never collide
    // across kinds within a month.
    const dt = nextCertificateNumber("Death", "2026-09-01");
    const mb = nextCertificateNumber("Membership", "2026-09-01");
    const noc = nextCertificateNumber("NOC", "2026-09-01");
    expect(new Set([dt, mb, noc]).size).toBe(3);
    expect(dt).toMatch(/^DT\/2026\/09\/\d{3}$/);
    expect(mb).toMatch(/^MB\/2026\/09\/\d{3}$/);
    expect(noc).toMatch(/^NOC\/2026\/09\/\d{3}$/);
  });

  it("backfills a number on first generation for legacy blank rows, never renumbering issued ones", () => {
    const db = getDB();
    const cat = db.prepare("SELECT id FROM donation_categories ORDER BY id LIMIT 1").get() as { id: number };
    const info = db
      .prepare("INSERT INTO donations (donor_name, donor_phone, donor_address, family_id, member_id, category_id, amount, donation_date, receipt_number, purpose, payment_method, transaction_ref, received_by, remarks) VALUES ('Legacy Blank', '', '', NULL, NULL, ?, 100, '2026-09-05', '', '', 'Cash', '', 1, '')")
      .run(cat.id);
    const legacyId = Number(info.lastInsertRowid);
    try {
      const issued = ensureDonationReceiptNumber(legacyId, "2026-09-05");
      expect(issued).toMatch(NUM);
      // Second generation returns the SAME number — issued numbers are final.
      expect(ensureDonationReceiptNumber(legacyId, "2026-09-05")).toBe(issued);
      const row = db.prepare("SELECT receipt_number FROM donations WHERE id = ?").get(legacyId) as { receipt_number: string };
      expect(row.receipt_number).toBe(issued);
    } finally {
      donations.remove(legacyId);
    }
  });
});

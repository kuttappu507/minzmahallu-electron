/*
 * Approval workflow (V037) gates — user report: an office-staff donation
 * showed "approval needed" but (a) the admin had no visible provision to
 * approve it and (b) receipt PDF / WhatsApp send were NOT locked behind the
 * approval. The renderer half of the fix adds inline Approve buttons and
 * hides the receipt actions; THIS file pins the main-process half: nothing
 * official may happen for a PENDING entry —
 *   - no receipt PDF (single or the data gate behind batch sheets),
 *   - no payment recording on a pending subscription,
 *   - no certificate issued from a pending register (member/family/
 *     marriage/death).
 * Every refusal carries the stable phrase "WAITING FOR ADMIN APPROVAL",
 * which the renderer maps to a bilingual message (src/lib/ipc-error.ts).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDB } from "../db/connection.js";
import { assertReceiptAllowedFor, generateDonationReceiptPdf } from "./receipt.service.js";
import { certificates } from "./data/certificates.service.js";
import { donations, subscriptions, families, members, marriages, deaths } from "./data.service.js";
import { ensureFamily, ensureMarriageRecord, ensureDeathRecord } from "./fixtures.js";

const U = `APG${Date.now() % 100000}`;
const APPROVAL_RE = /WAITING FOR ADMIN APPROVAL/;

describe("receipt gate helper (assertReceiptAllowedFor)", () => {
  it("refuses pending entries of both kinds", () => {
    expect(() => assertReceiptAllowedFor("donation", "pending")).toThrow(APPROVAL_RE);
    expect(() => assertReceiptAllowedFor("subscription", "pending")).toThrow(APPROVAL_RE);
  });

  it("allows approved, NULL and legacy-blank statuses", () => {
    expect(() => assertReceiptAllowedFor("donation", "approved")).not.toThrow();
    expect(() => assertReceiptAllowedFor("subscription", null)).not.toThrow();
    expect(() => assertReceiptAllowedFor("subscription", undefined)).not.toThrow();
    expect(() => assertReceiptAllowedFor("donation", "  ")).not.toThrow();
  });
});

describe("pending donation — receipt PDF refuses until approved", () => {
  beforeAll(() => { getDB(); });

  it("refuses the PDF while pending, allows once approved", async () => {
    const db = getDB();
    const cat = donations.createCategory(`${U} Zakat`, "test category") as any;
    const catId = Number(cat.id ?? cat.lastInsertRowid);
    const created: any = donations.create({
      donorName: `${U} Donor`, categoryId: catId, amount: 250,
      donationDate: "2026-09-20", paymentMethod: "Cash", receivedBy: 1,
      approvalStatus: "pending",
    } as any) as any;
    const id = Number(created.id);

    // While pending: the generator must refuse BEFORE touching electron/PDF.
    await expect(generateDonationReceiptPdf(id)).rejects.toThrow(APPROVAL_RE);

    // Approval flips the row — the same call no longer hits the gate.
    db.prepare("UPDATE donations SET approval_status = 'approved' WHERE id = ?").run(id);
    let approvalError = false;
    try { await generateDonationReceiptPdf(id); } catch (e: any) { approvalError = APPROVAL_RE.test(String(e?.message)); }
    expect(approvalError).toBe(false);
  });
});

describe("pending subscription — payments refuse until approved", () => {
  it("refuses applyPayment while pending; the approvals flow applies the parked payment itself", () => {
    const famId = ensureFamily();
    const created: any = subscriptions.create({
      familyId: famId, amount: 300, paymentMethod: "Cash", collectedBy: 1,
      approvalStatus: "pending",
    } as any) as any;
    const id = Number(created.id);

    // Payment on a PENDING account must refuse (money not counted yet).
    expect(() => subscriptions.applyPayment(id, { amountPaid: 300, paymentMethod: "Cash" } as any)).toThrow(APPROVAL_RE);

    // Simulate the Approvals queue: flip to approved FIRST, then the parked
    // first payment applies through the very same applyPayment path.
    const db = getDB();
    db.prepare("UPDATE subscriptions SET approval_status = 'approved' WHERE id = ?").run(id);
    expect(() => subscriptions.applyPayment(id, { amountPaid: 300, paymentMethod: "Cash" } as any)).not.toThrow();
  });
});

describe("pending registers — certificates refuse to issue", () => {
  it("membership certificate: pending member refuses, approved issues", () => {
    const db = getDB();
    const famId = ensureFamily();
    const created: any = members.create({ familyId: famId, name: `${U} Member`, relationship: "Member", gender: "Male", status: "Active" } as any) as any;
    const code = String(created.memberCode ?? created.code);
    db.prepare("UPDATE members SET approval_status = 'pending' WHERE member_code = ?").run(code);
    expect(() => certificates.issueMembership(code, 1)).toThrow(APPROVAL_RE);
    db.prepare("UPDATE members SET approval_status = 'approved' WHERE member_code = ?").run(code);
    expect(() => certificates.issueMembership(code, 1)).not.toThrow();
  });

  it("residence certificate: pending family refuses", () => {
    const db = getDB();
    const famId = ensureFamily();
    const f: any = db.prepare("SELECT family_number FROM families WHERE id = ?").get(famId);
    db.prepare("UPDATE families SET approval_status = 'pending' WHERE id = ?").run(famId);
    expect(() => certificates.issueResidence(String(f.family_number), `${U} Person`, 1)).toThrow(APPROVAL_RE);
    db.prepare("UPDATE families SET approval_status = 'approved' WHERE id = ?").run(famId);
  });

  it("marriage + NOC certificates: pending nikah refuses both", () => {
    const db = getDB();
    const num = ensureMarriageRecord();
    db.prepare("UPDATE marriages SET approval_status = 'pending' WHERE marriage_number = ?").run(num);
    expect(() => certificates.issueMarriage(num, 1)).toThrow(APPROVAL_RE);
    expect(() => certificates.issueMarriageNoc(num, 1)).toThrow(APPROVAL_RE);
    db.prepare("UPDATE marriages SET approval_status = 'approved' WHERE marriage_number = ?").run(num);
  });

  it("death certificate: pending death register refuses", () => {
    const db = getDB();
    const num = ensureDeathRecord();
    db.prepare("UPDATE deaths SET approval_status = 'pending' WHERE death_number = ?").run(num);
    expect(() => certificates.issueDeath(num, 1)).toThrow(APPROVAL_RE);
    db.prepare("UPDATE deaths SET approval_status = 'approved' WHERE death_number = ?").run(num);
  });
});

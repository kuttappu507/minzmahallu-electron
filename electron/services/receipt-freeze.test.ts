/*
 * Receipt freeze — the office rule that a record whose receipt was already
 * GENERATED (printed, saved, or sent on WhatsApp) can no longer be edited.
 * The payee's copy must keep matching the register in EVERY field, so v2.4.10
 * tightened v2.4.9's amount-only freeze to a full lock. The escape hatch is
 * cancel + re-record (the cancelled payment row stops guarding).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDB } from "../db/connection.js";
import { donations, subscriptions } from "./data.service.js";
import { ensureFamily, ensurePendingSubscription } from "./fixtures.js";

function donationPayload(overrides: Partial<Record<string, any>> = {}) {
  return {
    donorName: "Freeze Donor", donorPhone: "", donorAddress: "",
    familyId: null, memberId: null, categoryId: 1, amount: 500,
    donationDate: "2026-09-20", purpose: "Freeze check", paymentMethod: "Cash",
    transactionRef: "", remarks: "", ...overrides,
  };
}

describe("receipt freeze (paid records are fully locked)", () => {
  let donationId = 0;

  beforeAll(() => {
    getDB();
    const db = getDB();
    const cat = db.prepare("SELECT id FROM donation_categories ORDER BY id LIMIT 1").get() as { id: number } | undefined;
    const created: any = donations.create(donationPayload({ categoryId: cat?.id ?? 1 }));
    donationId = Number(created?.id ?? created?.lastInsertRowid ?? created);
  });

  it("a donation with a generated receipt rejects EVERY edit — the same-amount edit too", () => {
    const db = getDB();
    db.prepare("UPDATE donations SET receipt_generated_at = datetime('now') WHERE id = ?").run(donationId);
    // v2.4.9 allowed same-amount edits (name/remarks/method) — v2.4.10 locks them all
    expect(() => donations.update(donationId, donationPayload({ remarks: "same-amount edit" })))
      .toThrow(/no longer be edited/);
    expect(() => donations.update(donationId, donationPayload({ amount: 999 })))
      .toThrow(/no longer be edited/);
  });

  it("a donation WITHOUT a generated receipt still edits normally", () => {
    const db = getDB();
    const cat = db.prepare("SELECT id FROM donation_categories ORDER BY id LIMIT 1").get() as { id: number } | undefined;
    const created: any = donations.create(donationPayload({ categoryId: cat?.id ?? 1, amount: 300 }));
    const id = Number(created?.id ?? created?.lastInsertRowid ?? created);
    donations.update(id, donationPayload({ categoryId: cat?.id ?? 1, amount: 350, remarks: "still editable" }));
    const row = db.prepare("SELECT amount, remarks FROM donations WHERE id = ?").get(id) as any;
    expect(Number(row.amount)).toBe(350);
    expect(row.remarks).toBe("still editable");
  });

  it("a subscription month with a generated receipt rejects the payment edit; cancel unblocks re-recording", () => {
    const db = getDB();
    const familyId = ensureFamily(91);
    ensurePendingSubscription(familyId, 100);
    const sub = db.prepare("SELECT id, period_start FROM subscriptions WHERE family_id = ? LIMIT 1").get(familyId) as any;

    subscriptions.applyPayment(sub.id, { amountPaid: 120, paymentMethod: "Cash" });
    // simulate the receipt being generated for the month's ACTIVE payment
    db.prepare("UPDATE subscription_payments SET receipt_generated_at = datetime('now') WHERE subscription_id = ? AND status = 'Active'").run(sub.id);

    // same amount, different method — still an edit, still rejected
    expect(() => subscriptions.applyPayment(sub.id, { amountPaid: 120, paymentMethod: "UPI" }))
      .toThrow(/no longer be edited/);
    expect(() => subscriptions.applyPayment(sub.id, { amountPaid: 150, paymentMethod: "Cash" }))
      .toThrow(/no longer be edited/);

    // cancel → the cancelled row stops guarding → re-record works
    subscriptions.cancelPayment(sub.id);
    subscriptions.applyPayment(sub.id, { amountPaid: 150, paymentMethod: "Cash" });
    const after = db.prepare("SELECT amount FROM subscription_payments WHERE subscription_id = ? AND status = 'Active'").get(sub.id) as any;
    expect(Number(after.amount)).toBe(150);
  });
});

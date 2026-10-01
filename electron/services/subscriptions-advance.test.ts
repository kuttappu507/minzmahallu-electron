/*
 * ADVANCE SETTLES THE MONTH BY ITSELF (user request).
 *
 * Two exact stories from the mahallu:
 *   1. Sub 120, paid 220 → this month 120, advance 100. NEXT MONTH the
 *      family pays just 20 and the month must COMPLETE (was: stuck
 *      "Partial / due 100" while the credit sat idle).
 *   2. Sub 120, paid 500 → advance 380. NEXT MONTH (and the ones after)
 *      the advance itself pays the 120 with no cash and no admin action —
 *      the balance just keeps shrinking — and those months' receipts are
 *      sendable in one click from the Subscriptions page popup. Partial
 *      months (credit ran out, cash still needed) are never offered.
 *
 * Each story uses its OWN family so the scenarios stay independent.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDB } from "../db/connection.js";
import { subscriptions, families } from "./data.service.js";

const RATE = 120;
const clean = (n: number | null | undefined) => Math.round(Number(n || 0) * 100) / 100;

function account(subId: number): any {
  return getDB().prepare("SELECT * FROM subscriptions WHERE id = ?").get(subId) as any;
}
function ledgerRow(subId: number): any {
  return getDB()
    .prepare("SELECT * FROM subscription_payments WHERE subscription_id = ? AND period_start = ? AND status = 'Active' LIMIT 1")
    .get(subId, account(subId).period_start) as any;
}
/** Move the account AND its current ledger rows one month back so
 *  ensureCurrentMonth rolls it into the current month again (same trick as
 *  the arrears suite — in real operation the calendar does this). */
function rewindOneMonth(subId: number) {
  const db = getDB();
  db.prepare(
    "UPDATE subscriptions SET period_start = date('now','localtime','start of month','-1 month'), period_end = date('now','localtime','start of month','-1 day') WHERE id = ?"
  ).run(subId);
  db.prepare(
    "UPDATE subscription_payments SET period_start = date('now','localtime','start of month','-1 month'), period_end = date('now','localtime','start of month','-1 day') WHERE subscription_id = ? AND period_start = date('now','localtime','start of month')"
  ).run(subId);
}
function newFamily(house: string): number {
  const fam = families.create({ houseName: house });
  const created = subscriptions.create({ familyId: Number(fam.id), amount: RATE, amountPaid: 0, paymentMethod: "Cash" }) as any;
  return Number(created.id);
}

beforeAll(() => {
  getDB();
  getDB().prepare("UPDATE settings SET subscription_monthly_amount = ? WHERE id = 1").run(RATE);
});

describe("story 1 — paid 220 for a 120 sub; next month 20 completes it", () => {
  let subId = 0;
  let familyId = 0;
  beforeAll(() => {
    const fam = families.create({ houseName: "Advance Story One" });
    familyId = Number(fam.id);
    const created = subscriptions.create({ familyId, amount: RATE, amountPaid: 0, paymentMethod: "Cash" }) as any;
    subId = Number(created.id);
  });

  it("month 1: 220 → month Paid, 100 rides as advance", () => {
    const r = subscriptions.applyPayment(subId, { amountPaid: 220, paymentDate: "2026-09-01", paymentMethod: "Cash" }) as any;
    expect(r.status).toBe("Paid");
    expect(clean(r.advance)).toBe(100);
    expect(clean(r.monthPaid)).toBe(120);
    const ledger = ledgerRow(subId);
    expect(clean(ledger.amount)).toBe(220);
    expect(clean(ledger.advance_added)).toBe(100);
  });

  it("month 2 opens with the 100 still standing (nothing eaten, nothing invented)", () => {
    rewindOneMonth(subId);
    subscriptions.ensureCurrentMonth();
    const s = account(subId);
    expect(clean(s.advance)).toBe(100);
    expect(clean(s.arrears)).toBe(0);
    expect(clean(s.amount_paid)).toBe(0);
    expect(s.status).toBe("Pending");           // 100 < 120 — not self-covering
    expect(Number(s.advance_covered || 0)).toBe(0);
  });

  it("paying 20 completes the month: cash 20 + credit 100 = 120 Paid", () => {
    const r = subscriptions.applyPayment(subId, { amountPaid: 20, paymentDate: "2026-09-02", paymentMethod: "Cash" }) as any;
    expect(r.status).toBe("Paid");
    expect(clean(r.monthPaid)).toBe(120);
    expect(clean(r.advance)).toBe(0);
    expect(clean(r.dueTotal)).toBe(0);
    const s = account(subId);
    expect(clean(s.amount_paid)).toBe(120);
    expect(clean(subscriptions.memberBalance(familyId))).toBe(0);
    const ledger = ledgerRow(subId);
    expect(clean(ledger.amount)).toBe(20);        // cash actually given
    expect(clean(ledger.advance_used)).toBe(100); // credit the month consumed
    expect(clean(ledger.advance_added)).toBe(0);
  });

  it("cancelling the 20-payment puts the 100 credit back", () => {
    subscriptions.cancelPayment(subId);
    const s = account(subId);
    expect(s.status).toBe("Pending");
    expect(clean(s.amount_paid)).toBe(0);
    expect(clean(s.advance)).toBe(100);
    expect(clean(subscriptions.memberBalance(familyId))).toBe(20); // 120 − 100
  });
});

describe("story 2 — paid 500; the advance pays the next months BY ITSELF", () => {
  let subId = 0;
  beforeAll(() => { subId = newFamily("Advance Story Two"); });

  it("month 1: 500 → Paid, 380 advance", () => {
    const r = subscriptions.applyPayment(subId, { amountPaid: 500, paymentDate: "2026-09-03", paymentMethod: "Cash" }) as any;
    expect(r.status).toBe("Paid");
    expect(clean(r.advance)).toBe(380);
  });

  it("month 2 settles from the credit with NO cash: Paid, advance 260", () => {
    rewindOneMonth(subId);
    subscriptions.ensureCurrentMonth();
    const s = account(subId);
    expect(s.status).toBe("Paid");
    expect(Number(s.advance_covered || 0)).toBe(1);
    expect(clean(s.amount_paid)).toBe(120);
    expect(clean(s.advance)).toBe(260);
    expect(clean(s.arrears)).toBe(0);
    const ledger = ledgerRow(subId);
    expect(clean(ledger.amount)).toBe(0);          // NO cash moved
    expect(clean(ledger.advance_used)).toBe(120);  // the credit paid the month
    expect(ledger.payment_method).toBe("Advance");
    // No phantom income: the zero-cash row adds nothing to collections.
    const before = clean(subscriptions.totalCollected());
    subscriptions.ensureCurrentMonth();            // idempotent re-run
    expect(clean(subscriptions.totalCollected())).toBe(before);
    expect(before).toBeGreaterThan(0);
    expect(clean(subscriptions.memberBalance(subs_family(subId)))).toBe(0);
  });

  it("the popup list offers exactly this family's month for receipt sending", () => {
    const ready = subscriptions.advanceReady() as any[];
    const mine = ready.find((r) => Number(r.id) === Number(subId));
    expect(mine).toBeTruthy();
    expect(clean(mine.amount)).toBe(120);
    expect(clean(mine.advance)).toBe(260);
  });

  it("the credit keeps paying: 260 → 140 → 20, then a Pending month waits", () => {
    rewindOneMonth(subId);
    subscriptions.ensureCurrentMonth();
    expect(account(subId).status).toBe("Paid");
    expect(clean(account(subId).advance)).toBe(140);
    expect(Number(account(subId).advance_covered || 0)).toBe(1);

    rewindOneMonth(subId);
    subscriptions.ensureCurrentMonth();
    expect(account(subId).status).toBe("Paid");
    expect(clean(account(subId).advance)).toBe(20);
    expect(Number(account(subId).advance_covered || 0)).toBe(1);

    // 20 < 120: the credit can no longer cover a whole month — it WAITS
    // (no arrears invented) for the family's next payment.
    rewindOneMonth(subId);
    subscriptions.ensureCurrentMonth();
    const s = account(subId);
    expect(s.status).toBe("Pending");
    expect(Number(s.advance_covered || 0)).toBe(0);
    expect(clean(s.advance)).toBe(20);
    expect(clean(s.arrears)).toBe(0);
    expect(clean(subscriptions.memberBalance(subs_family(subId)))).toBe(100); // 120 − 20
    // …and the top-up now completes the month: 100 cash + 20 credit.
    const r = subscriptions.applyPayment(subId, { amountPaid: 100, paymentDate: "2026-09-04", paymentMethod: "Cash" }) as any;
    expect(r.status).toBe("Paid");
    expect(clean(r.advance)).toBe(0);
    expect(clean(subscriptions.memberBalance(subs_family(subId)))).toBe(0);
  });
});

describe("cash recorded over an auto-covered month / cancel of an auto-covered month", () => {
  let subId = 0;
  let familyId = 0;
  beforeAll(() => {
    const fam = families.create({ houseName: "Advance Story Three" });
    familyId = Number(fam.id);
    const created = subscriptions.create({ familyId, amount: RATE, amountPaid: 0, paymentMethod: "Cash" }) as any;
    subId = Number(created.id);
  });

  it("setup: 500 in, one roll auto-covers (advance 260)", () => {
    subscriptions.applyPayment(subId, { amountPaid: 500, paymentDate: "2026-09-05", paymentMethod: "Cash" });
    rewindOneMonth(subId);
    subscriptions.ensureCurrentMonth();
    const s = account(subId);
    expect(s.status).toBe("Paid");
    expect(Number(s.advance_covered || 0)).toBe(1);
    expect(clean(s.advance)).toBe(260);
  });

  it("recording CASH over the auto-covered month restores the credit first", () => {
    const r = subscriptions.applyPayment(subId, { amountPaid: 120, paymentDate: "2026-09-06", paymentMethod: "Cash" }) as any;
    expect(r.status).toBe("Paid");
    expect(clean(r.advance)).toBe(380);              // the consumed 120 came BACK
    const ledger = ledgerRow(subId);
    expect(clean(ledger.amount)).toBe(120);
    expect(clean(ledger.advance_used)).toBe(0);
    expect(Number(account(subId).advance_covered || 0)).toBe(0);
  });

  it("cancelling the cash payment leaves the credit intact and the month unpaid", () => {
    subscriptions.cancelPayment(subId);
    const s = account(subId);
    expect(s.status).toBe("Pending");
    expect(clean(s.advance)).toBe(380);
    expect(clean(s.amount_paid)).toBe(0);
    expect(Number(s.advance_covered || 0)).toBe(0);
    expect(clean(subscriptions.memberBalance(familyId))).toBe(0); // credit nets the month
  });

  it("a cash-covered month is NOT in the popup list", () => {
    const ready = subscriptions.advanceReady() as any[];
    expect(ready.find((r) => Number(r.id) === Number(subId))).toBeFalsy();
  });
});

describe("a PARTIAL month never appears in the popup list", () => {
  it("50 of 120 with no credit stays out of the ready list", () => {
    const subId = newFamily("Advance Partial Exclusion");
    subscriptions.applyPayment(subId, { amountPaid: 50, paymentDate: "2026-09-07", paymentMethod: "Cash" });
    const ready = subscriptions.advanceReady() as any[];
    expect(ready.find((r) => Number(r.id) === Number(subId))).toBeFalsy();
    getDB().prepare("DELETE FROM subscription_payments WHERE subscription_id = ?").run(subId);
    getDB().prepare("DELETE FROM subscriptions WHERE id = ?").run(subId);
  });
});

describe("old arrears are cleared by cash first; the leftover credit then self-covers", () => {
  it("miss a month (70 short) → catch-up 400 → next roll auto-covers from 210", () => {
    const subId = newFamily("Advance Arrears Netting");
    subscriptions.applyPayment(subId, { amountPaid: 50, paymentDate: "2026-09-08", paymentMethod: "Cash" }); // 50 of 120, no credit → Partial
    expect(account(subId).status).toBe("Partial");
    rewindOneMonth(subId);
    subscriptions.ensureCurrentMonth();              // the 70 shortfall → arrears
    expect(clean(account(subId).arrears)).toBe(70);
    subscriptions.applyPayment(subId, { amountPaid: 400, paymentDate: "2026-09-09", paymentMethod: "Cash" }); // 70 arrears + 120 month + 210 credit
    const after = account(subId);
    expect(after.status).toBe("Paid");
    expect(clean(after.arrears)).toBe(0);
    expect(clean(after.advance)).toBe(210);
    // Roll: credit 210 → no arrears to net → self-covers the fresh 120 → 90 left.
    rewindOneMonth(subId);
    subscriptions.ensureCurrentMonth();
    const rolled = account(subId);
    expect(rolled.status).toBe("Paid");
    expect(Number(rolled.advance_covered || 0)).toBe(1);
    expect(clean(rolled.advance)).toBe(90);
    getDB().prepare("DELETE FROM subscription_payments WHERE subscription_id = ?").run(subId);
    getDB().prepare("DELETE FROM subscriptions WHERE id = ?").run(subId);
  });
});

/** family id of a subscription id (for memberBalance assertions) */
function subs_family(subId: number): number {
  return Number((account(subId) as any).family_id);
}

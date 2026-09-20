/*
 * Late receipt-delivery reporting — the contract behind the "receipt send
 * returns fast, the lock still flips" behaviour.
 *
 * A receipt send used to BLOCK for up to 4 s waiting for the recipient's
 * delivery ack (the largest single slice of "receipt sending in subscription
 * and donation takes too much time"). It now returns as soon as WhatsApp
 * ACCEPTS the message; the ack that lands later flips the privacy lock through
 * the engine's delivery listener. So the open page can follow along,
 * markReceiptDeliveredByMsgId() reports WHICH rows it locked and each one is
 * pushed to the renderer (whatsapp-ipc → whatsapp:receipt-delivered).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDB } from "../db/connection.js";
import { subscriptions, families } from "./data.service.js";
import {
  markReceiptAccepted, markReceiptDeliveredByMsgId, receiptSendState,
} from "./receipt.service.js";

const RATE = 200;
let familyId = 0;
let subId = 0;
let paymentId = 0;
let donationId = 0;

function ledgerRow(): any {
  return getDB()
    .prepare("SELECT * FROM subscription_payments WHERE subscription_id = ? AND status = 'Active' ORDER BY id DESC LIMIT 1")
    .get(subId) as any;
}

beforeAll(() => {
  getDB(); // schema + migrations
  getDB().prepare("UPDATE settings SET subscription_monthly_amount = ? WHERE id = 1").run(RATE);
  const fam = families.create({ houseName: "Delivery Push Test Family", phone: "9876500021" });
  familyId = Number(fam.id);
  const created = subscriptions.create({ familyId, amount: RATE, amountPaid: 0, paymentMethod: "Cash" }) as any;
  subId = Number(created.id);
  subscriptions.applyPayment(subId, { amountPaid: RATE, paymentDate: "2026-09-08", paymentMethod: "Cash" });
  paymentId = Number(ledgerRow().id);

  const category = getDB().prepare("SELECT id FROM donation_categories LIMIT 1").get() as any;
  donationId = Number(
    getDB()
      .prepare("INSERT INTO donations (donor_name, donor_phone, category_id, amount, donation_date, payment_method) VALUES (?, ?, ?, ?, ?, ?)")
      .run("Delivery Push Donor", "919876500022", Number(category.id), 500, "2026-09-08", "Cash").lastInsertRowid
  );
});

afterAll(() => {
  try {
    getDB().prepare("DELETE FROM subscription_payments WHERE subscription_id = ?").run(subId);
    getDB().prepare("DELETE FROM subscriptions WHERE id = ?").run(subId);
    getDB().prepare("DELETE FROM donations WHERE id = ?").run(donationId);
  } catch { /* throwaway DB — best effort */ }
});

describe("markReceiptDeliveredByMsgId reports the rows it locked", () => {
  it("an unrelated or empty message id reports nothing", () => {
    expect(markReceiptDeliveredByMsgId("")).toEqual([]);
    expect(markReceiptDeliveredByMsgId("MSG-NOT-OURS")).toEqual([]);
    expect(receiptSendState("subscription", paymentId).delivered).toBe(false);
    expect(receiptSendState("donation", donationId).delivered).toBe(false);
  });

  it("acceptance alone does NOT lock the receipt", () => {
    markReceiptAccepted("subscription", paymentId, "MSG-PUSH-SUB");
    markReceiptAccepted("donation", donationId, "MSG-PUSH-DON");
    expect(receiptSendState("subscription", paymentId).sent).toBe(true);
    expect(receiptSendState("subscription", paymentId).delivered).toBe(false);
    expect(receiptSendState("donation", donationId).delivered).toBe(false);
  });

  it("a late subscription ack locks that ledger row and names it", () => {
    const flipped = markReceiptDeliveredByMsgId("MSG-PUSH-SUB");
    expect(flipped).toEqual([{ kind: "subscription", id: paymentId }]);
    expect(receiptSendState("subscription", paymentId).delivered).toBe(true);
    expect(receiptSendState("subscription", paymentId).deliveredAt).toBeTruthy();
    // The donation receipt of the same run is untouched.
    expect(receiptSendState("donation", donationId).delivered).toBe(false);
  });

  it("a late donation ack locks that donation and names it", () => {
    const flipped = markReceiptDeliveredByMsgId("MSG-PUSH-DON");
    expect(flipped).toEqual([{ kind: "donation", id: donationId }]);
    expect(receiptSendState("donation", donationId).delivered).toBe(true);
  });

  it("never reports the same delivery twice (no duplicate UI pushes)", () => {
    expect(markReceiptDeliveredByMsgId("MSG-PUSH-SUB")).toEqual([]);
    expect(markReceiptDeliveredByMsgId("MSG-PUSH-DON")).toEqual([]);
    // And the locks stay on.
    expect(receiptSendState("subscription", paymentId).delivered).toBe(true);
    expect(receiptSendState("donation", donationId).delivered).toBe(true);
  });
});

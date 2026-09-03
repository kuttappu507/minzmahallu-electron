/*
 * Receipt template — anti-forgery QR footer (A6 single + A4 sheet).
 *
 * Receipts carry a signed QR + verification code instead of a signature
 * block: they are computer-generated documents. The QR must appear in BOTH
 * output shapes (they share one card design), the verification code must be
 * printed legibly next to it, and the old signature line must be gone.
 */
import { describe, it, expect } from "vitest";
import { buildReceiptHtml, buildReceiptSheetHtml, amountInWords, type ReceiptData } from "../print/receipt.template.js";

const base: ReceiptData = {
  kind: "DONATION",
  receiptNumber: "MMJM/26/09/001",
  date: "15-09-2026",
  payerName: "Abdul Rahman",
  payerDetail: "9847010001",
  line1Label: "Category",
  line1Value: "General Donation",
  line2Label: "Purpose",
  line2Value: "Jumuah collection",
  amount: 2500,
  paymentMethod: "UPI",
  transactionRef: "UPI-99012341",
  notes: "",
  mahalluName: "Minz Mahallu Jamath",
  verificationCode: "WK4M-8Q7Z-T3HD",
  qrSvg: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==",
};

describe("A6 receipt — QR + verification footer replaces the signature", () => {
  const html = buildReceiptHtml(base, "en");

  it("embeds the QR image in the footer", () => {
    expect(html).toContain('class="rc-qr"');
    expect(html).toContain("data:image/svg+xml;base64,");
  });

  it("prints the verification code beside the QR", () => {
    expect(html).toContain("SCAN TO VERIFY");
    expect(html).toContain("WK4M-8Q7Z-T3HD");
  });

  it("states the receipt is computer-generated — no signature required", () => {
    expect(html).toContain("Computer-generated receipt — no signature required.");
    expect(html).toContain("For Minz Mahallu Jamath");
    expect(html).toContain("Jazakallahu Khairan.");
  });

  it("drops the old signature block entirely", () => {
    expect(html).not.toContain("rc-sign");
    expect(html).not.toContain(">Signature<");
  });

  it("renders the same footer bilingually", () => {
    const ml = buildReceiptHtml(base, "ml");
    expect(ml).toContain("സ്കാൻ ചെയ്ത് പരിശോധിക്കുക");
    expect(ml).toContain("കമ്പ്യൂട്ടർ ജനറേറ്റ് ചെയ്ത രസീറ്റ് — ഒപ്പ് ആവശ്യമില്ല.");
    expect(ml).toContain("WK4M-8Q7Z-T3HD");
    expect(ml).not.toContain("rc-sign");
  });

  it("keeps the amount block untouched (words + ₹)", () => {
    expect(html).toContain("₹2,500");
    expect(html).toContain(amountInWords(2500));
  });
});

describe("A4 4-up sheet — every receipt card carries the QR", () => {
  const second: ReceiptData = { ...base, receiptNumber: "MMJM/26/09/002", verificationCode: "A9BX-C2VP-M5KS" };
  const html = buildReceiptSheetHtml([base, second], "en");

  it("renders a QR for each receipt (shared card design)", () => {
    expect((html.match(/class="rc-qr"/g) || []).length).toBe(2);
    expect(html).toContain("WK4M-8Q7Z-T3HD");
    expect(html).toContain("A9BX-C2VP-M5KS");
  });

  it("keeps cut guides and sheet footer metadata", () => {
    expect(html).toContain("4 / A4");
    expect(html).toContain("2 receipts");
  });

  it("has no signature blocks on the sheet either", () => {
    expect(html).not.toContain("rc-sign");
    expect(html).not.toContain(">Signature<");
  });
});

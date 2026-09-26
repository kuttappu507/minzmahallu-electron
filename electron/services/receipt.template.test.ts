/*
 * Receipt template — anti-forgery SECURITY CODE footer + classic sign-off
 * (A6 single + A4 sheet).
 *
 * Receipts carry BOTH anti-forgery elements: the register verification code
 * (the office checks it against the app) and the classic Kerala sign-off
 * block bottom-right — "-sd-" over "Secretary" over the mahallu name. By
 * design there is NO QR image on the printed receipt. The code must appear
 * in BOTH output shapes (they share one card design), the header must show
 * the mahallu name + address like the certificate, the title must say the
 * receipt type explicitly, and the Jazakallahu Khairan line sits just above
 * the signature block (no app-brand line at the bottom).
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
  mahalluAddress: "Minz Street, Kondotty",
  mahalluPhone: "0483 000 0000",
  verificationCode: "WK4M-8Q7Z-T3HD",
};

describe("A6 receipt — security-code footer + classic signature sign-off (no QR)", () => {
  const html = buildReceiptHtml(base, "en");

  it("prints NO QR image — the security code is the anti-forgery element", () => {
    expect(html).not.toContain('class="rc-qr"');
    expect(html).not.toContain("data:image/svg+xml");
  });

  it("prints the security code as a small full-width line under the sign-off (no app hint)", () => {
    expect(html).toContain("SECURITY CODE");
    expect(html).toContain("WK4M-8Q7Z-T3HD");
    // The app-verification hint was removed (user request: not all users
    // have the app) — the paper carries only the code itself:
    expect(html).not.toContain("Verify this security code");
    expect(html).not.toContain("Minz Mahallu app");
    // Full-width line UNDER the "For <mahallu>" sign-off, not beside it:
    const forAt = html.indexOf("For Minz Mahallu Jamath");
    const codeAt = html.indexOf("WK4M-8Q7Z-T3HD");
    expect(forAt).toBeGreaterThan(-1);
    expect(codeAt).toBeGreaterThan(forAt);
    expect(html).toMatch(/\.rc-verify\{[^}]*justify-content:center/);
  });

  it("header shows the mahallu name with address (+ phone) like the certificate", () => {
    expect(html).toContain("Minz Mahallu Jamath");
    expect(html).toContain("Minz Street, Kondotty · 0483 000 0000");
    // No "Mahallu Management System" in the header — brand moved to the bottom.
    expect(html).not.toContain("Mahallu Management System<span");
  });

  it("states the receipt type explicitly in the title", () => {
    expect(html).toContain("DONATION RECEIPT");
    const sub = buildReceiptHtml({ ...base, kind: "SUBSCRIPTION" }, "en");
    expect(sub).toContain("SUBSCRIPTION RECEIPT");
  });

  it("no longer prints the app brand at the bottom (user request)", () => {
    expect(html).not.toContain('class="rc-app"');
    expect(html).not.toContain("Minz Mahallu Management System");
  });

  it("closes with the classic sign-off: Jazakallahu Khairan above -sd- / Secretary / mahallu", () => {
    expect(html).toContain('class="rc-sign"');
    expect(html).toContain("-sd-");
    expect(html).toContain("Secretary");
    expect(html).toContain("For Minz Mahallu Jamath");
    // The thanks line sits JUST ABOVE the signature block (user request):
    const thanksAt = html.indexOf("Jazakallahu Khairan.");
    const sdAt = html.indexOf("-sd-");
    expect(thanksAt).toBeGreaterThan(-1);
    expect(thanksAt).toBeLessThan(sdAt);
    // The -sd- / Secretary signature line is still printed, AND the tiny
    // digital-note closes the receipt (user request): it clarifies that a
    // digitally generated receipt needs no PHYSICAL signature — it replaced
    // the old expectation that banned "no signature required" wording.
    expect(html).toContain('class="rc-digital"');
    expect(html.indexOf('class="rc-digital"')).toBeGreaterThan(sdAt);
  });

  it("renders the same footer bilingually", () => {
    const ml = buildReceiptHtml(base, "ml");
    expect(ml).toContain("\u0d38\u0d41\u0d30\u0d15\u0d4d\u0d37\u0d3e \u0d15\u0d4b\u0d21\u0d4d"); // സുരക്ഷാ കോഡ്
    expect(ml).toContain("\u0d38\u0d46\u0d15\u0d4d\u0d30\u0d1f\u0d4d\u0d1f\u0d31\u0d3f"); // സെക്രട്ടറി
    expect(ml).toContain("WK4M-8Q7Z-T3HD");
    expect(ml).toContain("\u0d38\u0d02\u0d2d\u0d3e\u0d35\u0d28 \u0d30\u0d38\u0d40\u0d24\u0d4d"); // സംഭാവന രസീത്
    expect(ml).toContain('class="rc-sign"');
    expect(ml).toContain("-sd-");
  });

  it("keeps the amount block untouched (words + ₹)", () => {
    expect(html).toContain("₹2,500");
    expect(html).toContain(amountInWords(2500));
  });
});

describe("A4 4-up sheet — every receipt card carries the security code", () => {
  const second: ReceiptData = { ...base, receiptNumber: "MMJM/26/09/002", verificationCode: "A9BX-C2VP-M5KS" };
  const html = buildReceiptSheetHtml([base, second], "en");

  it("renders the code for each receipt and no QR anywhere (shared card design)", () => {
    expect((html.match(/WK4M-8Q7Z-T3HD/g) || []).length).toBe(1);
    expect(html).toContain("A9BX-C2VP-M5KS");
    expect((html.match(/SECURITY CODE/g) || []).length).toBe(2);
    expect(html).not.toContain("rc-qr");
  });

  it("keeps cut guides and sheet footer metadata", () => {
    expect(html).toContain("4 / A4");
    expect(html).toContain("2 receipts");
  });

  it("carries the signature sign-off on the sheet too (shared card design)", () => {
    expect((html.match(/class="rc-sign"/g) || []).length).toBe(2);
    expect((html.match(/>-sd-</g) || []).length).toBe(2);
    expect(html).not.toContain(">Signature<");
  });
});

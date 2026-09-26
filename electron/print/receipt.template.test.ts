import { describe, it, expect } from "vitest";
import { buildReceiptHtml, buildReceiptSheetHtml, amountInWords, formatReceiptAmount, stripIndiaPrefix, type ReceiptData } from "./receipt.template.js";

const donation: ReceiptData = {
  kind: "DONATION",
  receiptNumber: "DON-042",
  date: "15-09-2026",
  payerName: "Haji Abdulla",
  payerDetail: "919876543210",
  line1Label: "Category",
  line1Value: "Zakat",
  line2Label: "Purpose",
  line2Value: "Ramzan fund",
  amount: 1500,
  paymentMethod: "UPI",
  transactionRef: "UPI-334455",
  notes: "Paid via Google Pay",
  mahalluName: "Minz Mahallu",
  mahalluAddress: "Minz Road, Malappuram",
  verificationCode: "AB2C-3D4E-F6GH",
};

const subscription: ReceiptData = {
  kind: "SUBSCRIPTION",
  receiptNumber: "RCP-0007",
  date: "31-08-2026",
  payerName: "Kunju House",
  payerDetail: "FAM-012",
  line1Label: "Month",
  line1Value: "August 2026",
  line2Label: "Monthly due",
  line2Value: "\u20B9150",
  amount: 100,
  paymentMethod: "Cash",
  transactionRef: "",
  mahalluName: "Minz Mahallu",
  footNote: "Balance this month: \u20B950",
};

describe("A6 receipt template", () => {
  it("renders a single A6 receipt with dd-mm-yyyy date, Janab honorific and key fields", () => {
    const html = buildReceiptHtml(donation, "en");
    expect(html).toContain("@page{size:105mm 148mm");
    expect(html).toContain("DON-042");
    expect(html).toContain("15-09-2026");
    // The honorific is a small courtesy span BEFORE the name (user request:
    // "Janab in front of name should be smaller than the name — like Mr./Shri"):
    expect(html).toContain('<span class="rc-hon">Janab</span> Haji Abdulla');
    expect(html).toContain("Zakat");
    expect(html).toContain("DONATION RECEIPT");
    expect(html).not.toContain("2026-09-15"); // never the storage order
  });

  it("donation receipts use the user-requested party block: Donated by / Name / Phone No.", () => {
    const html = buildReceiptHtml(donation, "en");
    expect(html).toContain("Donated by");
    expect(html).toContain('<span class="rc-plabel">Name</span>');
    expect(html).toContain('<span class="rc-plabel">Phone No.</span>');
    expect(html).toContain("9876543210");
    // The old received-from caption belongs to subscription receipts only:
    expect(html).not.toContain("Received with thanks from");
  });

  it("subscription receipts keep the received-from caption and NO Phone No. label", () => {
    // payerDetail on subscription receipts is a family reference (house ·
    // FAM no), not a phone number — labeling it "Phone No." would be wrong.
    const html = buildReceiptHtml(subscription, "en");
    expect(html).toContain("Received with thanks from");
    expect(html).not.toContain("Donated by");
    expect(html).not.toContain("Phone No.");
    expect(html).toContain("FAM-012");
  });

  it("keeps the security code as the footer and thanks just above the sign-off — no app brand, no QR", () => {
    const html = buildReceiptHtml(donation, "en");
    expect(html).toContain("SECURITY CODE");
    expect(html).toContain("AB2C-3D4E-F6GH");
    expect(html).toContain("Minz Road, Malappuram");
    // The 'Minz Mahallu Management System' brand line was removed (user request):
    expect(html).not.toContain('class="rc-app"');
    expect(html).not.toContain("Minz Mahallu Management System");
    // The app-verification hint is gone too (user request: not all users have
    // the app) — the paper carries only the code itself:
    expect(html).not.toContain("Verify this security code");
    expect(html).not.toContain("Minz Mahallu app");
    // The code line sits UNDER the "For <mahallu>" sign-off (user request):
    const forAt = html.indexOf("For Minz Mahallu");
    const codeAt = html.indexOf("AB2C-3D4E-F6GH");
    expect(forAt).toBeGreaterThan(-1);
    expect(codeAt).toBeGreaterThan(forAt);
    // Jazakallahu Khairan sits JUST ABOVE the signature block (user request):
    const thanksAt = html.indexOf("Jazakallahu Khairan.");
    const sdAt = html.indexOf("-sd-");
    expect(thanksAt).toBeGreaterThan(-1);
    expect(sdAt).toBeGreaterThan(-1);
    expect(thanksAt).toBeLessThan(sdAt);
    expect(html).not.toContain("rc-qr");
    expect(html).not.toContain("data:image/svg+xml");
  });

  it("Malayalam sign-off puts the mahallu name FIRST, then മഹല്ലിന് വേണ്ടി (correct ML word order)", () => {
    const html = buildReceiptHtml(donation, "ml");
    const seg = html.slice(html.indexOf('class="rc-for-line"'));
    const line = seg.slice(0, seg.indexOf("</b>"));
    expect(line).toContain("Minz Mahallu");
    // മഹല്ലിന് വേണ്ടി — byte-checked against the template labels
    const forPhrase = "\u0d2e\u0d39\u0d32\u0d4d\u0d32\u0d3f\u0d28\u0d4d \u0d35\u0d47\u0d23\u0d4d\u0d1f\u0d3f";
    expect(line).toContain(forPhrase);
    expect(line.indexOf("Minz Mahallu")).toBeLessThan(line.indexOf(forPhrase));
    // The old label-first order must not come back:
    expect(line).not.toContain(": Minz");
    // Security code stays on the paper, hint stays gone (ML):
    expect(html).toContain("AB2C-3D4E-F6GH");
    expect(html).not.toContain("Minz Mahallu \u0d06\u0d2a\u0d4d\u0d2a"); // 'Minz Mahallu ആപ്പ്'
  });

  it("renders the amount with the en-IN grouping and words", () => {
    const html = buildReceiptHtml(donation, "en");
    expect(html).toContain("\u20B91,500");
    expect(html).toContain("Rupees One Thousand Five Hundred Only");
    expect(amountInWords(1500)).toBe("Rupees One Thousand Five Hundred Only");
    expect(amountInWords(0)).toBe("Rupees Zero Only");
    expect(amountInWords(10000000)).toBe("Rupees One Crore Only");
    expect(amountInWords(125000)).toBe("Rupees One Lakh Twenty-Five Thousand Only");
    expect(formatReceiptAmount(1250.5)).toBe("\u20B91,250.5");
  });

  it("amount-in-words joins the trailing sub-hundred with 'and' (office format)", () => {
    // "Rupees One Thousand Two Hundred and Fifty-Six Only" — the exact
    // format the office asked for:
    expect(amountInWords(1256)).toBe("Rupees One Thousand Two Hundred and Fifty-Six Only");
    expect(amountInWords(105)).toBe("Rupees One Hundred and Five Only");
    expect(amountInWords(1050)).toBe("Rupees One Thousand and Fifty Only");
    // Round amounts stay bare (no trailing "and"):
    expect(amountInWords(1200)).toBe("Rupees One Thousand Two Hundred Only");
    expect(amountInWords(99)).toBe("Rupees Ninety-Nine Only");
    // The paise branch keeps its own long-standing "and":
    expect(amountInWords(10.5)).toBe("Rupees Ten and Fifty Paise Only");
  });

  it("carries the office-verification line under the security code (EN + ML)", () => {
    const en = buildReceiptHtml(donation, "en");
    expect(en).toContain("This can be verified at the Mahallu office");
    const codeAt = en.indexOf("AB2C-3D4E-F6GH");
    // Match the rendered ELEMENT (the stylesheet comment may also mention the
    // phrase — never order-check against <head> text):
    const whereAt = en.indexOf('class="rc-vwhere"');
    expect(codeAt).toBeGreaterThan(-1);
    expect(whereAt).toBeGreaterThan(codeAt); // line sits BELOW the code
    // The removed app hint must stay gone:
    expect(en).not.toContain("Verify this security code");
    expect(en).not.toContain("Minz Mahallu app");
    const ml = buildReceiptHtml(donation, "ml");
    // ഇത് മഹല്ല് ഓഫീസിൽ പരിശോധിക്കാവുന്നതാണ്
    const mlWhere = "\u0d07\u0d24\u0d4d \u0d2e\u0d39\u0d32\u0d4d\u0d32\u0d4d \u0d13\u0d2b\u0d40\u0d38\u0d3f\u0d7d \u0d2a\u0d30\u0d3f\u0d36\u0d4b\u0d27\u0d3f\u0d15\u0d4d\u0d15\u0d3e\u0d35\u0d41\u0d28\u0d4d\u0d28\u0d24\u0d3e\u0d23\u0d4d";
    expect(ml).toContain(mlWhere);
  });

  it("ML payment line label is the natural 'പണമടച്ച രീതി' (never അടവ് രീതി)", () => {
    const html = buildReceiptHtml(donation, "ml");
    // പണമടച്ച രീതി — user-requested wording for the mode-of-payment line:
    const method = "\u0d2a\u0d23\u0d2e\u0d1f\u0d1a\u0d4d\u0d1a \u0d30\u0d40\u0d24\u0d3f";
    expect(html).toContain(method);
    // അടവ് രീതി — the old label must not come back:
    const oldMethod = "\u0d05\u0d1f\u0d35\u0d4d \u0d30\u0d40\u0d24\u0d3f";
    expect(html).not.toContain(oldMethod);
  });

  it("escapes HTML in user-supplied fields", () => {
    const risky: ReceiptData = { ...donation, payerName: "<script>alert(1)</script>", line2Value: "&<>" };
    const html = buildReceiptHtml(risky, "en");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("subscription receipt shows the balance foot note", () => {
    const html = buildReceiptHtml(subscription, "en");
    expect(html).toContain("Balance this month: \u20B950");
    expect(html).toContain("SUBSCRIPTION RECEIPT");
  });

  it("prints the donor phone WITHOUT the 91 country code", () => {
    const html = buildReceiptHtml(donation, "en");
    expect(html).toContain("9876543210");
    expect(html).not.toContain("919876543210");
  });

  it("stripIndiaPrefix only strips real India mobile codes", () => {
    expect(stripIndiaPrefix("919876543210")).toBe("9876543210");
    expect(stripIndiaPrefix("+91 98765 43210")).toBe("98765 43210");
    expect(stripIndiaPrefix("0483 000 0000")).toBe("0483 000 0000"); // landline
    expect(stripIndiaPrefix("999888777666")).toBe("999888777666"); // not 91xxxxxxxxxx
    expect(stripIndiaPrefix("FAM-012")).toBe("FAM-012"); // reference, not a phone
    expect(stripIndiaPrefix("")).toBe("");
  });

  it("closes with the -sd- / Secretary / mahallu sign-off block", () => {
    const html = buildReceiptHtml(donation, "en");
    expect(html).toContain('class="rc-sign"');
    expect(html).toContain("-sd-");
    expect(html).toContain("Secretary");
    expect(html).toContain("For Minz Mahallu");
  });

  it("renders Malayalam labels for ml — ജനാബ് honorific included", () => {
    const html = buildReceiptHtml(donation, "ml");
    expect(html).toContain("\u0d30\u0d38\u0d40\u0d24\u0d4d"); // രസീത്
    expect(html).toContain("\u0d24\u0d40\u0d2f\u0d24\u0d3f"); // തീയതി
    // ജനാബ് as the small honorific span before the name:
    expect(html).toContain('\u0d1c\u0d28\u0d3e\u0d2c\u0d4d</span> Haji Abdulla');
    // സംഭാവന നൽകിയത് (chillu-spelled ൽ = U+0D7D) — the user-requested caption:
    const caption = "\u0d38\u0d02\u0d2d\u0d3e\u0d35\u0d28 \u0d28\u0d7d\u0d15\u0d3f\u0d2f\u0d24\u0d4d";
    expect(html).toContain(caption);
    // ഫോൺ നമ്പർ label (chillu ൺ = U+0D7A):
    expect(html).toContain("\u0d2b\u0d4b\u0d7a \u0d28\u0d2e\u0d4d\u0d2a\u0d7c");
  });

  it("builds a 4-per-A4 sheet with exactly 4 cells per page", () => {
    const list = [donation, subscription, { ...donation, receiptNumber: "DON-043" }, { ...donation, receiptNumber: "DON-044" }, { ...donation, receiptNumber: "DON-045" }];
    const html = buildReceiptSheetHtml(list, "en");
    expect(html).toContain("@page{size:A4 portrait");
    const sheets = html.match(/<section class="sheet">/g) || [];
    expect(sheets.length).toBe(2); // 5 receipts → 2 sheets
    const cells = html.match(/<div class="cell">/g) || [];
    expect(cells.length).toBe(8); // padded to full 2x2 grids
    expect(html).toContain("DON-045");
    expect(html).toContain("5 receipts"); // footer count
  });
});

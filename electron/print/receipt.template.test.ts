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
    // "Janab in front of name should be smaller than the name — like Mr./Shri"),
    // with the single space INSIDE the small span (user request: the space
    // between Janab and the name must not render at the name's 13pt size):
    expect(html).toContain('<span class="rc-hon">Janab </span>Haji Abdulla');
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

  it("Malayalam subscription caption reads like the donation one (user request)", () => {
    // User request: the old caption "ഇവരിൽ നിന്ന് സ്വീകരിച്ചത്" was not
    // correct/natural Malayalam — the subscription receipt must use the same
    // construction as the donation receipt (സംഭാവന നൽകിയത്): വരിസംഖ്യ നൽകിയത്.
    const html = buildReceiptHtml(subscription, "ml");
    const caption = "\u0d35\u0d30\u0d3f\u0d38\u0d02\u0d16\u0d4d\u0d2f \u0d28\u0d7d\u0d15\u0d3f\u0d2f\u0d24\u0d4d"; // വരിസംഖ്യ നൽകിയത് (ഖ = U+0D16)
    expect(html).toContain(caption);
    // The awkward "received from" wording must never come back:
    const oldCaption = "\u0d07\u0d35\u0d30\u0d3f\u0d7d \u0d28\u0d3f\u0d28\u0d4d\u0d28\u0d4d \u0d38\u0d4d\u0d35\u0d40\u0d15\u0d30\u0d3f\u0d1a\u0d4d\u0d1a\u0d24\u0d4d"; // ഇവരിൽ നിന്ന് സ്വീകരിച്ചത്
    expect(html).not.toContain(oldCaption);
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

  it("closes with the small digital-receipt note as the VERY last line (EN + ML)", () => {
    const en = buildReceiptHtml(donation, "en");
    expect(en).toContain('class="rc-digital"');
    expect(en).toContain("Digitally generated receipt \u2014 no signature required");
    // It is the last footer element — BELOW the office-verify line (user
    // request: "at the very end of receipts write in small"):
    const whereAt = en.indexOf('class="rc-vwhere"');
    const digitalAt = en.indexOf('class="rc-digital"');
    expect(whereAt).toBeGreaterThan(-1);
    expect(digitalAt).toBeGreaterThan(whereAt);
    // ML receipts carry the natural Malayalam wording (ഡിജിറ്റലായി
    // തയ്യാറാക്കിയ രസീത് — ഒപ്പ് ആവശ്യമില്ല):
    const ml = buildReceiptHtml(donation, "ml");
    const mlNote =
      "\u0d21\u0d3f\u0d1c\u0d3f\u0d31\u0d4d\u0d31\u0d32\u0d3e\u0d2f\u0d3f " +
      "\u0d24\u0d2f\u0d4d\u0d2f\u0d3e\u0d31\u0d3e\u0d15\u0d4d\u0d15\u0d3f\u0d2f " +
      "\u0d30\u0d38\u0d40\u0d24\u0d4d \u2014 \u0d12\u0d2a\u0d4d\u0d2a\u0d4d " +
      "\u0d06\u0d35\u0d36\u0d4d\u0d2f\u0d2e\u0d3f\u0d32\u0d4d\u0d32";
    expect(ml).toContain(mlNote);
    // Receipts WITHOUT a security code still end with the note:
    const bare = buildReceiptHtml(subscription, "en");
    expect(bare).toContain("Digitally generated receipt \u2014 no signature required");
    // The 4-per-A4 sheet shares the same card, so it carries it too:
    const sheet = buildReceiptSheetHtml([donation, subscription, donation, subscription], "en");
    expect(sheet).toContain("Digitally generated receipt \u2014 no signature required");
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
    // ജനാബ് as the small honorific span before the name (space inside the span):
    expect(html).toContain('\u0d1c\u0d28\u0d3e\u0d2c\u0d4d </span>Haji Abdulla');
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

  it("sheet cells are FULL A6 height with cutting marks (user report)", () => {
    // User report: the batch sheet's cells were 140.5mm (7.5mm shorter than
    // a real A6) — the subscription receipt's amount box clipped in the
    // sheet, and a large vacant strip stayed at the A4 bottom. Cells are now
    // full 148mm A6 (296 of the 297mm page filled) with solid crop ticks at
    // the sheet edges on both cut lines.
    const html = buildReceiptSheetHtml([donation, subscription], "en");
    expect(html).toContain("grid-template-rows:148mm 148mm");
    expect(html).toContain(".cell .rc{border:0;width:105mm;height:148mm}");
    // No shrunken 140.5mm cells anywhere:
    expect(html).not.toContain("140.5mm");
    // Cutting marks: 4 solid ticks per sheet, on the two cut lines:
    expect(html).toContain('.tk-l{left:0;top:147.8mm;width:5mm;height:.4mm}');
    expect(html).toContain('.tk-r{right:0;top:147.8mm;width:5mm;height:.4mm}');
    expect(html).toContain('.tk-t{top:0;left:104.8mm;width:.4mm;height:5mm}');
    expect(html).toContain('.tk-b{bottom:0;left:104.8mm;width:.4mm;height:5mm}');
    expect(html.match(/<i class="tk tk-l"><\/i>/g)?.length).toBe(1);
    // Dashed inner guides still span the full rows:
    expect(html).toContain(".cell:nth-child(odd){border-right:.25mm dashed #9db3aa}");
    expect(html).toContain(".cell:nth-child(-n+2){border-bottom:.25mm dashed #9db3aa}");
  });

  it("footer stack is compact so the amount box is never cut (user report)", () => {
    // User report (v2.6.1): "in receipt pdf the amount box is cut, adjust the
    // verification code and below text size to see the amount box". The card
    // is a fixed-height flex column — a tall footer squeezed the body until
    // the bottom-pinned amount box clipped. These pins hold the reclaim:
    const css = buildReceiptHtml(donation, "en").split("</style>")[0];
    // Verification code line + everything under it, shrunk:
    expect(css).toContain(".rc-vcode{font-size:6.6pt");
    expect(css).toContain(".rc-vcap{font-size:4.8pt");
    expect(css).toContain(".rc-vwhere{font-size:4.8pt");
    expect(css).toContain(".rc-digital{font-size:4.8pt");
    // …running on a tight line-height (the default ~1.5 was costing ~9mm):
    expect(css).toContain(".rc-verify{display:flex;flex-direction:column;justify-content:center;align-items:center;gap:.3mm;border-top:.2mm dashed #c9d8d2;padding-top:1mm;line-height:1.25}");
    expect(css).toMatch(/\.rc-sign\{[^}]*line-height:1\.25\}/);
    // Notes / balance foot-note sit AFTER the amount box and must be the
    // flex shrink-absorbers — extreme notes squeeze first, never the amount:
    expect(css).toMatch(/\.rc-notes\{min-height:0;overflow:hidden;/);
    expect(css).toMatch(/\.rc-foot-note\{min-height:0;overflow:hidden;/);
    // The amount figure itself stays the hero of the card:
    expect(css).toContain(".rc-amount b{font-size:16pt");
    // The compaction lives in baseCss, so the 4-per-A4 sheet inherits it:
    const sheetCss = buildReceiptSheetHtml([donation], "en").split("</style>")[0];
    expect(sheetCss).toContain(".rc-vcode{font-size:6.6pt");
    expect(sheetCss).toMatch(/\.rc-notes\{min-height:0;overflow:hidden;/);
  });
});

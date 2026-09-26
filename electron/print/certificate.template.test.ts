/*
 * Certificate template — regression guard for the anti-forgery security-code
 * box.
 *
 * enrichCertificate() used to drop verification_code/reprint_count while
 * building its enriched copy, which silently removed the ENTIRE verify box
 * from every certificate print. These tests pin the contract: the security
 * code + hint survive enrichment and render on every certificate — and the
 * printed output carries NO QR image (security code only, by design).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDB } from "../db/connection.js";
import { buildCertificateHtml } from "../print/certificate.template.js";
import { getPreviewScreenCss } from "../print/utils.js";

describe("certificate security-code box renders on every certificate (no QR)", () => {
  beforeAll(() => { getDB(); /* schema + demo provisioning */ });

  const types = ["Membership", "Residence", "Marriage", "NOC", "Death"] as const;

  for (const type of types) {
    it(`renders the security code (no QR) on the ${type} certificate`, () => {
      const html = buildCertificateHtml(
        {
          id: 1,
          certificate_number: `MMJM/XX/26/09/001`,
          type,
          member_id: null,
          family_id: null,
          marriage_id: null,
          death_id: null,
          issued_to: "Regression Test Person",
          issued_date: "2026-09-03",
          issued_by: 1,
          status: "Issued",
          notes: "",
          verification_code: "AB2C-3D4E-F6GH",
          reprint_count: 0,
        },
        "en",
        0,
        undefined
      );
      // The verify box with the code…
      expect(html).toContain("AB2C-3D4E-F6GH");
      expect(html).toContain("SECURITY CODE");
      // …and NO QR image — receipts/certificates carry the security code only.
      expect(html).not.toContain('class="verify-qr"');
      expect(html).not.toContain("data:image/svg+xml");
      // …and NO app-verification hint (user request: not all users have the
      // app, so the paper carries only the code itself).
      expect(html).not.toContain("can be verified using");
      expect(html).not.toContain("Minz Mahallu app");
    });
  }

  it("header: register stacks share the FIRST grid row with the mahallu name (no stranded second row)", () => {
    const html = buildCertificateHtml(
      {
        certificate_number: "MMJM/MB/26/09/012",
        type: "Membership",
        issued_to: "Header Alignment Person",
        issued_date: "2026-09-03",
        issued_by: 1,
        verification_code: "AB2C-3D4E-F6GH",
      },
      "en"
    );
    // The side reg stacks used to auto-place onto a SECOND grid row (their
    // explicit column sits behind the auto-placement cursor after hdr-main),
    // leaving the register numbers one full name-height below the top line.
    // Both stacks are now pinned to row 1 — flush with the mahallu name.
    expect(html).toMatch(/\.hdr\{[^}]*grid-template-columns:40mm 1fr 40mm/);
    expect(html).not.toMatch(/\.hdr\{[^}]*padding-top/); // no dead space above
    expect(html).toMatch(/\.hdr \.reg-stack\.right\{grid-column:3;grid-row:1\}/);
    expect(html).toMatch(/\.hdr \.reg-stack\.left\{grid-column:1;grid-row:1/);
  });

  it("keeps the code when the caller passes extra enriched fields (enrichment must not drop it)", () => {
    // This is the exact regression: enrichCertificate rebuilt the object and
    // omitted verification_code — the box vanished although the code existed.
    const html = buildCertificateHtml(
      {
        certificate_number: "MMJM/MB/26/09/009",
        type: "Membership",
        member_id: 1,
        issued_to: "Enriched Member",
        issued_date: "2026-09-03",
        issued_by: 1,
        verification_code: "ZZ9Y-8X7W-V6U5",
      },
      "en"
    );
    expect(html).toContain("ZZ9Y-8X7W-V6U5");
    expect(html).toContain("SECURITY CODE");
    expect(html).not.toContain('class="verify-qr"');
  });

  it("shows a reprint note when the print is a reprint", () => {
    const html = buildCertificateHtml(
      {
        certificate_number: "MMJM/MB/26/09/010",
        type: "Membership",
        issued_to: "Reprint Person",
        issued_date: "2026-09-03",
        issued_by: 1,
        verification_code: "AB2C-3D4E-F6GH",
      },
      "en",
      2,
      "03-09-2026 12:00"
    );
    expect(html).toContain("Reprinted on");
    expect(html).toContain("03-09-2026 12:00");
  });

  it("pins the security code to the page BOTTOM in small text (office request)", () => {
    // The office asked for the code to sit at the bottom of the sheet in a
    // small, unobtrusive line — not a bordered box inside the document body.
    const html = buildCertificateHtml(
      {
        certificate_number: "MMJM/MB/26/09/011",
        type: "Membership",
        issued_to: "Bottom Line Person",
        issued_date: "2026-09-03",
        issued_by: 1,
        verification_code: "AB2C-3D4E-F6GH",
      },
      "en"
    );
    const boxCss = /\.verify-box\{[^}]*\}/.exec(html)?.[0] ?? "";
    expect(boxCss).toContain("position:absolute");
    expect(boxCss).toContain("bottom:");
    // Small text: label 6pt, code 8pt (was a 10.5pt bordered box); the hint
    // rule is gone along with the hint line itself.
    expect(html).toMatch(/\.verify-label\{[^}]*font-size:6pt/);
    expect(html).toMatch(/\.verify-code\{[^}]*font-size:8pt/);
    expect(html).not.toContain("verify-hint");
    // Out of the document flow: no tinted panel any more.
    expect(boxCss).not.toContain("background:#f2faf6");
  });
});

describe("certificate wording source of truth (user-ratified EN + ML)", () => {
  beforeAll(() => { getDB(); });

  const base = {
    certificate_number: "MMJM/XX/26/09/001", type: "Membership",
    member_id: null, family_id: null, marriage_id: null, death_id: null,
    issued_to: "Wording Test Person", issued_date: "2026-09-03", issued_by: 1,
    status: "Issued", notes: "", verification_code: "AB2C-3D4E-F6GH", reprint_count: 0,
  };

  it("NIKAH certificate: Nikah (never marriage) used consistently + new field names (EN)", () => {
    const html = buildCertificateHtml({ ...base, type: "Marriage", marriage_id: 1 }, "en");
    expect(html).toContain("NIKAH CERTIFICATE");
    expect(html).toContain("Recorded in the Mahallu Nikah Register");
    expect(html).not.toContain("MARRIAGE CERTIFICATE");
    expect(html).toContain("Bridegroom's Name");
    expect(html).toContain("Bride's Name");
    expect(html).toContain("Father's Name");
    expect(html).not.toContain("Son of");
    expect(html).not.toContain("Daughter of");
    expect(html).toContain("Place of Nikah");
    expect(html).toContain("Date of Registration");
    expect(html).toContain("This is to certify that the above Nikah is duly recorded in the Mahallu Nikah Register.");
  });

  it("നികാഹ് സർട്ടിഫിക്കറ്റ്: user-approved Malayalam field wording (ML)", () => {
    const html = buildCertificateHtml({ ...base, type: "Marriage", marriage_id: 1 }, "ml");
    expect(html).toContain("മഹല്ല് നികാഹ് രജിസ്റ്ററിൽ രേഖപ്പെടുത്തിയിരിക്കുന്നത്");
    expect(html).toContain("നികാഹ് നടന്ന സ്ഥലം");
    expect(html).toContain("മേൽപ്പറഞ്ഞ നികാഹ് മഹല്ല് നികാഹ് രജിസ്റ്ററിൽ രേഖപ്പെടുത്തിയിട്ടുണ്ടെന്ന് സാക്ഷ്യപ്പെടുത്തുന്നു.");
  });

  it("MEMBERSHIP certificate: Member's Name / Mobile No. / above-named person (EN)", () => {
    const html = buildCertificateHtml({ ...base, type: "Membership", member_id: 1 }, "en");
    expect(html).toContain("Recorded in the Mahallu Membership Register");
    expect(html).toContain("Member's Name");
    expect(html).toContain("Mobile No.");
    expect(html).not.toContain("Name of Member");
    expect(html).toContain("This is to certify that the above-named person is a registered member of this Mahallu.");
  });

  it("അംഗത്വ സർട്ടിഫിക്കറ്റ്: user-approved Malayalam wording (ML)", () => {
    const html = buildCertificateHtml({ ...base, type: "Membership", member_id: 1 }, "ml");
    expect(html).toContain("മഹല്ല് അംഗത്വ രജിസ്റ്ററിൽ രേഖപ്പെടുത്തിയിരിക്കുന്നത്");
    expect(html).toContain("രക്തഗ്രൂപ്പ്");
    expect(html).toContain("മേൽപ്പറഞ്ഞ വ്യക്തി ഈ മഹല്ലിലെ അംഗമായി രജിസ്റ്റർ ചെയ്തിട്ടുണ്ടെന്ന് സാക്ഷ്യപ്പെടുത്തുന്നു.");
  });

  it("RESIDENCE certificate: Head of Family / PIN Code / Phone No. (EN)", () => {
    const html = buildCertificateHtml({ ...base, type: "Residence", family_id: 1 }, "en");
    expect(html).toContain("Recorded in the Mahallu Family Register");
    expect(html).toContain("Head of Family");
    expect(html).toContain("PIN Code");
    expect(html).toContain("Phone No.");
    expect(html).not.toContain("Family Head");
    expect(html).toContain("This is to certify that the above-named family resides within this Mahallu.");
  });

  it("താമസ സർട്ടിഫിക്കറ്റ്: user-approved Malayalam wording (ML)", () => {
    const html = buildCertificateHtml({ ...base, type: "Residence", family_id: 1 }, "ml");
    expect(html).toContain("മഹല്ല് കുടുംബ രജിസ്റ്ററിൽ രേഖപ്പെടുത്തിയിരിക്കുന്നത്");
    expect(html).toContain("മേൽപ്പറഞ്ഞ കുടുംബം ഈ മഹല്ലിൽ താമസിക്കുന്നതായി സാക്ഷ്യപ്പെടുത്തുന്നു.");
  });

  it("DEATH certificate: clean opening statement + Local Body / PIN Code (EN)", () => {
    const html = buildCertificateHtml({ ...base, type: "Death", death_id: 1 }, "en");
    expect(html).toContain("Recorded in the Mahallu Death Register");
    expect(html).toContain("This is to certify that the following particulars are recorded in the Mahallu Death Register.");
    expect(html).not.toContain("has been taken from the original record of death");
    expect(html).toContain("Permanent Address");
    expect(html).toContain("Date of Death");
    expect(html).toContain("Place of Death");
    expect(html).toContain("Father / Mother / Husband / Wife");
    // PIN Code + Local Body render with the jurisdiction rows (Settings-filled).
    const db = getDB();
    const prev = db.prepare("SELECT village, panchayath, taluk, district, pincode, state FROM settings WHERE id = 1").get() as any;
    try {
      db.prepare("UPDATE settings SET village = 'Test Village', panchayath = 'Test Panchayat', taluk = 'Test Taluk', district = 'Test District', pincode = '676304', state = 'Kerala' WHERE id = 1").run();
      const withJuris = buildCertificateHtml({ ...base, type: "Death", death_id: 1 }, "en");
      expect(withJuris).toContain("Local Body");
      expect(withJuris).toContain("PIN Code");
      expect(withJuris).not.toContain("Corporation / Municipality / Panchayat");
      expect(withJuris).not.toContain("Pincode");
    } finally {
      db.prepare("UPDATE settings SET village = ?, panchayath = ?, taluk = ?, district = ?, pincode = ?, state = ? WHERE id = 1")
        .run(prev?.village ?? null, prev?.panchayath ?? null, prev?.taluk ?? null, prev?.district ?? null, prev?.pincode ?? null, prev?.state ?? null);
    }
  });

  it("മരണ സർട്ടിഫിക്കറ്റ്: user-approved Malayalam wording (ML)", () => {
    const html = buildCertificateHtml({ ...base, type: "Death", death_id: 1 }, "ml");
    expect(html).toContain("താഴെപ്പറയുന്ന മരണവിവരങ്ങൾ മഹല്ല് മരണ രജിസ്റ്ററിൽ രേഖപ്പെടുത്തിയിട്ടുള്ളതാണെന്ന് സാക്ഷ്യപ്പെടുത്തുന്നു.");
    expect(html).toContain("സ്ഥിര വിലാസം");
    // ഗ്രാമം / തദ്ദേശ സ്വയംഭരണ സ്ഥാപനം render with the jurisdiction row.
    const db = getDB();
    const prev = db.prepare("SELECT village, panchayath, taluk, district, pincode, state FROM settings WHERE id = 1").get() as any;
    try {
      db.prepare("UPDATE settings SET village = 'ടെസ്റ്റ് ഗ്രാമം', panchayath = 'ടെസ്റ്റ് പഞ്ചായത്ത്', taluk = 'ടെസ്റ്റ് താലൂക്ക്', district = 'മലപ്പുറം', pincode = '676304', state = 'കേരളം' WHERE id = 1").run();
      const withJuris = buildCertificateHtml({ ...base, type: "Death", death_id: 1 }, "ml");
      expect(withJuris).toContain("ഗ്രാമം");
      expect(withJuris).toContain("തദ്ദേശ സ്വയംഭരണ സ്ഥാപനം");
      expect(withJuris).not.toContain("കോർപ്പറേഷൻ");
      expect(withJuris).not.toContain("വില്ലേജ്");
    } finally {
      db.prepare("UPDATE settings SET village = ?, panchayath = ?, taluk = ?, district = ?, pincode = ?, state = ? WHERE id = 1")
        .run(prev?.village ?? null, prev?.panchayath ?? null, prev?.taluk ?? null, prev?.district ?? null, prev?.pincode ?? null, prev?.state ?? null);
    }
  });

  it("Registration number boxes carry full 'Registration No.' spelling (EN + ML)", () => {
    const db = getDB();
    const prev = db.prepare("SELECT society_reg_no, affiliation_number, wakf_reg_no FROM settings WHERE id = 1").get() as any;
    try {
      db.prepare("UPDATE settings SET society_reg_no = 'SOC/1975', affiliation_number = 'SMF/123', wakf_reg_no = 'WKF/45' WHERE id = 1").run();
      const en = buildCertificateHtml({ ...base, type: "Membership" }, "en");
      expect(en).toContain("Society Registration No.");
      expect(en).toContain("SMF Registration No.");
      expect(en).toContain("Waqf Registration No.");
      expect(en).not.toContain("Wakaf");
      expect(en).not.toContain("Society Reg. No.");
      const ml = buildCertificateHtml({ ...base, type: "Membership" }, "ml");
      expect(ml).toContain("സൊസൈറ്റി രജിസ്ട്രേഷൻ നമ്പർ");
      expect(ml).toContain("വഖഫ് രജിസ്ട്രേഷൻ നമ്പർ");
    } finally {
      db.prepare("UPDATE settings SET society_reg_no = ?, affiliation_number = ?, wakf_reg_no = ? WHERE id = 1")
        .run(prev?.society_reg_no ?? null, prev?.affiliation_number ?? null, prev?.wakf_reg_no ?? null);
    }
  });

  it("signature block uses ONE organization name on every line", () => {
    const html = buildCertificateHtml({ ...base, type: "Membership" }, "en");
    expect(html).toContain("Mahallu Management Committee");
    expect(html).not.toContain(">Mahallu Committee<");
  });

  it("secretary-only signature on membership/residence/NOC; full panel ONLY on the Nikah certificate (user request)", () => {
    for (const type of ["Membership", "Residence", "NOC"] as const) {
      const html = buildCertificateHtml({ ...base, type, member_id: type === "Membership" ? 1 : null, family_id: type === "Residence" ? 1 : null, marriage_id: type === "NOC" ? 1 : null }, "en");
      expect(html).toContain("Secretary");
      expect(html).toContain('class="sig-area single"'); // one right-aligned box
      expect(html).not.toContain(">President<");
      expect(html).not.toContain(">Imam / Qazi<");
    }
    // The Nikah certificate keeps the full 3-sign panel:
    const nikah = buildCertificateHtml({ ...base, type: "Marriage", marriage_id: 1 }, "en");
    expect(nikah).toContain(">President<");
    expect(nikah).toContain(">Secretary<");
    expect(nikah).toContain(">Imam / Qazi<");
    expect(nikah).not.toContain('class="sig-area single"');
    // The death certificate has its own dedicated secretary block (unchanged):
    const death = buildCertificateHtml({ ...base, type: "Death", death_id: 1 }, "en");
    expect(death).toContain("Mahallu Secretary");
    expect(death).not.toContain(">President<");
  });

  it("office-verification line sits under the security code (EN + ML)", () => {
    const en = buildCertificateHtml({ ...base, type: "Membership" }, "en");
    expect(en).toContain("This can be verified at the Mahallu office");
    const codeAt = en.indexOf("AB2C-3D4E-F6GH");
    // Match the rendered ELEMENT (the stylesheet comment may also mention the
    // phrase — never order-check against <head> text):
    const whereAt = en.indexOf('class="verify-where"');
    expect(codeAt).toBeGreaterThan(-1);
    expect(whereAt).toBeGreaterThan(codeAt);
    // The removed APP hint must stay gone (this line points at the office):
    expect(en).not.toContain("can be verified using");
    expect(en).not.toContain("Minz Mahallu app");
    const ml = buildCertificateHtml({ ...base, type: "Membership" }, "ml");
    // ഇത് മഹല്ല് ഓഫീസിൽ പരിശോധിക്കാവുന്നതാണ്
    expect(ml).toContain("\u0d07\u0d24\u0d4d \u0d2e\u0d39\u0d32\u0d4d\u0d32\u0d4d \u0d13\u0d2b\u0d40\u0d38\u0d3f\u0d7d \u0d2a\u0d30\u0d3f\u0d36\u0d4b\u0d27\u0d3f\u0d15\u0d4d\u0d15\u0d3e\u0d35\u0d41\u0d28\u0d4d\u0d28\u0d24\u0d3e\u0d23\u0d4d");
  });

  it("landscape death certificate pads the top like the portrait sheets (title clear of the frame)", () => {
    // User report: the death certificate title sat too close to the border —
    // "need some offset as in other certificate". Portrait pads 13mm; the
    // landscape sheet must match (the old 9mm put the header ON the inner
    // frame line, which is inset exactly 9mm).
    const death = buildCertificateHtml({ ...base, type: "Death", death_id: 1 }, "en");
    expect(death).toContain("padding:13mm 13mm 9mm");
    const portrait = buildCertificateHtml({ ...base, type: "Membership" }, "en");
    expect(portrait).toContain("padding:13mm 15mm");
    expect(portrait).not.toContain("padding:9mm 13mm");
  });
});

describe("every certificate fits ONE A4 page (no spill onto a second sheet)", () => {
  // The mahallu's death certificate ran past a single A4 landscape sheet.
  // The guard: html/body and .cert use a FIXED height (not min-height) with
  // overflow:hidden and a @page size that matches — Chromium then paginates
  // into exactly one sheet, clipping instead of spilling. The 0.3mm shave
  // absorbs Chromium's 96dpi page-height rounding (the blank-trailing-page
  // trap).
  const base = {
    member_id: null, family_id: null, marriage_id: null, death_id: null,
    issued_to: "One Page Person", issued_date: "2026-09-03", issued_by: 1,
    status: "Issued", notes: "", verification_code: "AB2C-3D4E-F6GH", reprint_count: 0,
  };

  for (const type of ["Membership", "Residence", "Marriage", "NOC", "Death"] as const) {
    it(`${type}: fixed-height page box with overflow clipping`, () => {
      const html = buildCertificateHtml(
        { ...base, id: 1, certificate_number: `MMJM/XX/26/09/001`, type },
        "en"
      );
      // Landscape exactly for the death certificate, portrait otherwise.
      const expectedSize = type === "Death" ? "A4 landscape" : "A4 portrait";
      expect(html).toContain(`@page{size:${expectedSize};margin:0}`);
      // FIXED height (never min-height — that grows and spills).
      expect(html).not.toContain("min-height:");
      // Overflow is clipped, not paginated.
      expect(html).toMatch(/html,body\{[^}]*overflow:hidden/);
      expect(html).toMatch(/\.cert\{[^}]*overflow:hidden/);
      // The box height is a hair UNDER the sheet (209.7mm landscape /
      // 296.7mm portrait) to absorb Chromium's rounding.
      expect(html).toContain(type === "Death" ? "height:209.7mm" : "height:296.7mm");
      // Long-field safety: the certificate body also clips.
      expect(html).toMatch(/\.cert\{[^}]*height:(209\.7|296\.7)mm/);
    });
  }
});

describe("preview popup styles come from the separate stylesheet (no inline <style> in components)", () => {
  const base = {
    certificate_number: "MMJM/MB/26/09/009", type: "Membership",
    issued_to: "Preview Test", issued_date: "2026-09-04", issued_by: 1,
    status: "Issued", notes: "", verification_code: "AB2C-3D4E-F6GH", reprint_count: 0,
  };

  it("getPreviewScreenCss() resolves the resources/templates stylesheet", () => {
    const css = getPreviewScreenCss();
    expect(css.length).toBeGreaterThan(100);
    // The on-screen rules the preview popup depends on.
    expect(css).toContain("zoom: 1.35");
    expect(css).toContain("@media print");
  });

  it("screen css keeps the preview window scrollable (print lock must not leak to screen)", () => {
    // The print template hardens html/body to one A4 box with
    // height:296.7mm + overflow:hidden (no 2nd-page spill). If the screen
    // stylesheet fails to override BOTH properties the preview popup is
    // clipped to a single A4-height box and cannot scroll at all.
    const css = getPreviewScreenCss();
    expect(css).toContain("height: auto !important");
    expect(css).toContain("overflow: visible !important");
    // Centering must be overflow-safe: centered flex alignment on an
    // overflowing flex child pushes the left half above the scroll origin
    // (permanently unreachable); auto margins fall back to the start edge.
    const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, ""); // strip comments
    expect(cssCode).not.toContain("justify-content");
    expect(cssCode).toContain("margin: 0 auto");
    // Centering only works if html stays a plain block (a flex html makes
    // body shrink-wrap to the certificate width → page hugs the left edge).
    expect(cssCode).toMatch(/html\s*{[^}]*display:\s*block/);
    // The certificate must never flex-shrink: a squashed A4 page would clip
    // its right edge (overflow:hidden) instead of scrolling on narrow windows.
    expect(cssCode).toMatch(/body > \.cert\s*{[^}]*flex:\s*none/);
  });

  it("print reset re-locks the anti-spill geometry (printing from the preview window)", () => {
    // The screen rules are !important and apply in every medium, so the
    // @media print reset must re-assert the template's print contract:
    // block flow + overflow clipping (fixed reprint note) so printing from
    // the preview still yields exactly one page.
    const css = getPreviewScreenCss();
    const m = css.match(/@media print\s*{[\s\S]*$/);
    expect(m).not.toBeNull();
    const printBlock = m![0];
    expect(printBlock).toContain("overflow: hidden !important");
    expect(printBlock).toContain("display: block");
  });

  it("embeds the preview stylesheet when extraHeadCss is passed (preview popup)", () => {
    const html = buildCertificateHtml(base, "ml", 0, undefined, getPreviewScreenCss());
    expect(html).toContain('<style data-src="templates/preview-screen.css">');
    expect(html).toContain("zoom: 1.35");
    expect(html).toContain("@media print");
  });

  it("PDF path (no extraHeadCss) stays free of preview styling", () => {
    const html = buildCertificateHtml(base, "en");
    expect(html).not.toContain("templates/preview-screen.css");
    expect(html).not.toContain("zoom: 1.35");
  });
});

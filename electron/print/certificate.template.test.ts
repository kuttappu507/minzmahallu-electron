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
      // …and the app-verification hint.
      expect(html).toContain("Verify this security code using the Minz Mahallu app or at the mahallu office");
    });
  }

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

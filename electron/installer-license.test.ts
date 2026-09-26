import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The installer's LICENSE AGREEMENT page used to render Malayalam as an
// unformatted blob (user report: "paragraph is not there, formatting is not
// done"), and STILL rendered it as "some symbol words mixture" in v2.4.14.
// TWO causes, both pinned here:
//   1. build/license.txt had LF-only line endings — NSIS's RichEdit license
//      control needs CRLF, so every break vanished into one giant paragraph.
//   2. THE v2.4.14 REGRESSION: package.json's build.nsis.license explicitly
//      pointed at "build/license.txt" (config leftover). An EXPLICIT
//      build.license key bypasses electron-builder's license.rtf-first
//      discovery (app-builder-lib license.js -> packager.getResource(custom)
//      uses the custom path directly), so the professional license.rtf was
//      NEVER loaded — NSIS streamed the UTF-8 .txt as ANSI text and the
//      Malayalam bytes rendered as cp1252 mojibake ("à´®à´¹...").
// The wiring pin below (build.nsis.license === "build/license.rtf") exists
// exactly so this drift can never ship again.
// Content source of truth: scripts/gen-license-rtf.py (regenerates both).

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

const RTF = read("../build/license.rtf");
const TXT = read("../build/license.txt");

// Decode \uNNNN? escapes so Malayalam can be asserted literally.
const decoded = RTF.replace(/\\u(-?\d+)\?/g, (_, n) =>
  String.fromCodePoint(Number(n) % 65536)
);

const ML_GOOD = [
  "ഡിസ്ക്ലെയ്മർ", // title
  "പൂർണ്ണ സൗജന്യം", // 1
  "വാറന്റി ഇല്ല", // 2
  "ഉത്തരവാദിത്ത പരിധി", // 3
  "വരിസംഖ്യകൾ", // 4 — subscriptions use the app term
  "സംഭാവനകൾ", // 4 — donations use the app term
  "ബാക്കപ്പ്", // 4
  "നടത്തിപ്പിനായി", // 1 — നടത്തിപ്പ്, never ഭരണം
  "സമ്മതം", // 6
];
const ML_BANNED = [
  "ലൈസൻസ് ഫീസ്", // v2.4.13 wording (no ഫീസ് per i18n authority)
  "ഭരണത്തിനായി", // v2.4.13 wording (ഭരണം is banned)
  "സബ്സ്ക്രിപ്ഷൻ", // never for subscriptions
];

describe("installer license page (license.rtf)", () => {
  it("package.json build.nsis.license points at the RTF (v2.4.14 mojibake regression pin)", () => {
    // v2.4.14 shipped the installer with build.license = "build/license.txt",
    // so the RTF was never loaded and Malayalam rendered as ANSI mojibake.
    const pkg = JSON.parse(read("../package.json"));
    expect(pkg.build.nsis.license).toBe("build/license.rtf");
    // ...and the pointed-at file really exists (an explicit build.license
    // that 404s makes electron-builder throw InvalidConfigurationError at
    // build time — better to catch it here, in CI, before that):
    expect(() => read("../build/license.rtf")).not.toThrow();
  });

  it("is a single-line pure-ASCII RTF document (deterministic in RichEdit)", () => {
    expect(RTF.startsWith("{\\rtf1")).toBe(true);
    expect(RTF.endsWith("}")).toBe(true);
    expect(RTF).not.toContain("\n"); // raw newlines would become stray \par
    expect(RTF.endsWith("}")).toBe(true);
    for (const ch of RTF) expect(ch.charCodeAt(0)).toBeLessThan(128);
    expect(RTF.split("{").length).toBe(RTF.split("}").length); // balanced
  });

  it("declares the Malayalam-capable font (Nirmala UI) and brand teal", () => {
    expect(RTF).toContain("Nirmala UI");
    expect(RTF).toContain("Segoe UI");
    expect(RTF).toContain("\\red13\\green148\\blue142");
    // ML runs are wrapped in \f1 (Nirmala UI)
    expect(RTF).toContain("{\\f1 ");
  });

  it("carries every Malayalam section heading and approved terminology", () => {
    for (const term of ML_GOOD) expect(decoded).toContain(term);
    for (const term of ML_BANNED) expect(decoded).not.toContain(term);
    for (const en of ["FREE SOFTWARE", "NO WARRANTY", "ACCEPTANCE", "YOUR DATA IS YOUR RESPONSIBILITY"]) {
      expect(decoded).toContain(en);
    }
  });

  it("uses real paragraphs (\\par spacing), not one blob", () => {
    // 6 sections × (2 headings + 2 bodies) + title pair + separators
    expect(decoded.split("\\par").length).toBeGreaterThan(40);
  });
});

describe("installer license.txt fallback", () => {
  it("is CRLF-only (the original blob bug was LF-only line endings)", () => {
    const bytes = readFileSync(
      fileURLToPath(new URL("../build/license.txt", import.meta.url))
    );
    const lf = [...bytes].filter((b) => b === 0x0a).length;
    const crlf = (bytes.toString("latin1").match(/\r\n/g) || []).length;
    expect(crlf).toBeGreaterThan(0);
    expect(crlf).toBe(lf);
  });

  it("matches the RTF terminology (approved terms in, banned terms out)", () => {
    for (const term of ML_GOOD) expect(TXT).toContain(term);
    for (const term of ML_BANNED) expect(TXT).not.toContain(term);
  });
});

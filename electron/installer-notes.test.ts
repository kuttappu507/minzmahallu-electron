import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The uninstaller's MessageBoxes carry bilingual EN+ML notes. A past release
// crammed the Malayalam into a single parenthetical line right after the
// English text (user report: "paragraph is not there, formatting is not
// done — do it professionally like in English"). These pins keep the
// Malayalam formatted exactly like the English: its own block behind the
// "— — — മലയാളം — — —" divider (same style as the KEEP-THIS-FOLDER.txt
// note in electron/main.ts), mirroring the English paragraph-for-paragraph
// with $\r$\n$\r$\n breaks. If you touch build/installer.nsh, keep this
// test in sync.

const NSIS = readFileSync(
  fileURLToPath(new URL("../build/installer.nsh", import.meta.url)),
  "utf8"
);
const ML = /[\u0d00-\u0d7f]/;
const PARA = "$\\r$\\n$\\r$\\n"; // NSIS empty-line break inside a string
const DIVIDER = "— — — മലയാളം — — —";

const messageBoxes = NSIS.split("\n").filter(
  (l) => l.includes("MessageBox") && ML.test(l)
);

describe("installer.nsh bilingual MessageBox formatting", () => {
  it("keeps Malayalam in exactly the two uninstaller dialogs (gate + data-safety)", () => {
    expect(messageBoxes.length).toBe(2);
    expect(messageBoxes.some((l) => l.includes("MB_ICONSTOP"))).toBe(true);
    expect(messageBoxes.some((l) => l.includes("MB_ICONINFORMATION"))).toBe(true);
  });

  it("gives Malayalam its own block behind the മലയാളം divider — never a parenthetical blob", () => {
    for (const line of messageBoxes) {
      expect(line).toContain(DIVIDER);
      // The old formatting tucked whole ML sentences inside "( ... )" after
      // the English — the exact pattern the user rejected.
      expect(line).not.toMatch(/\(ഈ ആപ്പ്/);
      expect(line).not.toMatch(/\(നിങ്ങ/);
      // The English half precedes the divider, the Malayalam half follows it.
      const en = line.slice(0, line.indexOf(DIVIDER));
      const ml = line.slice(line.indexOf(DIVIDER));
      expect(en.length).toBeGreaterThan(0);
      expect(ml.length).toBeGreaterThan(DIVIDER.length);
    }
  });

  it("Malayalam mirrors the English paragraph-for-paragraph", () => {
    const paragraphs = (s: string) => s.split(PARA).length;
    for (const line of messageBoxes) {
      const en = line.slice(0, line.indexOf(DIVIDER));
      const ml = line.slice(line.indexOf(DIVIDER));
      expect(paragraphs(ml)).toBeGreaterThanOrEqual(paragraphs(en));
    }
  });

  it("the data-safety dialog shows the data path in BOTH languages", () => {
    const dataNote = messageBoxes.find((l) => l.includes("MB_ICONINFORMATION"))!;
    const ml = dataNote.slice(dataNote.indexOf(DIVIDER));
    expect(dataNote).toContain("$APPDATA\\mms");
    expect(ml).toContain("$APPDATA\\mms");
    expect(ml).toContain("ഡാറ്റാബേസ്");
    expect(ml).toContain("ബാക്കപ്പ്");
    expect(ml).toContain("ഇല്ലാതാക്കരുത്");
  });
});

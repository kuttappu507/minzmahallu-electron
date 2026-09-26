import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Certificate print flow (user report: "first print of certificate also
// mention reprint badge which is to be avoided").
//
// The "certificates:generatePdf" handler in electron/main.ts used to pass
// reprint_count + 1 into buildCertificateHtml(), so even the FIRST print of
// a brand-new certificate carried the bottom-left "Reprinted on <date>" note.
// The note must appear only when the sheet being printed is genuinely a
// reprint — i.e. the count stored by a PREVIOUS successful save is > 0
// (markReprint() increments AFTER the PDF is actually written, so a
// cancelled save never stamps a phantom reprint either).
const MAIN = readFileSync(
  fileURLToPath(new URL("./main.ts", import.meta.url)),
  "utf8"
);

describe("certificate reprint note starts on the SECOND print", () => {
  it("generatePdf passes the STORED reprint count (no +1 pre-increment)", () => {
    expect(MAIN).toContain("const reprintNo = cert.reprint_count || 0;");
    expect(MAIN).toContain("buildCertificateHtml(cert, lang, reprintNo, istDateTimeDm(new Date()))");
    // The old pre-increment must be gone for good:
    expect(MAIN).not.toContain("expectedReprint");
    expect(MAIN).not.toContain("(cert.reprint_count || 0) + 1");
  });

  it("the count still increments only AFTER the PDF is actually saved", () => {
    const writeIdx = MAIN.indexOf("fs.writeFileSync(saveResult.filePath, pdfBuffer);");
    const markIdx = MAIN.indexOf("data.certificates.markReprint(certId)");
    expect(writeIdx).toBeGreaterThan(-1);
    expect(markIdx).toBeGreaterThan(writeIdx);
  });
});

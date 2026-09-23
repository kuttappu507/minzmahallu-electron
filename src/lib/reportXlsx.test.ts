/*
 * Excel-strict XLSX writer — regression lock for the "donation excel file
 * has some corruption" report. Microsoft Excel hard-requires the "Normal"
 * cell style (cellStyleXfs + cellStyles) and the standard gray125 fill;
 * the old inline writer omitted both and Excel refused the file while
 * LibreOffice/openpyxl opened it silently. The generated workbook is
 * round-tripped through exceljs (real OOXML parser) and the stylesheet is
 * asserted byte-level.
 */
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildXlsx, buildXlsxParts, STYLES_XML } from "./reportXlsx.js";

const HEADERS = ["id", "donor_name", "amount", "remarks"];
const ROWS = [
  { id: 1, donor_name: "ദാതാവ് & Sons <Trust>", amount: 1500.5, remarks: "line1\nline2" },
  { id: 2, donor_name: "", amount: 900, remarks: "Q \"quoted\" & <tagged>" },
];

describe("reportXlsx (Excel-strict exports)", () => {
  it("stylesheet carries the blocks Microsoft Excel requires", () => {
    expect(STYLES_XML).toContain('fills count="2"');
    expect(STYLES_XML).toContain('patternType="gray125"');
    expect(STYLES_XML).toContain("<cellStyleXfs");
    expect(STYLES_XML).toContain('<cellStyle name="Normal" xfId="0" builtinId="0"/>');
    const styles = buildXlsxParts([], ["a"], (k) => k).find((f) => f.name === "xl/styles.xml");
    expect(new TextDecoder().decode(styles!.data)).toBe(STYLES_XML);
  });

  it("round-trips headers, values and types through a real OOXML parser", async () => {
    const buf = buildXlsx(ROWS, HEADERS, (k) => k.toUpperCase());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buf) as any);
    const ws = wb.getWorksheet("Report")!;
    expect(ws.getRow(1).getCell(1).value).toBe("ID");
    expect(ws.getRow(1).getCell(2).value).toBe("DONOR_NAME");
    // numeric cell stays numeric
    const amount = ws.getRow(2).getCell(3).value as number;
    expect(amount).toBeCloseTo(1500.5);
    // Malayalam text and XML-special characters survive escaping
    expect(ws.getRow(2).getCell(2).value).toBe("ദാതാവ് & Sons <Trust>");
    expect(ws.getRow(3).getCell(4).value).toBe('Q "quoted" & <tagged>');
    // empty string stays empty (exceljs reads an empty inline <t> as null)
    expect(ws.getRow(3).getCell(2).value ?? "").toBe("");
  });
});

/*
 * Minimal-but-Excel-strict XLSX writer for the Reports page exports.
 *
 * HISTORY: the donation Excel export produced files LibreOffice/openpyxl
 * opened happily but Microsoft Excel reported as CORRUPT ("We found a
 * problem with some content"). The cause was the stylesheet: Excel
 * resolves every cell format through the style hierarchy and hard-requires
 * the "Normal" cell style (cellStyleXfs + cellStyles) and the standard
 * second fill (gray125, fillId 1). This writer now emits the same
 * stylesheet shape Excel itself writes, and a test round-trips a generated
 * workbook through exceljs to catch regressions.
 *
 * Cells are inline strings (no sharedStrings table) — valid OOXML, and
 * values are XML-escaped with control characters stripped so pasted data
 * can never corrupt the sheet.
 */

export const esc = (v: any) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function u16(n: number) { return new Uint8Array([n & 255, (n >>> 8) & 255]); }
function u32(n: number) { return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]); }
function joinBytes(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function xmlCell(ref: string, value: any, header = false) {
  const s = esc(value);
  return typeof value === "number" && Number.isFinite(value)
    ? `<c r="${ref}" t="n"${header ? ' s="1"' : ""}><v>${value}</v></c>`
    : `<c r="${ref}" t="inlineStr"${header ? ' s="1"' : ""}><is><t>${s}</t></is></c>`;
}
function excelCol(n: number) {
  let s = "";
  for (let x = n + 1; x; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + (x - 1) % 26) + s;
  return s;
}
/* Column widths sized from actual content so every value is fully readable.
   Width unit ≈ characters (like Excel's wch); Malayalam glyphs are wider, so
   the measured length is scaled up a little before clamping. */
function columnWidths(rows: any[], c: string[]): string {
  const widths = c.map((k) => {
    let max = String(k.replace(/_/g, " ")).length;
    for (let i = 0; i < rows.length && i < 400; i++) {
      const len = String(rows[i]?.[k] ?? "").length;
      if (len > max) max = len;
    }
    return Math.min(60, Math.max(11, Math.ceil(max * 1.15) + 3));
  });
  return `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`;
}

/** The stylesheet exactly as Excel expects it: two fills (none + gray125 —
 *  Excel's built-in style table hard-references fillId 1), the cellStyleXfs
 *  parent table, the "Normal" cell style, and the empty dxfs/tableStyles
 *  blocks Excel itself always writes. Missing cellStyles/gray125 is what made
 *  Microsoft Excel flag the donation report as corrupt while LibreOffice
 *  opened it silently. */
export const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Poppins"/><family val="2"/></font><font><b/><sz val="11"/><name val="Poppins"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`;

/** The OOXML package parts (exposed for tests). `r`/`ml` feed Malayalam
 *  column labels through `label` — pass `(k) => labelFor(k, ml)`. */
export function buildXlsxParts(rows: any[], c: string[], label: (k: string) => string): { name: string; data: Uint8Array }[] {
  const encoder = new TextEncoder();
  const sheetRows = [`<row r="1">${c.map((k, i) => xmlCell(`${excelCol(i)}1`, label(k), true)).join("")}</row>`];
  rows.forEach((row, ri) => {
    const rr = ri + 2;
    sheetRows.push(`<row r="${rr}">${c.map((k, ci) => xmlCell(`${excelCol(ci)}${rr}`, row[k])).join("")}</row>`);
  });
  return [
    { name: "[Content_Types].xml", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`) },
    { name: "_rels/.rels", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: "xl/styles.xml", data: encoder.encode(STYLES_XML) },
    { name: "xl/worksheets/sheet1.xml", data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${columnWidths(rows, c)}<sheetData>${sheetRows.join("")}</sheetData></worksheet>`) },
  ];
}

/** Build a single-sheet .xlsx (stored, uncompressed zip). */
export function buildXlsx(rows: any[], c: string[], label: (k: string) => string): Uint8Array {
  const encoder = new TextEncoder();
  const files = buildXlsxParts(rows, c, label);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = encoder.encode(f.name), data = f.data, crc = crc32(data);
    const local = joinBytes([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data]);
    locals.push(local);
    centrals.push(joinBytes([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    offset += local.length;
  }
  const cd = joinBytes(centrals);
  const footer = joinBytes([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0)]);
  return joinBytes([...locals, cd, footer]);
}

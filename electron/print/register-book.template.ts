/*
 * Register-book printing — a paginated, numbered marriage / death register in
 * the style of the official mahallu registers, with signature lines and an
 * integrity line ("N entries, no deletions").
 *
 * v2.4.0 redesign (user report: the register PDF "did not look good") —
 * a proper document header (mahallu name + register title + date), a separate
 * serial-number column, roomier rows with zebra striping, a cleaner footer
 * and a proper signature block.
 */
import { esc } from "./utils.js";
import { getAnekMalayalamCss, getPoppinsCss } from "./utils.js";

/** Raw register row as returned by data.service (marriages.registerRows / deaths.registerRows). */
export type RegisterRow = Record<string, any>;

export interface RegisterData {
  type: "marriage" | "death";
  rows: RegisterRow[];
  mahalluName: string;
  generatedAt: string;
}

const ENTRIES_PER_PAGE = 20;

/**
 * Map a raw register row to display columns with localized labels.
 * Pure — no DB access, so it is unit-testable.
 */
export function mapRegisterRow(type: "marriage" | "death", r: RegisterRow, ml: boolean): { register_number: string; cols: Array<{ label: string; value: string }> } {
  if (type === "marriage") {
    return {
      register_number: r.marriage_number || "—",
      cols: [
        { label: ml ? "നികാഹ് തീയതി" : "Nikah Date", value: fmtDate(r.nikah_date) },
        { label: ml ? "വധു" : "Bride", value: `${r.bride_name || ""}${r.bride_father ? ` (${ml ? "പിതാവ്" : "d/o"} ${r.bride_father})` : ""}` },
        { label: ml ? "വരൻ" : "Groom", value: `${r.groom_name || ""}${r.groom_father ? ` (${ml ? "പിതാവ്" : "s/o"} ${r.groom_father})` : ""}` },
        { label: ml ? "സ്ഥലം" : "Place", value: r.place || "—" },
        { label: ml ? "മഹർ" : "Mahar", value: r.mahar || "—" },
      ],
    };
  }
  return {
    register_number: r.death_number || "—",
    cols: [
      { label: ml ? "പേര്" : "Name", value: r.deceased_name || "—" },
      { label: ml ? "പിതാവ് / ബന്ധു" : "Father / Kin", value: r.father_name || "—" },
      { label: ml ? "ലിംഗം" : "Sex", value: r.gender || "—" },
      { label: ml ? "പ്രായം" : "Age", value: r.age != null ? String(r.age) : "—" },
      { label: ml ? "മരണ തീയതി" : "Date of Death", value: fmtDate(r.date_of_death) },
      { label: ml ? "സ്ഥലം" : "Place", value: r.place_of_death || "—" },
      { label: ml ? "കബറടക്കം" : "Burial", value: `${fmtDate(r.burial_date)}${r.burial_place ? ` (${r.burial_place})` : ""}` },
    ],
  };
}

function fmtDate(d: string): string {
  if (!d) return "—";
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;
  } catch { return String(d); }
}

/** Header "Generated" stamp as the office reads times everywhere else in the
 *  app: 12-hour with AM/PM in the machine's own timezone (formatDateTime
 *  convention). The raw value arrives as a UTC ISO string — printing it
 *  verbatim showed "2026-09-22T10:54:32.150Z" on the register (user report:
 *  "the time mentioned in register is weird format"). Unparseable values
 *  pass through untouched. */
function fmtDateTime(d: string): string {
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    const day = String(date.getDate()).padStart(2, "0");
    const mon = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const h24 = date.getHours();
    const ampm = h24 >= 12 ? "PM" : "AM";
    const h12 = String(h24 % 12 || 12).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return `${day}-${mon}-${year} ${h12}:${min} ${ampm}`;
  } catch { return String(d); }
}

export function buildRegisterBookHtml(data: RegisterData, lang: 'en' | 'ml' = 'en'): string {
  const ml = lang === 'ml';
  const title = ml
    ? (data.type === "marriage" ? "നികാഹ് രജിസ്റ്റർ" : "മരണ രജിസ്റ്റർ")
    : (data.type === "marriage" ? "MARRIAGE REGISTER" : "DEATH REGISTER");
  const anekCss = getPoppinsCss() + getAnekMalayalamCss();
  const css = `${anekCss}
  @page{size:A4 landscape;margin:0}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:${ml ? '"Anek Malayalam Variable",' : ''}Poppins,"Anek Malayalam Variable","Segoe UI",Arial,sans-serif;color:#1a2b22;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{width:297mm;min-height:210mm;padding:0;position:relative;page-break-after:always;display:flex;flex-direction:column}
  .page:last-child{page-break-after:auto}
  /* Document header — a full-width green band, like the printed mahallu registers */
  .band{background:linear-gradient(90deg,#0b6b4f,#0e7c5b 55%,#159b78);color:#fff;padding:7mm 12mm 6mm;display:flex;justify-content:space-between;align-items:center}
  .band .l{display:flex;align-items:center;gap:4.5mm}
  .band .logo{width:13mm;height:13mm;border-radius:3mm;background:rgba(255,255,255,.16);border:.4mm solid rgba(255,255,255,.55);display:grid;place-items:center;font-weight:800;font-size:6mm;font-family:Poppins,Arial,sans-serif}
  .band .org{font-size:13.5pt;font-weight:700;letter-spacing:.2px}
  .band .org small{display:block;font-size:7.5pt;font-weight:500;opacity:.85;margin-top:.8mm;letter-spacing:1.6px;text-transform:uppercase}
  .band .t{text-align:right}
  .band .t b{display:block;font-size:15pt;font-weight:800;letter-spacing:1.5px}
  .band .t span{display:block;font-size:8pt;opacity:.9;margin-top:1.2mm}
  /* Meta strip under the band */
  .meta{display:flex;justify-content:space-between;align-items:center;background:#eef7f1;border-bottom:.3mm solid #cfe3d8;padding:2.6mm 12mm;font-size:8pt;color:#41584d}
  .meta b{color:#0e7c5b}
  /* Table area fills the sheet; footer pinned to the bottom */
  .tbody{flex:1;padding:5mm 12mm 0}
  table{width:100%;border-collapse:collapse;font-size:8.4pt}
  th,td{padding:2.2mm 2.4mm;border:.24mm solid #b9cfc3;text-align:left;vertical-align:top}
  th{background:#0e7c5b;color:#fff;font-size:7.8pt;font-weight:700;letter-spacing:.4px;border-color:#0e7c5b}
  tbody tr:nth-child(even) td{background:#f4faf7}
  td.num{font-weight:700;color:#0e7c5b;text-align:center;font-variant-numeric:tabular-nums}
  .sl{width:11mm}.regno{width:24mm;white-space:nowrap}
  .empty{padding:14mm 0;text-align:center;color:#8ba096;font-size:9.5pt}
  .foot{margin-top:auto;display:flex;justify-content:space-between;align-items:center;border-top:.3mm solid #cfe3d8;background:#f7fbf9;padding:2.6mm 12mm;font-size:7.6pt;color:#5f7268}
  .sign-row{display:flex;justify-content:space-between;gap:10mm;margin:14mm 6mm 0}
  .sign{flex:1;text-align:center}
  .sign .line{border-top:.35mm dotted #41584d;margin-top:14mm;padding-top:1.8mm;font-size:8.4pt;font-weight:600;color:#1a2b22}
  .sign .sub{font-size:7.2pt;color:#8ba096;margin-top:.6mm}
  .integrity{margin:6mm 6mm 0;padding:3mm 5mm;border:.35mm solid #0e7c5b;border-left-width:1.4mm;border-radius:1.5mm;background:#f2faf6;font-size:8.6pt;color:#0b4a37}
  `;

  const rows = data.rows.map((r) => mapRegisterRow(data.type, r, ml));
  const pageCount = Math.max(1, Math.ceil(rows.length / ENTRIES_PER_PAGE));
  const allCols = rows[0]?.cols.map((c) => c.label) || [];
  const headCols = `<tr><th class="sl">${ml ? "ക്ര." : "Sl."}</th><th class="regno">${ml ? "രജിസ്റ്റർ നമ്പർ" : "Register No."}</th>${allCols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const emptyBody = `<tr><td colspan="${allCols.length + 2}"><div class="empty">${ml ? "ഈ രജിസ്റ്ററിൽ രേഖകളൊന്നുമില്ല" : "No entries in this register yet"}</div></td></tr>`;

  const pages: string[] = [];
  for (let p = 0; p < pageCount; p++) {
    const slice = rows.slice(p * ENTRIES_PER_PAGE, (p + 1) * ENTRIES_PER_PAGE);
    const isLast = p === pageCount - 1;
    const body = slice.length
      ? slice.map((r, i) => `<tr><td class="num sl">${p * ENTRIES_PER_PAGE + i + 1}</td><td class="num regno">${esc(r.register_number)}</td>${r.cols.map((c) => `<td>${esc(c.value)}</td>`).join("")}</tr>`).join("")
      : emptyBody;
    // Last page carries the integrity line + signature block between the
    // table and the footer — built inline, no fragile string surgery.
    const lastExtras = isLast ? `
      <div class="integrity">${ml
        ? `ഈ രജിസ്റ്ററിൽ ${rows.length} രേഖകളുണ്ട്. സ്ഥിരം ഇല്ലാതാക്കൽ നിർജ്ജീവമാക്കിയിരിക്കുന്നു — ഓരോ രേഖയും ഓഡിറ്റ് ട്രയിലിൽ രേഖപ്പെടുത്തിയിരിക്കുന്നു.`
        : `This register contains ${rows.length} entries. Permanent deletion is disabled — every entry is recorded in the tamper-evident audit trail.`}</div>
      <div class="sign-row">
        <div class="sign"><div class="line">${ml ? "സെക്രട്ടറി" : "Secretary"}</div><div class="sub">${ml ? "ഒപ്പ് & തീയതി" : "Signature & date"}</div></div>
        <div class="sign"><div class="line">${ml ? "ഖാസി / പ്രസിഡന്റ്" : "Qazi / President"}</div><div class="sub">${ml ? "ഒപ്പ് & തീയതി" : "Signature & date"}</div></div>
        <div class="sign"><div class="line">${ml ? "ഓഡിറ്റർ" : "Auditor"}</div><div class="sub">${ml ? "ഒപ്പ് & തീയതി" : "Signature & date"}</div></div>
      </div>` : "";
    pages.push(`<div class="page">
      <div class="band">
        <div class="l"><div class="logo">M</div><div class="org">${esc(data.mahalluName)}<small>Mahallu Management System</small></div></div>
        <div class="t"><b>${title}</b><span>${ml ? "ഔദ്യോഗിക രജിസ്റ്റർ പ്രതി" : "Official register extract"}</span></div>
      </div>
      <div class="meta"><span>${ml ? "തയ്യാറാക്കിയത്" : "Generated"}: <b>${esc(fmtDateTime(data.generatedAt))}</b></span><span>${ml ? "പേജ്" : "Page"} ${p + 1} / ${pageCount}</span></div>
      <div class="tbody"><table><thead>${headCols}</thead><tbody>${body}</tbody></table></div>
      ${lastExtras}
      <div class="foot"><span>${esc(data.mahalluName)} — ${title}</span><span>${ml ? "രേഖകൾ" : "Entries"}: ${slice.length ? esc(String(slice[0].register_number)) : "—"} – ${slice.length ? esc(String(slice[slice.length - 1].register_number)) : "—"}</span></div>
    </div>`);
  }

  return `<!doctype html><html lang="${ml ? 'ml' : 'en'}"><head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head><body>${pages.join("")}</body></html>`;
}

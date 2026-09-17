/* Family survey form — a BLANK printable A4 sheet handed to every family.
 *
 * The admin downloads it from the Families tab, prints one sheet per family
 * and collects the exact household + member details needed to register the
 * family correctly in the app (house info, head, and a member grid with all
 * the fields the Members module asks for).
 *
 * Bilingual (English + Malayalam) labels on the same sheet so any member can
 * fill it in — mirroring the receipt/certificate template contracts:
 * the mahallu name comes from Settings, never hardcoded.
 */
import { esc } from './utils.js';
import { getDB } from '../db/connection.js';

function activeLanguage(): 'en' | 'ml' {
  try {
    const row = getDB().prepare("SELECT language FROM settings WHERE id = 1").get() as { language?: string } | undefined;
    return row?.language === 'ml' ? 'ml' : 'en';
  } catch { return 'en'; }
}

function mahalluName(): string {
  try {
    const row = getDB().prepare("SELECT mahallu_name FROM settings WHERE id = 1").get() as { mahallu_name?: string } | undefined;
    return String(row?.mahallu_name || '').trim() || 'Mahallu';
  } catch { return 'Mahallu'; }
}

export function buildSurveyFormHtml(): string {
  const ml = activeLanguage() === 'ml';
  const name = esc(mahalluName());
  // [en, ml] pairs — both languages always shown on the sheet (label + sub-label)
  const L = {
    title: ['Family Information Survey Form', 'കുടുംബ വിവര സർവേ ഫോം'],
    sub: [`${name} · Mahallu Management System`, `${name} · മഹല്ല് മാനേജ്മെന്റ് സിസ്റ്റം`],
    instr: [
      'Please fill in every field clearly and return this sheet to the mahallu office. One sheet per family. Use CAPITAL letters for English names.',
      'ദയവായി എല്ലാ വിവരങ്ങളും വ്യക്തമായി പൂരിപ്പിച്ച് ഈ ഫോം മഹല്ല് ഓഫീസിൽ തിരികെ നൽകുക. ഒരു കുടുംബത്തിന് ഒരു ഷീറ്റ്.',
    ],
    house: ['House / Family Details', 'വീടിന്റെ / കുടുംബത്തിന്റെ വിവരങ്ങൾ'],
    houseName: ['House Name', 'വീട്ടുപേര്'],
    houseNumber: ['House Number', 'വീട്ടുനമ്പർ'],
    ward: ['Ward', 'വാർഡ്'],
    area: ['Area / Locality', 'പ്രദേശം'],
    pincode: ['Pincode', 'പിൻകോഡ്'],
    phone: ['Family Phone (10 digits)', 'കുടുംബ ഫോൺ (10 അക്കം)'],
    whatsapp: ['WhatsApp Number of Head (10 digits)', 'കുടുംബനാഥന്റെ വാട്ട്സ്ആപ്പ് നമ്പർ (10 അക്കം)'],
    address: ['Full Address', 'മുഴുവൻ വിലാസം'],
    members: ['Family Members — fill one row per person, including the head', 'കുടുംബാംഗങ്ങൾ — തലവനെ ഉൾപ്പെടെ ഓരോ അംഗവും ഓരോ വരിയിൽ'],
    cols: {
      no: ['No.', 'നമ്പർ'],
      name: ['Full Name', 'പേര്'],
      relation: ['Relation to Head', 'തലവനുമായുള്ള ബന്ധം'],
      gender: ['M / F', 'പു / സ്ത്രീ'],
      dob: ['Date of Birth', 'ജനനത്തീയതി'],
      age: ['Age', 'പ്രായം'],
      marital: ['Married / Single', 'വിവാഹിതൻ / അവിവാഹിതൻ'],
      education: ['Education', 'വിദ്യാഭ്യാസം'],
      job: ['Occupation', 'തൊഴിൽ'],
      mobile: ['Mobile (10 digits)', 'മൊബൈൽ (10 അക്കം)'],
      blood: ['Blood Group', 'രക്തഗ്രൂപ്പ്'],
      head: ['Head?', 'തലവൻ?'],
    },
    relationHint: [
      'Relation examples: Head (self), Wife / Husband, Son, Daughter, Father, Mother, Brother, Sister, Grandson, Granddaughter, Daughter-in-law, Son-in-law.',
      'ബന്ധം: തലവൻ, ഭാര്യ / ഭർത്താവ്, മകൻ, മകൾ, പിതാവ്, മാതാവ്, സഹോദരൻ, സഹോദരി, പേരമകൻ, മരുമകൾ, മരുമകൻ.',
    ],
    headHint: ['Write Y for the family head, N for everyone else.', 'തലവന് Y, മറ്റുള്ളവർക്ക് N എന്ന് എഴുതുക.'],
    decl: ['I hereby declare that the information given above is true and correct to the best of my knowledge.', 'മേൽ നൽകിയിരിക്കുന്ന വിവരങ്ങൾ എന്റെ അറിവിൽ ശരിയാണെന്ന് ഞാൻ ഇവിടെ പ്രഖ്യാപിക്കുന്നു.'],
    signature: ['Signature of Family Head', 'കുടുംബനാഥന്റെ ഒപ്പ്'],
    date: ['Date', 'തീയതി'],
    office: ['For Office Use Only', 'ഓഫീസ് ഉപയോഗത്തിന് മാത്രം'],
    officeNote: ['Family No.', 'കുടുംബ നമ്പർ'],
    memberRows: 10,
  };
  const t = (k: { en: string; ml: string } | [string, string]) => Array.isArray(k) ? k : [k.en, k.ml];
  const two = (pair: string[]) => `<span class="en">${esc(pair[0])}</span><span class="ml">${esc(pair[1])}</span>`;

  const memberRows = Array.from({ length: L.memberRows }, (_, i) =>
    `<tr><td class="no">${i + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`
  ).join('');

  const C = L.cols;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:Poppins,"Anek Malayalam Variable","Segoe UI",Arial,sans-serif;color:#18231e;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{padding:11mm}
.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:.5mm solid #d5e3dd;padding-bottom:4mm;margin-bottom:3mm}
.brand{display:flex;gap:3mm;align-items:center}
.logo{width:11mm;height:11mm;border-radius:3mm;background:#159b78;color:#fff;display:grid;place-items:center;font-weight:800;font-size:5.5mm}
.head h1{margin:0;font-size:5.6mm}
.sub{font-size:2.6mm;color:#718078;margin-top:1mm}
.en{display:block;font-size:2.9mm;font-weight:600}
.ml{display:block;font-size:2.7mm;color:#50615a;font-weight:400}
.instr{background:#f3f7f5;border:.3mm solid #d8e5df;border-radius:2mm;padding:2.5mm 3mm;font-size:2.6mm;color:#50615a;margin-bottom:4mm}
.instr .en{font-size:2.6mm;font-weight:500;color:#18231e}
.sec{margin:0 0 2mm;font-size:3.2mm;color:#138466;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:2.5mm;margin-bottom:3.5mm}
.field{border:.3mm solid #c9d8d1;border-radius:1.5mm;padding:1.5mm 2mm;min-height:11mm}
.field .fill{border-bottom:.25mm dotted #9fb2a9;height:6.5mm}
.field.wide{grid-column:span 2}
.field.full{grid-column:span 4;min-height:14mm}
table{width:100%;border-collapse:collapse;border:.35mm solid #c9d8d1;margin-bottom:1.5mm}
th{background:#f3f7f5;border:.3mm solid #c9d8d1;padding:1.2mm .8mm;vertical-align:top}
th .en{font-size:2.1mm;font-weight:700}
th .ml{font-size:2mm}
td{border:.3mm solid #c9d8d1;height:9.5mm;padding:0 1mm}
td .en{font-size:2.1mm}
.no{width:8mm;text-align:center;font-size:2.6mm;color:#819088}
.hint{font-size:2.3mm;color:#718078;margin-bottom:4mm}
.decl{font-size:2.6mm;color:#50615a;margin-bottom:10mm}
.decl .en{font-weight:500;color:#18231e}
.signrow{display:flex;justify-content:space-between;gap:8mm;margin-bottom:6mm}
.sign{flex:1;border-top:.3mm solid #50615a;padding-top:1.5mm;min-height:16mm}
.office{border:.35mm dashed #9fb2a9;border-radius:2mm;padding:2.5mm 3mm;display:flex;gap:6mm;align-items:center}
.office .en{color:#819088}
.office .fill{flex:1;border-bottom:.25mm dotted #9fb2a9;height:6mm}
</style></head><body><section class="page">
<header class="head"><div class="brand"><div class="logo">M</div><div><h1>${esc(L.title[0])} · ${esc(L.title[1])}</h1><div class="sub">${esc(L.sub[0])} — ${esc(L.sub[1])}</div></div></div></header>
<div class="instr"><span class="en">${esc(L.instr[0])}</span><span class="ml">${esc(L.instr[1])}</span></div>
<div class="sec">${two(L.house)}</div>
<div class="grid">
  <div class="field">${two(L.houseName)}<div class="fill"></div></div>
  <div class="field">${two(L.houseNumber)}<div class="fill"></div></div>
  <div class="field">${two(L.ward)}<div class="fill"></div></div>
  <div class="field">${two(L.area)}<div class="fill"></div></div>
  <div class="field">${two(L.phone)}<div class="fill"></div></div>
  <div class="field">${two(L.whatsapp)}<div class="fill"></div></div>
  <div class="field">${two(L.pincode)}<div class="fill"></div></div>
  <div class="field">${two(L.address)}<div class="fill"></div></div>
</div>
<div class="sec">${two(L.members)}</div>
<table><thead><tr>
<th class="no">${two(C.no)}</th><th>${two(C.name)}</th><th>${two(C.relation)}</th><th>${two(C.gender)}</th><th>${two(C.dob)}</th><th>${two(C.age)}</th><th>${two(C.marital)}</th><th>${two(C.education)}</th><th>${two(C.job)}</th><th>${two(C.mobile)}</th><th>${two(C.blood)}</th><th>${two(C.head)}</th>
</tr></thead><tbody>${memberRows}</tbody></table>
<div class="hint"><span class="en">${esc(L.relationHint[0])} ${esc(L.headHint[0])}</span><span class="ml">${esc(L.relationHint[1])} ${esc(L.headHint[1])}</span></div>
<div class="decl"><span class="en">${esc(L.decl[0])}</span><span class="ml">${esc(L.decl[1])}</span></div>
<div class="signrow">
  <div class="sign"><span class="en">${esc(L.signature[0])}</span><span class="ml">${esc(L.signature[1])}</span></div>
  <div class="sign" style="max-width:45mm"><span class="en">${esc(L.date[0])}</span><span class="ml">${esc(L.date[1])}</span></div>
</div>
<div class="office"><span class="en">${esc(L.office[0])}</span><span class="ml">${esc(L.office[1])}</span> · <span class="en">${esc(L.officeNote[0])}</span><span class="ml">${esc(L.officeNote[1])}</span><div class="fill"></div></div>
</section></body></html>`;
}

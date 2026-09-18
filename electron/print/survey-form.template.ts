/* Family survey form — a BLANK printable ONE-page A4 portrait sheet handed
 * to every family.
 *
 * User requirement (v2.2.1): the form must hold AT MOST 10 family members
 * and the whole sheet must fit on ONE page — the earlier 2-page layout
 * (portrait details + landscape member grid) spilled its 14 rows past the
 * second sheet and wasted paper. The freed space is redistributed here so
 * every section plus the 10-row member table fits comfortably on a single
 * portrait sheet.
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
    instrTitle: ['Instructions', 'നിർദ്ദേശങ്ങൾ'],
    instr: [
      'This form is for ONE family. Fill every field clearly in BLOCK letters and hand it back to the mahallu office. The member table holds up to 10 members — the head in row 1, then everyone else including children. Larger families: use an extra sheet. Where an English name is required, use CAPITAL letters.',
      'ഈ ഫോം ഒരു കുടുംബത്തിനുള്ളതാണ്. എല്ലാ വിവരങ്ങളും വ്യക്തമായി, വലിയ അക്ഷരത്തിൽ പൂരിപ്പിച്ച് മഹല്ല് ഓഫീസിൽ എത്തിക്കുക. അംഗപട്ടികയിൽ 10 പേരെഴുതാം — ഒന്നാം വരി കുടുംബനാഥൻ, പിന്നീട് കുട്ടികൾ അടക്കം എല്ലാവരും; 10-ന് മുകളിലാണെങ്കിൽ ഒരു കൂടി ഷീറ്റ് ഉപയോഗിക്കുക. ഇംഗ്ലീഷ് പേരുകൾ CAPITAL അക്ഷരത്തിൽ എഴുതുക.',
    ],
    house: ['House / Family Details', 'വീടിന്റെ / കുടുംബത്തിന്റെ വിവരങ്ങൾ'],
    houseName: ['House Name', 'വീട്ടുപേര്'],
    houseNumber: ['House Number', 'വീട്ടുനമ്പർ'],
    ward: ['Ward', 'വാർഡ്'],
    area: ['Area / Locality', 'പ്രദേശം'],
    pincode: ['Pincode', 'പിൻകോഡ്'],
    phone: ['Family Phone (10 digits)', 'കുടുംബ ഫോൺ (10 അക്കം)'],
    address: ['Full Address', 'മുഴുവൻ വിലാസം'],
    headSec: ['Details of the Family Head', 'കുടുംബനാഥന്റെ വിവരങ്ങൾ'],
    headSecNote: [
      'The head is the person who represents the family; his/her row must also appear as row 1 of the member table below.',
      'കുടുംബത്തെ പ്രതിനിധീകരിക്കുന്ന വ്യക്തിയാണ് കുടുംബനാഥൻ; താഴെയുള്ള പട്ടികയിലെ ഒന്നാം വരിയും ഇദ്ദേഹത്തിന്റേതായിരിക്കണം.',
    ],
    headName: ['Full Name of Head', 'കുടുംബനാഥന്റെ പേര്'],
    headDob: ['Date of Birth', 'ജനനത്തീയതി'],
    headEdu: ['Education', 'വിദ്യാഭ്യാസം'],
    headJob: ['Occupation', 'തൊഴിൽ'],
    headMobile: ['Mobile (10 digits)', 'മൊബൈൽ (10 അക്കം)'],
    headWhatsapp: ['WhatsApp Number (10 digits)', 'വാട്ട്സ്ആപ്പ് നമ്പർ (10 അക്കം)'],
    members: ['Family Members (max 10)', 'കുടുംബാംഗങ്ങൾ (പരമാവധി 10)'],
    membersSub: ['One row per person — head first, then all others including children', 'ഓരോ അംഗവും ഓരോ വരിയിൽ — ആദ്യം കുടുംബനാഥൻ, പിന്നീട് കുട്ടികൾ അടക്കം എല്ലാവരും'],
    cols: {
      no: ['No.', 'നമ്പർ'],
      name: ['Full Name', 'പേര്'],
      relation: ['Relation to Head', 'ബന്ധം'],
      gender: ['M / F', 'ആൺ / പെൺ'],
      dob: ['Date of Birth', 'ജനനത്തീയതി'],
      marital: ['Married / Single', 'വിവാഹിതൻ / അവിവാഹിതൻ'],
      education: ['Education', 'വിദ്യാഭ്യാസം'],
      job: ['Occupation', 'തൊഴിൽ'],
      mobile: ['Mobile (10 digits)', 'മൊബൈൽ (10 അക്കം)'],
      blood: ['Blood Group', 'രക്തഗ്രൂപ്പ്'],
    },
    relationHint: [
      'Relation examples: Head (self), Wife / Husband, Son, Daughter, Father, Mother, Brother, Sister, Grandson, Granddaughter, Daughter-in-law, Son-in-law.',
      'ബന്ധം: കുടുംബനാഥൻ, ഭാര്യ / ഭർത്താവ്, മകൻ, മകൾ, പിതാവ്, മാതാവ്, സഹോദരൻ, സഹോദരി, പേരമകൻ, മരുമകൾ, മരുമകൻ.',
    ],
    decl: ['I hereby declare that the information given in this form is true and correct to the best of my knowledge.', 'ഈ ഫോമിൽ നൽകിയിരിക്കുന്ന വിവരങ്ങൾ എന്റെ അറിവിൽ ശരിയാണെന്ന് ഞാൻ ഇവിടെ പ്രഖ്യാപിക്കുന്നു.'],
    signature: ['Signature of Family Head', 'കുടുംബനാഥന്റെ ഒപ്പ്'],
    date: ['Date', 'തീയതി'],
    office: ['For Office Use Only', 'ഓഫീസ് ഉപയോഗത്തിന് മാത്രം'],
    officeNote: ['Family No.', 'കുടുംബ നമ്പർ'],
    memberRows: 10,
  };
  const two = (pair: string[]) => `<span class="en">${esc(pair[0])}</span><span class="ml">${esc(pair[1])}</span>`;

  const memberRows = Array.from({ length: L.memberRows }, (_, i) =>
    `<tr><td class="no">${i + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`
  ).join('');

  const C = L.cols;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:Poppins,"Anek Malayalam Variable","Segoe UI",Arial,sans-serif;color:#18231e;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{padding:10mm}
.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:.5mm solid #d5e3dd;padding-bottom:3mm;margin-bottom:2.5mm}
.brand{display:flex;gap:2.5mm;align-items:center}
.logo{width:9mm;height:9mm;border-radius:2.5mm;background:#159b78;color:#fff;display:grid;place-items:center;font-weight:800;font-size:4.5mm}
.head h1{margin:0;font-size:5mm}
.sub{font-size:2.4mm;color:#718078;margin-top:.8mm}
.en{display:block;font-size:2.8mm;font-weight:600}
.ml{display:block;font-size:2.6mm;color:#50615a;font-weight:400}
.instr{background:#f3f7f5;border:.3mm solid #d8e5df;border-radius:2mm;padding:2mm 2.6mm;font-size:2.4mm;color:#50615a;margin-bottom:2.6mm}
.instr .en{font-size:2.4mm;font-weight:500;color:#18231e}
.sec{margin:0 0 1.6mm;font-size:3mm;color:#138466;font-weight:700}
.note{font-size:2.2mm;color:#718078;margin:-0.5mm 0 1.8mm}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm;margin-bottom:2.6mm}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:2mm;margin-bottom:2.6mm}
.field{border:.3mm solid #c9d8d1;border-radius:1.5mm;padding:1.2mm 1.8mm;min-height:11mm}
.field .fill{border-bottom:.25mm dotted #9fb2a9;height:5.8mm}
.field.wide{grid-column:span 2}
.field.full{grid-column:span 4;min-height:12.5mm}
table{width:100%;border-collapse:collapse;border:.35mm solid #c9d8d1;margin-bottom:1.2mm}
th{background:#f3f7f5;border:.3mm solid #c9d8d1;padding:1.2mm .7mm;vertical-align:top}
th .en{font-size:2.1mm;font-weight:700}
th .ml{font-size:2mm}
td{border:.3mm solid #c9d8d1;height:10mm;padding:0 1.1mm}
td .en{font-size:2mm}
.no{width:8mm;text-align:center;font-size:2.5mm;color:#819088}
.hint{font-size:2.2mm;color:#718078;margin:1mm 0 0}
.decl{font-size:2.5mm;color:#50615a;margin:2.6mm 0 7mm}
.decl .en{font-weight:500;color:#18231e}
.signrow{display:flex;justify-content:space-between;gap:8mm;margin-bottom:4mm}
.sign{flex:1;border-top:.3mm solid #50615a;padding-top:1.2mm;min-height:12mm}
.office{border:.35mm dashed #9fb2a9;border-radius:2mm;padding:2mm 2.6mm;display:flex;gap:5mm;align-items:center}
.office .en{color:#819088}
.office .fill{flex:1;border-bottom:.25mm dotted #9fb2a9;height:5.5mm}
</style></head><body>
<section class="page">
<header class="head"><div class="brand"><div class="logo">M</div><div><h1>${esc(L.title[0])} · ${esc(L.title[1])}</h1><div class="sub">${esc(L.sub[0])} — ${esc(L.sub[1])}</div></div></div></header>
<div class="instr"><span class="en"><b>${esc(L.instrTitle[0])}:</b> ${esc(L.instr[0])}</span><span class="ml"><b>${esc(L.instrTitle[1])}:</b> ${esc(L.instr[1])}</span></div>
<div class="sec">${two(L.house)}</div>
<div class="grid">
  <div class="field wide">${two(L.houseName)}<div class="fill"></div></div>
  <div class="field">${two(L.houseNumber)}<div class="fill"></div></div>
  <div class="field">${two(L.ward)}<div class="fill"></div></div>
  <div class="field">${two(L.area)}<div class="fill"></div></div>
  <div class="field">${two(L.pincode)}<div class="fill"></div></div>
  <div class="field">${two(L.phone)}<div class="fill"></div></div>
  <div class="field full">${two(L.address)}<div class="fill"></div></div>
</div>
<div class="sec">${two(L.headSec)}</div>
<div class="note"><span class="en">${esc(L.headSecNote[0])}</span><span class="ml">${esc(L.headSecNote[1])}</span></div>
<div class="grid3">
  <div class="field">${two(L.headName)}<div class="fill"></div></div>
  <div class="field">${two(L.headDob)}<div class="fill"></div></div>
  <div class="field">${two(L.headEdu)}<div class="fill"></div></div>
  <div class="field">${two(L.headJob)}<div class="fill"></div></div>
  <div class="field">${two(L.headMobile)}<div class="fill"></div></div>
  <div class="field">${two(L.headWhatsapp)}<div class="fill"></div></div>
</div>
<div class="sec">${two(L.members)} <span style="font-weight:400;color:#718078;font-size:2.3mm">— ${esc(L.membersSub[0])} / ${esc(L.membersSub[1])}</span></div>
<table><thead><tr>
<th class="no">${two(C.no)}</th><th style="width:16%">${two(C.name)}</th><th style="width:12%">${two(C.relation)}</th><th style="width:6%">${two(C.gender)}</th><th style="width:10%">${two(C.dob)}</th><th style="width:10%">${two(C.marital)}</th><th style="width:12%">${two(C.education)}</th><th style="width:12%">${two(C.job)}</th><th style="width:12%">${two(C.mobile)}</th><th style="width:10%">${two(C.blood)}</th>
</tr></thead><tbody>${memberRows}</tbody></table>
<div class="hint"><span class="en">${esc(L.relationHint[0])}</span><span class="ml">${esc(L.relationHint[1])}</span></div>
<div class="decl"><span class="en">${esc(L.decl[0])}</span><span class="ml">${esc(L.decl[1])}</span></div>
<div class="signrow">
  <div class="sign"><span class="en">${esc(L.signature[0])}</span><span class="ml">${esc(L.signature[1])}</span></div>
  <div class="sign" style="max-width:45mm"><span class="en">${esc(L.date[0])}</span><span class="ml">${esc(L.date[1])}</span></div>
</div>
<div class="office"><span class="en">${esc(L.office[0])}</span><span class="ml">${esc(L.office[1])} · </span><span class="en">${esc(L.officeNote[0])}</span><span class="ml">${esc(L.officeNote[1])}</span><div class="fill"></div></div>
</section></body></html>`;
}

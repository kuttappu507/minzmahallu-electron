/* Family survey form — TWO-page printable A4 sheet handed to every family.
 *
 * User requirement (v2.4.0): page 1 (portrait) holds the family details and
 * the family-head details; page 2 (LANDSCAPE) is a dedicated members sheet
 * with 10 rows and generous row height so the form is comfortable to fill by
 * hand. The head's name is NOT repeated on the members sheet — it is already
 * captured in its own section on page 1, so the 10 rows belong to the OTHER
 * members (spouse, children, …).
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
      'This form is for ONE family and has TWO pages. Page 1: family details and the family head\'s details. Page 2: the other family members (up to 10 — spouse, children and everyone else in the house). Fill every field clearly in BLOCK letters and hand both pages back to the mahallu office. Where an English name is required, use CAPITAL letters.',
      'ഈ ഫോം ഒരു കുടുംബത്തിനുള്ളതാണ്; രണ്ട് പേജുണ്ട്. ഒന്നാം പേജിൽ കുടുംബത്തിന്റെയും കുടുംബനാഥന്റെയും വിവരങ്ങൾ; രണ്ടാം പേജിൽ മറ്റ് അംഗങ്ങളുടെ വിവരങ്ങൾ (പരമാവധി 10 പേർ — ഭാര്യ / ഭർത്താവ്, കുട്ടികൾ അടക്കം വീട്ടിലെ എല്ലാവരും). എല്ലാ വിവരങ്ങളും വ്യക്തമായി, വലിയ അക്ഷരത്തിൽ പൂരിപ്പിച്ച് രണ്ട് പേജും മഹല്ല് ഓഫീസിൽ എത്തിക്കുക. ഇംഗ്ലീഷ് പേരുകൾ CAPITAL അക്ഷരത്തിൽ എഴുതുക.',
    ],
    page1: ['Page 1 · Family & Family Head', 'പേജ് 1 · കുടുംബവും കുടുംബനാഥനും'],
    house: ['House / Family Details', 'വീട്ടുവിവരങ്ങൾ / കുടുംബവിവരങ്ങൾ'],
    houseName: ['House Name', 'വീട്ടുപേര്'],
    houseNumber: ['House Number', 'വീട്ടു നമ്പർ'],
    ward: ['Ward', 'വാർഡ്'],
    area: ['Area / Locality', 'പ്രദേശം'],
    pincode: ['Pincode', 'പിൻകോഡ്'],
    phone: ['Family Phone (10 digits)', 'കുടുംബ ഫോൺ (10 അക്കം)'],
    address: ['Full Address', 'മുഴുവൻ വിലാസം'],
    headSec: ['Details of the Family Head', 'കുടുംബനാഥന്റെ വിവരങ്ങൾ'],
    headSecNote: [
      'The head is the person who represents the family in the mahallu. The other members are listed on page 2.',
      'കുടുംബത്തെ മഹല്ലിൽ പ്രതിനിധീകരിക്കുന്ന വ്യക്തിയാണ് കുടുംബനാഥൻ. മറ്റ് അംഗങ്ങളുടെ വിവരങ്ങൾ രണ്ടാം പേജിൽ രേഖപ്പെടുത്തുക.',
    ],
    headName: ['Full Name of Head', 'കുടുംബനാഥന്റെ പേര്'],
    headDob: ['Date of Birth', 'ജനനത്തീയതി'],
    headEdu: ['Education', 'വിദ്യാഭ്യാസം'],
    headJob: ['Occupation', 'തൊഴിൽ'],
    headMobile: ['Mobile (10 digits)', 'മൊബൈൽ (10 അക്കം)'],
    headWhatsapp: ['WhatsApp Number (10 digits)', 'വാട്ട്സ്ആപ്പ് നമ്പർ (10 അക്കം)'],
    page2: ['Page 2 · Family Members', 'പേജ് 2 · കുടുംബാംഗങ്ങൾ'],
    members: ['Other Family Members (max 10)', 'മറ്റ് കുടുംബാംഗങ്ങൾ (പരമാവധി 10)'],
    membersSub: [
      'One row per person — everyone in the house EXCEPT the family head (the head is already given on page 1). Include children of all ages.',
      'ഓരോ അംഗത്തിന്റെയും വിവരങ്ങൾ ഓരോ വരിയിൽ. കുടുംബനാഥനെ വീണ്ടും എഴുതേണ്ട — അദ്ദേഹത്തിന്റെ വിവരങ്ങൾ ഒന്നാം പേജിൽ തന്നെ. കുട്ടികൾ അടക്കം വീട്ടിലെ ബാക്കി എല്ലാവരെയും ഇവിടെ എഴുതുക.',
    ],
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
      'Relation examples: Wife / Husband, Son, Daughter, Father, Mother, Brother, Sister, Grandson, Granddaughter, Daughter-in-law, Son-in-law.',
      'ബന്ധം: ഭാര്യ / ഭർത്താവ്, മകൻ, മകൾ, പിതാവ്, മാതാവ്, സഹോദരൻ, സഹോദരി, പേരമകൻ, മരുമകൾ, മരുമകൻ.',
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
@page second{size:A4 landscape;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:Poppins,"Anek Malayalam Variable","Segoe UI",Arial,sans-serif;color:#18231e;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{padding:11mm;page-break-after:always}
.page.last{page-break-after:auto}
/* Named page: the members sheet prints LANDSCAPE (Chromium honours named
   pages with preferCSSPageSize). Width/height mirror the A4 landscape box. */
.page.land{page:second;width:297mm;height:209mm;padding:9mm 11mm}
.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:.5mm solid #d5e3dd;padding-bottom:3mm;margin-bottom:2.5mm}
.brand{display:flex;gap:2.5mm;align-items:center}
.logo{width:9mm;height:9mm;border-radius:2.5mm;background:#159b78;color:#fff;display:grid;place-items:center;font-weight:800;font-size:4.5mm}
.head h1{margin:0;font-size:5mm}
.pgtag{font-size:2.6mm;font-weight:700;color:#138466;border:.3mm solid #bfe0d5;border-radius:99px;padding:1mm 3mm;background:#f0f9f5;white-space:nowrap}
.sub{font-size:2.4mm;color:#718078;margin-top:.8mm}
.en{display:block;font-size:2.8mm;font-weight:600}
.ml{display:block;font-size:2.6mm;color:#50615a;font-weight:400}
.instr{background:#f3f7f5;border:.3mm solid #d8e5df;border-radius:2mm;padding:2mm 2.6mm;font-size:2.4mm;color:#50615a;margin-bottom:3mm}
.instr .en{font-size:2.4mm;font-weight:500;color:#18231e}
.sec{margin:0 0 1.8mm;font-size:3.1mm;color:#138466;font-weight:700}
.note{font-size:2.3mm;color:#718078;margin:-0.5mm 0 2mm}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:2.4mm;margin-bottom:3mm}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:2.4mm;margin-bottom:3mm}
.field{border:.3mm solid #c9d8d1;border-radius:1.5mm;padding:1.4mm 2mm;min-height:13mm}
.field .fill{border-bottom:.25mm dotted #9fb2a9;height:6.5mm}
.field.wide{grid-column:span 2}
.field.full{grid-column:span 4;min-height:14mm}
table{width:100%;border-collapse:collapse;border:.4mm solid #c9d8d1;margin-bottom:2mm}
th{background:#f3f7f5;border:.3mm solid #c9d8d1;padding:1.6mm 1mm;vertical-align:top}
th .en{font-size:2.4mm;font-weight:700}
th .ml{font-size:2.2mm}
td{border:.3mm solid #c9d8d1;height:14.2mm;padding:0 1.4mm}
td .en{font-size:2.1mm}
.no{width:10mm;text-align:center;font-size:2.7mm;color:#819088;font-weight:600}
.hint{font-size:2.3mm;color:#718078;margin:1.4mm 0 0}
.decl{font-size:2.6mm;color:#50615a;margin:3mm 0 8mm}
.decl .en{font-weight:500;color:#18231e}
.signrow{display:flex;justify-content:space-between;gap:8mm;margin-bottom:5mm}
.sign{flex:1;border-top:.3mm solid #50615a;padding-top:1.4mm;min-height:13mm}
.office{border:.35mm dashed #9fb2a9;border-radius:2mm;padding:2.2mm 3mm;display:flex;gap:5mm;align-items:center}
.office .en{color:#819088}
.office .fill{flex:1;border-bottom:.25mm dotted #9fb2a9;height:5.5mm}
</style></head><body>
<section class="page">
<header class="head"><div class="brand"><div class="logo">M</div><div><h1>${esc(L.title[0])} · ${esc(L.title[1])}</h1><div class="sub">${esc(L.sub[0])} — ${esc(L.sub[1])}</div></div></div><span class="pgtag">${esc(L.page1[0])} / ${esc(L.page1[1])}</span></header>
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
<div class="decl"><span class="en">${esc(L.decl[0])}</span><span class="ml">${esc(L.decl[1])}</span></div>
<div class="signrow">
  <div class="sign"><span class="en">${esc(L.signature[0])}</span><span class="ml">${esc(L.signature[1])}</span></div>
  <div class="sign" style="max-width:45mm"><span class="en">${esc(L.date[0])}</span><span class="ml">${esc(L.date[1])}</span></div>
</div>
<div class="office"><span class="en">${esc(L.office[0])}</span><span class="ml">${esc(L.office[1])} · </span><span class="en">${esc(L.officeNote[0])}</span><span class="ml">${esc(L.officeNote[1])}</span><div class="fill"></div></div>
</section>
<section class="page land last">
<header class="head"><div class="brand"><div class="logo">M</div><div><h1>${esc(L.title[0])} · ${esc(L.title[1])}</h1><div class="sub">${esc(L.sub[0])} — ${esc(L.sub[1])}</div></div></div><span class="pgtag">${esc(L.page2[0])} / ${esc(L.page2[1])}</span></header>
<div class="sec">${two(L.members)}</div>
<div class="note"><span class="en">${esc(L.membersSub[0])}</span><span class="ml">${esc(L.membersSub[1])}</span></div>
<table><thead><tr>
<th class="no">${two(C.no)}</th><th style="width:17%">${two(C.name)}</th><th style="width:12%">${two(C.relation)}</th><th style="width:6%">${two(C.gender)}</th><th style="width:10%">${two(C.dob)}</th><th style="width:10%">${two(C.marital)}</th><th style="width:12%">${two(C.education)}</th><th style="width:12%">${two(C.job)}</th><th style="width:12%">${two(C.mobile)}</th><th style="width:9%">${two(C.blood)}</th>
</tr></thead><tbody>${memberRows}</tbody></table>
<div class="hint"><span class="en">${esc(L.relationHint[0])}</span><span class="ml">${esc(L.relationHint[1])}</span></div>
</section></body></html>`;
}

/*
 * A6 receipt template — donation receipts and subscription payment receipts.
 *
 * Two output shapes from one card design:
 *   - buildReceiptHtml()      → one receipt on its own A6 page (105×148mm).
 *     Used for the PDF copy sent on WhatsApp and for single-receipt printing.
 *   - buildReceiptSheetHtml() → four receipts on one A4 page (2×2 grid with
 *     cut guides), so an admin printing receipts for many people gets 4 per
 *     sheet and simply cuts them apart.
 *
 * Dates are always rendered dd-mm-yyyy (the caller formats them) — the app's
 * display convention. Pure module: no DB, no Electron — unit-testable.
 */
import { esc } from './utils.js';
import { getAnekMalayalamCss } from './utils.js';

export interface ReceiptData {
  kind: 'DONATION' | 'SUBSCRIPTION';
  receiptNumber: string;
  /** Already formatted dd-mm-yyyy by the caller. */
  date: string;
  payerName: string;
  payerDetail: string;
  line1Label: string;
  line1Value: string;
  line2Label: string;
  line2Value: string;
  amount: number;
  paymentMethod: string;
  transactionRef: string;
  notes?: string;
  mahalluName: string;
  /** Extra footer line (e.g. "Balance this month: ₹0"). */
  footNote?: string;
  /** Anti-forgery: register verification code printed under the QR. */
  verificationCode?: string;
  /** Anti-forgery: signed QR SVG data-URL (pre-rendered by the caller —
   *  the template stays synchronous and pure). */
  qrSvg?: string;
}

// ---------------------------------------------------------------------------
// Amount in words (Indian numbering: crore / lakh / thousand / hundred).
// ---------------------------------------------------------------------------
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitsToWords(n: number): string {
  if (n < 20) return ONES[n];
  return (TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')).trim();
}

function numberToWordsIndian(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const hundred = Math.floor(n / 100); n %= 100;
  if (crore) parts.push(`${numberToWordsIndian(crore)} Crore`);
  if (lakh) parts.push(`${twoDigitsToWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitsToWords(thousand)} Thousand`);
  if (hundred) parts.push(`${twoDigitsToWords(hundred)} Hundred`);
  if (n) parts.push(twoDigitsToWords(n));
  return parts.join(' ');
}

export function amountInWords(amount: number): string {
  const rupees = Math.floor(Number(amount) || 0);
  const paise = Math.round((Number(amount) || 0) * 100) % 100;
  let text = `Rupees ${numberToWordsIndian(rupees)}`;
  if (paise > 0) text += ` and ${twoDigitsToWords(paise)} Paise`;
  return `${text} Only`;
}

export function formatReceiptAmount(amount: number): string {
  return '\u20B9' + Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Labels (bilingual like the other print templates)
// ---------------------------------------------------------------------------
type Lang = 'en' | 'ml';
function labels(lang: Lang) {
  return lang === 'ml' ? {
    system: 'മഹല്ല് മാനേജ്മെന്റ് സിസ്റ്റം',
    receipt: 'രസീറ്റ്',
    no: 'രസീറ്റ് നമ്പർ',
    date: 'തീയതി',
    received: 'ഇവരിൽ നിന്നും സ്വീകരിച്ചത്',
    amount: 'തുക',
    method: 'പേയ്‌മെന്റ് രീതി',
    ref: 'റഫറൻസ്',
    forMahallu: 'മഹല്ലിന് വേണ്ടി',
    thanks: 'ജസാക്കല്ലാഹു ഖൈറൻ.',
    note: 'കുറിപ്പ്',
    cut: 'മുറിക്കുക',
    page: 'ഷീറ്റ്',
    scan: 'സ്കാൻ ചെയ്ത് പരിശോധിക്കുക',
    computerGenerated: 'കമ്പ്യൂട്ടർ ജനറേറ്റ് ചെയ്ത രസീറ്റ് — ഒപ്പ് ആവശ്യമില്ല.',
  } : {
    system: 'Mahallu Management System',
    receipt: 'RECEIPT',
    no: 'Receipt No',
    date: 'Date',
    received: 'Received with thanks from',
    amount: 'Amount',
    method: 'Payment',
    ref: 'Ref',
    forMahallu: 'For',
    thanks: 'Jazakallahu Khairan.',
    note: 'Notes',
    cut: 'cut',
    page: 'Sheet',
    scan: 'SCAN TO VERIFY',
    computerGenerated: 'Computer-generated receipt — no signature required.',
  };
}

// ---------------------------------------------------------------------------
// The A6 receipt card
// ---------------------------------------------------------------------------
function receiptCard(r: ReceiptData, L: ReturnType<typeof labels>): string {
  const isDonation = r.kind === 'DONATION';
  const notes = String(r.notes || '').trim();
  return `
  <article class="rc">
    <header class="rc-head">
      <div class="rc-brand"><b>${esc(r.mahalluName || 'MAHALLU')}</b><span>${esc(L.system)}</span></div>
      <div class="rc-type">${esc(L.receipt)}<small>${isDonation ? 'DONATION' : 'SUBSCRIPTION'}</small></div>
    </header>
    <div class="rc-meta">
      <div><span>${esc(L.no)}</span><b>${esc(r.receiptNumber || '—')}</b></div>
      <div><span>${esc(L.date)}</span><b>${esc(r.date || '—')}</b></div>
    </div>
    <div class="rc-body">
      <div class="rc-party">
        <div class="rc-party-name">${esc(r.payerName || '—')}</div>
        ${r.payerDetail ? `<div class="rc-party-sub">${esc(r.payerDetail)}</div>` : ''}
        <div class="rc-party-cap">${esc(L.received)}</div>
      </div>
      <div class="rc-lines">
        <div class="rc-line"><span>${esc(r.line1Label)}</span><b>${esc(r.line1Value || '—')}</b></div>
        <div class="rc-line"><span>${esc(r.line2Label)}</span><b>${esc(r.line2Value || '—')}</b></div>
        ${(r.paymentMethod || r.transactionRef) ? `<div class="rc-line"><span>${esc(L.method)}</span><b>${esc(r.paymentMethod || '—')}${r.transactionRef ? ` · ${esc(L.ref)}: ${esc(r.transactionRef)}` : ''}</b></div>` : ''}
      </div>
      <div class="rc-amount">
        <span>${esc(L.amount)}</span>
        <b>${esc(formatReceiptAmount(r.amount))}</b>
        <small>${esc(amountInWords(r.amount))}</small>
      </div>
      ${notes ? `<div class="rc-notes"><span>${esc(L.note)}:</span> ${esc(notes)}</div>` : ''}
      ${r.footNote ? `<div class="rc-foot-note">${esc(r.footNote)}</div>` : ''}
    </div>
    <footer class="rc-foot">
      <div class="rc-verify">
        ${r.qrSvg ? `<img class="rc-qr" src="${r.qrSvg}" alt="QR"/>` : ''}
        <div class="rc-verify-copy">
          ${r.verificationCode ? `<span class="rc-vcap">${esc(L.scan)}</span><span class="rc-vcode">${esc(r.verificationCode)}</span>` : ''}
          <span class="rc-vhint">${esc(L.computerGenerated)}</span>
        </div>
      </div>
      <div class="rc-for"><b>${esc(L.forMahallu)} ${esc(r.mahalluName || 'MAHALLU')}</b><span>${esc(L.thanks)}</span></div>
    </footer>
  </article>`;
}

function baseCss(): string {
  return `
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{background:#fff}
    body{font-family:Poppins,"Anek Malayalam Variable","Segoe UI",Arial,sans-serif;color:#101a14;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .rc{width:105mm;height:148mm;display:flex;flex-direction:column;border:.35mm solid #bfcfc7;background:#fff;overflow:hidden}
    .rc-head{display:flex;justify-content:space-between;align-items:center;background:#0d7a5f;color:#fff;padding:4mm 5mm 3.4mm}
    .rc-brand b{display:block;font-size:11.5pt;font-weight:800;letter-spacing:.3px;line-height:1.15}
    .rc-brand span{display:block;font-size:5.6pt;opacity:.9;margin-top:.7mm;letter-spacing:.4px}
    .rc-type{text-align:right;font-size:10.5pt;font-weight:800;letter-spacing:1.2px}
    .rc-type small{display:block;font-size:5.4pt;opacity:.85;letter-spacing:.8px;margin-top:.5mm}
    .rc-meta{display:flex;border-bottom:.3mm solid #d9e5e0}
    .rc-meta>div{flex:1;display:flex;justify-content:space-between;padding:2.4mm 5mm;border-right:.3mm solid #d9e5e0}
    .rc-meta>div:last-child{border-right:0}
    .rc-meta span{font-size:6pt;color:#5d6f67;letter-spacing:.3px}
    .rc-meta b{font-size:8.4pt}
    .rc-body{flex:1;display:flex;flex-direction:column;padding:4mm 5mm;gap:3mm}
    .rc-party{border-bottom:.2mm dashed #c9d8d2;padding-bottom:2.6mm}
    .rc-party-name{font-size:12pt;font-weight:800;line-height:1.2}
    .rc-party-sub{font-size:7.5pt;color:#5d6f67;margin-top:.8mm}
    .rc-party-cap{font-size:6pt;color:#84938c;margin-top:1.2mm}
    .rc-lines{display:flex;flex-direction:column;gap:1.6mm}
    .rc-line{display:flex;justify-content:space-between;gap:4mm;font-size:7.8pt;border-bottom:.15mm solid #e7efeb;padding-bottom:1.2mm}
    .rc-line span{color:#5d6f67;font-size:6.8pt}
    .rc-line b{text-align:right}
    .rc-amount{margin-top:auto;background:#f1f8f4;border:.3mm solid #9ec7b8;border-left:1.2mm solid #0d7a5f;border-radius:1.5mm;padding:3mm 4mm;display:flex;flex-direction:column;gap:.8mm}
    .rc-amount span{font-size:6.4pt;color:#4c5f56;letter-spacing:.5px}
    .rc-amount b{font-size:16pt;font-weight:800;color:#0a5c47;line-height:1.05}
    .rc-amount small{font-size:6.2pt;color:#4c5f56;font-style:italic}
    .rc-notes{font-size:6.8pt;color:#4c5f56;border-top:.2mm dashed #c9d8d2;padding-top:1.6mm}
    .rc-foot-note{font-size:7.2pt;color:#0a5c47;font-weight:600}
    .rc-foot{display:flex;justify-content:space-between;align-items:flex-end;gap:3mm;padding:3mm 5mm 3.5mm;border-top:.3mm solid #d9e5e0;background:#fbfdfc}
    .rc-verify{display:flex;align-items:center;gap:2.5mm;min-width:0}
    .rc-qr{width:22mm;height:22mm;flex:none;border:.2mm solid #c9e0d4;border-radius:1mm;background:#fff}
    .rc-verify-copy{display:flex;flex-direction:column;gap:.7mm;min-width:0}
    .rc-vcap{font-size:5.8pt;font-weight:700;color:#0a5c47;letter-spacing:.5px}
    .rc-vcode{font-size:8pt;font-weight:800;letter-spacing:.6px;color:#101a14}
    .rc-vhint{font-size:5.6pt;color:#5d6f67;max-width:52mm;line-height:1.25}
    .rc-for{text-align:right;flex:none}
    .rc-for b{display:block;font-size:7.6pt}
    .rc-for span{display:block;font-size:6.2pt;color:#5d6f67;margin-top:.6mm}
  `;
}

/** One receipt on its own A6 page — the WhatsApp PDF copy & single print. */
export function buildReceiptHtml(r: ReceiptData, lang: Lang): string {
  const L = labels(lang);
  const font = getAnekMalayalamCss();
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
    @page{size:105mm 148mm;margin:0}${font}${baseCss()}
    html,body{width:105mm;height:148mm}
    .rc{border:0}
  </style></head><body>${receiptCard(r, L)}</body></html>`;
}

/** Four receipts per A4 page (2×2 grid, dashed cut guides between cells). */
export function buildReceiptSheetHtml(list: ReceiptData[], lang: Lang): string {
  const L = labels(lang);
  const font = getAnekMalayalamCss();
  const cells = list.map((r) => receiptCard(r, L));
  const pages: string[] = [];
  for (let i = 0; i < cells.length; i += 4) {
    const four = cells.slice(i, i + 4);
    while (four.length < 4) four.push('');
    pages.push(`<section class="sheet">${four.map((c) => `<div class="cell">${c || ''}</div>`).join('')}<div class="sheet-foot">${esc(L.page)} ${pages.length + 1} · ${esc(String(list.length))} ${lang === 'ml' ? 'രസീറ്റുകൾ' : 'receipts'} · 4 / A4</div></section>`);
  }
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
    @page{size:A4 portrait;margin:0}${font}${baseCss()}
    html,body{width:210mm}
    .sheet{width:210mm;height:297mm;position:relative;display:grid;grid-template-columns:105mm 105mm;grid-template-rows:148.5mm 148.5mm;page-break-after:always;break-after:page}
    .sheet:last-child{page-break-after:auto;break-after:auto}
    .cell{position:relative}
    .cell .rc{border:0;width:105mm;height:148mm}
    .cell:nth-child(odd){border-right:.25mm dashed #9db3aa}
    .cell:nth-child(-n+2){border-bottom:.25mm dashed #9db3aa}
    .sheet-foot{position:absolute;right:5mm;bottom:1.2mm;font-size:5.5pt;color:#84938c;letter-spacing:.3px}
  </style></head><body>${pages.join('')}</body></html>`;
}

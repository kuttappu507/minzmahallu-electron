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
import { getAnekMalayalamCss, getPoppinsCss } from './utils.js';

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
  /** Mahallu address (+ phone) printed under the name in the header, exactly
   *  like the certificate header. */
  mahalluAddress?: string;
  mahalluPhone?: string;
  /** Currency symbol from Settings (default "₹") — masjids can change it and
   *  every printed receipt must follow. */
  currencySymbol?: string;
  /** Extra footer line (e.g. "Balance this month: ₹0"). */
  footNote?: string;
  /** Anti-forgery: register SECURITY CODE printed in the footer (no QR —
   *  the office verifies the code against the register / the app). */
  verificationCode?: string;
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

export function formatReceiptAmount(amount: number, currencySymbol: string = '\u20B9'): string {
  return String(currencySymbol || '\u20B9') + Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/**
 * Receipts print phone numbers WITHOUT the India country-code prefix.
 * The database normalises mobile numbers to 91XXXXXXXXXX for WhatsApp
 * delivery, but on paper a receipt reading "91 98…" looks like a wrong
 * number. Strips a leading 91 ONLY when what remains is a 10-digit Indian
 * mobile (starts 6-9) — landlines ("0483 000 0000"), overseas numbers and
 * house/reference numbers pass through untouched.
 */
export function stripIndiaPrefix(raw: string): string {
  const s = String(raw ?? '').trim();
  const digits = s.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) {
    return s.replace(/^(\+?\s*91)?[\s-]*/, '').trim();
  }
  return s;
}

// ---------------------------------------------------------------------------
// Labels (bilingual like the other print templates)
// ---------------------------------------------------------------------------
type Lang = 'en' | 'ml';
function labels(lang: Lang) {
  return lang === 'ml' ? {
    titleDonation: 'സംഭാവന രസീത്',
    titleSubscription: 'വരിസംഖ്യ രസീത്',
    no: 'രസീത് നമ്പർ',
    date: 'തീയതി',
    received: 'ഇവരിൽ നിന്ന് സ്വീകരിച്ചത്',
    honorific: 'ജനാബ്',
    amount: 'തുക',
    method: 'അടവ് രീതി',
    ref: 'റഫറൻസ്',
    forMahallu: 'മഹല്ലിന് വേണ്ടി',
    thanks: 'ജസാക്കല്ലാഹു ഖൈറൻ.',
    note: 'കുറിപ്പ്',
    cut: 'മുറിക്കുക',
    page: 'ഷീറ്റ്',
    securityCode: 'സുരക്ഷാ കോഡ്',
    verifyHint: 'ഈ സുരക്ഷാ കോഡ് മഹല്ല് ഓഫീസിലോ Minz Mahallu ആപ്പിലോ പരിശോധിക്കുക.',
    secretary: 'സെക്രട്ടറി',
  } : {
    titleDonation: 'DONATION RECEIPT',
    titleSubscription: 'SUBSCRIPTION RECEIPT',
    no: 'Receipt No',
    date: 'Date',
    received: 'Received with thanks from',
    honorific: 'Janab',
    amount: 'Amount',
    method: 'Payment',
    ref: 'Ref',
    forMahallu: 'For',
    thanks: 'Jazakallahu Khairan.',
    note: 'Notes',
    cut: 'cut',
    page: 'Sheet',
    securityCode: 'SECURITY CODE',
    verifyHint: 'Verify this security code at the mahallu office or in the Minz Mahallu app.',
    secretary: 'Secretary',
  };
}

// ---------------------------------------------------------------------------
// The A6 receipt card
// ---------------------------------------------------------------------------
function receiptCard(r: ReceiptData, L: ReturnType<typeof labels>): string {
  const isDonation = r.kind === 'DONATION';
  const notes = String(r.notes || '').trim();
  // Header identity block, mirroring the certificate: mahallu name on top,
  // address (+ phone) underneath. Phone numbers print WITHOUT the leading
  // 91 country code (see stripIndiaPrefix).
  const addrParts = [r.mahalluAddress, stripIndiaPrefix(String(r.mahalluPhone || ''))].map((s) => String(s || '').trim()).filter(Boolean);
  return `
  <article class="rc">
    <header class="rc-head">
      <div class="rc-type">${esc(isDonation ? L.titleDonation : L.titleSubscription)}</div>
      <div class="rc-brand"><b>${esc(r.mahalluName || 'MAHALLU')}</b>${addrParts.length ? `<span>${esc(addrParts.join(' · '))}</span>` : ''}</div>
    </header>
    <div class="rc-meta">
      <div><span>${esc(L.no)}</span><b>${esc(r.receiptNumber || '—')}</b></div>
      <div><span>${esc(L.date)}</span><b>${esc(r.date || '—')}</b></div>
    </div>
    <div class="rc-body">
      <div class="rc-party">
        <div class="rc-party-cap">${esc(L.received)}</div>
        <div class="rc-party-name">${esc(L.honorific)} ${esc(r.payerName || '—')}</div>
        ${r.payerDetail ? `<div class="rc-party-sub">${esc(stripIndiaPrefix(r.payerDetail))}</div>` : ''}
      </div>
      <div class="rc-lines">
        <div class="rc-line"><span>${esc(r.line1Label)}</span><b>${esc(r.line1Value || '—')}</b></div>
        <div class="rc-line"><span>${esc(r.line2Label)}</span><b>${esc(r.line2Value || '—')}</b></div>
        ${(r.paymentMethod || r.transactionRef) ? `<div class="rc-line"><span>${esc(L.method)}</span><b>${esc(r.paymentMethod || '—')}${r.transactionRef ? ` · ${esc(L.ref)}: ${esc(r.transactionRef)}` : ''}</b></div>` : ''}
      </div>
      <div class="rc-amount">
        <span>${esc(L.amount)}</span>
        <b>${esc(formatReceiptAmount(r.amount, r.currencySymbol))}</b>
        <small>${esc(amountInWords(r.amount))}</small>
      </div>
      ${notes ? `<div class="rc-notes"><span>${esc(L.note)}:</span> ${esc(notes)}</div>` : ''}
      ${r.footNote ? `<div class="rc-foot-note">${esc(r.footNote)}</div>` : ''}
    </div>
    <footer class="rc-foot">
      <div class="rc-verify">
        ${r.verificationCode ? `<div class="rc-verify-copy"><span class="rc-vcap">${esc(L.securityCode)}</span><span class="rc-vcode">${esc(r.verificationCode)}</span></div>
        <span class="rc-vhint">${esc(L.verifyHint)}</span>` : ''}
      </div>
      <div class="rc-sign">
        <span class="rc-thanks">${esc(L.thanks)}</span>
        <span class="rc-sd">-sd-</span>
        <span class="rc-sec">${esc(L.secretary)}</span>
        <b class="rc-for-line">${esc(L.forMahallu)} ${esc(r.mahalluName || 'MAHALLU')}</b>
      </div>
    </footer>
  </article>`;
}

function baseCss(): string {
  return `
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{background:#fff}
    body{font-family:Poppins,"Anek Malayalam Variable","Segoe UI",Arial,sans-serif;color:#101a14;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    /* 6mm bottom safe zone — printer hardware margins eat the last ~5mm of a
       full-bleed page, so no text may sit there (was cutting the sign-off). */
    .rc{width:105mm;height:148mm;display:flex;flex-direction:column;border:.35mm solid #bfcfc7;background:#fff;overflow:hidden;padding-bottom:6mm}
    /* Header: the receipt type is a SMALL caption in the top-LEFT corner;
       the mahallu name is the big CENTRED line under it, with the address
       (and phone) centred underneath — the classic Kerala receipt head. */
    .rc-head{display:flex;flex-direction:column;align-items:stretch;background:#0d7a5f;color:#fff;padding:3.2mm 5mm 3mm}
    .rc-type{text-align:left;font-size:7.2pt;font-weight:700;letter-spacing:1px;text-transform:uppercase;opacity:.95}
    .rc-brand{margin-top:1.2mm;text-align:center}
    .rc-brand b{display:block;font-size:14.5pt;font-weight:800;letter-spacing:.3px;line-height:1.15}
    .rc-brand span{display:block;font-size:6.6pt;opacity:.92;margin-top:1mm;letter-spacing:.4px}
    .rc-meta{display:flex;border-bottom:.3mm solid #d9e5e0}
    .rc-meta>div{flex:1;display:flex;justify-content:space-between;padding:2.4mm 5mm;border-right:.3mm solid #d9e5e0}
    .rc-meta>div:last-child{border-right:0}
    .rc-meta span{font-size:6.4pt;color:#5d6f67;letter-spacing:.3px}
    .rc-meta b{font-size:9pt}
    /* min-height:0 + overflow:hidden — the body absorbs extreme content instead
       of pushing the sign-off/security-code footer off the page. */
    .rc-body{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;padding:3.8mm 5.5mm 2.8mm;gap:3mm}
    .rc-party{border-bottom:.2mm dashed #c9d8d2;padding-bottom:2.6mm}
    .rc-party-cap{font-size:6.4pt;color:#84938c;letter-spacing:.3px}
    .rc-party-name{font-size:13.5pt;font-weight:800;line-height:1.2;margin-top:.8mm}
    .rc-party-sub{font-size:8pt;color:#5d6f67;margin-top:1mm}
    .rc-lines{display:flex;flex-direction:column;gap:2mm}
    .rc-line{display:flex;justify-content:space-between;gap:4mm;font-size:8.6pt;border-bottom:.15mm solid #e7efeb;padding-bottom:1.5mm}
    .rc-line span{color:#5d6f67;font-size:7.4pt}
    .rc-line b{text-align:right}
    .rc-amount{margin-top:auto;background:#f1f8f4;border:.3mm solid #9ec7b8;border-left:1.2mm solid #0d7a5f;border-radius:2mm;padding:2.8mm 4.2mm;display:flex;flex-direction:column;gap:.9mm}
    .rc-amount span{font-size:6.6pt;color:#4c5f56;letter-spacing:.5px}
    .rc-amount b{font-size:16pt;font-weight:800;color:#0a5c47;line-height:1.05}
    .rc-amount small{font-size:6.6pt;color:#4c5f56;font-style:italic}
    .rc-notes{font-size:7.2pt;color:#4c5f56;border-top:.2mm dashed #c9d8d2;padding-top:1.8mm}
    .rc-foot-note{font-size:7.6pt;color:#0a5c47;font-weight:600}
    .rc-foot{display:flex;justify-content:space-between;align-items:flex-end;gap:3mm;padding:2.6mm 5.5mm 2mm;border-top:.3mm solid #d9e5e0;background:#fbfdfc}
    .rc-verify{display:flex;flex-direction:column;gap:1mm;min-width:0}
    /* compact inline security code — caption + code share one line, smaller
       type, so the footer stays short and nothing slides into the cut zone. */
    .rc-verify-copy{display:flex;align-items:baseline;gap:1.6mm;min-width:0}
    .rc-vcap{font-size:5.4pt;font-weight:700;color:#0a5c47;letter-spacing:.6px}
    .rc-vcode{font-size:8.5pt;font-weight:800;letter-spacing:.8px;color:#0a5c47}
    .rc-vhint{font-size:5.4pt;color:#5d6f67;max-width:56mm;line-height:1.25}
    .rc-thanks{font-size:6.6pt;font-weight:600;color:#3c4a43;margin-bottom:.4mm}
    /* Signature block (bottom-right): the "signed" mark over the Secretary
       line over the mahallu name — the classic Kerala receipt sign-off. */
    .rc-sign{text-align:right;flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:.6mm;min-width:30mm}
    .rc-sd{font-size:8.4pt;font-weight:600;font-style:italic;color:#2c3a33}
    .rc-sec{font-size:8pt;font-weight:700;letter-spacing:.3px;color:#101a14}
    .rc-for-line{font-size:7.6pt;color:#101a14;font-weight:700}
  `;
}

/** One receipt on its own A6 page — the WhatsApp PDF copy & single print. */
export function buildReceiptHtml(r: ReceiptData, lang: Lang): string {
  const L = labels(lang);
  const font = getPoppinsCss() + getAnekMalayalamCss();
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
    @page{size:105mm 148mm;margin:0}${font}${baseCss()}
    html,body{width:105mm;height:148mm}
    .rc{border:0}
  </style></head><body>${receiptCard(r, L)}</body></html>`;
}

/** Four receipts per A4 page (2×2 grid, dashed cut guides between cells). */
export function buildReceiptSheetHtml(list: ReceiptData[], lang: Lang): string {
  const L = labels(lang);
  const font = getPoppinsCss() + getAnekMalayalamCss();
  const cells = list.map((r) => receiptCard(r, L));
  const pages: string[] = [];
  for (let i = 0; i < cells.length; i += 4) {
    const four = cells.slice(i, i + 4);
    while (four.length < 4) four.push('');
    pages.push(`<section class="sheet">${four.map((c) => `<div class="cell">${c || ''}</div>`).join('')}<div class="sheet-foot">${esc(L.page)} ${pages.length + 1} · ${esc(String(list.length))} ${lang === 'ml' ? 'രസീതുകൾ' : 'receipts'} · 4 / A4</div></section>`);
  }
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
    @page{size:A4 portrait;margin:0}${font}${baseCss()}
    html,body{width:210mm}
    /* rows 140.5mm → a 16mm printable strip stays free at the sheet bottom;
       the counter sits at 7mm where paper-feed margins cannot cut it. */
    .sheet{width:210mm;height:297mm;position:relative;display:grid;grid-template-columns:105mm 105mm;grid-template-rows:140.5mm 140.5mm;page-break-after:always;break-after:page}
    .sheet:last-child{page-break-after:auto;break-after:auto}
    .cell{position:relative}
    .cell .rc{border:0;width:105mm;height:140.5mm}
    .cell:nth-child(odd){border-right:.25mm dashed #9db3aa}
    .cell:nth-child(-n+2){border-bottom:.25mm dashed #9db3aa}
    .sheet-foot{position:absolute;right:5mm;bottom:7mm;font-size:5.5pt;color:#84938c;letter-spacing:.3px}
  </style></head><body>${pages.join('')}</body></html>`;
}

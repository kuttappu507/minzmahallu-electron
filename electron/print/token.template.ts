import { esc } from './utils.js';

export function buildTokenSheetHtml(tokenList: any[], event: any): string {
  const makeCard = (t: any) => `
    <article class="ticket">
      <div class="accent"></div>
      <header class="brand">
        <div class="logo">M</div>
        <div class="brand-copy"><strong>MINZ MAHALLU</strong><small>Mahallu Management System</small></div>
        <span class="badge">EVENT TOKEN</span>
      </header>
      <div class="event">${esc(event?.event_name || 'Event')}</div>
      <div class="meta">${esc(event?.event_date || '')}${event?.event_time ? ` · ${esc(event.event_time)}` : ''}${event?.venue ? ` · ${esc(event.venue)}` : ''}</div>
      <div class="code-label">TOKEN NUMBER</div>
      <div class="code">${esc(t.token_code)}</div>
      <div class="details">
        <div><span>FAMILY</span><b>${esc(t.house_name || t.family_number || '—')}</b></div>
        <div><span>HOUSE NO.</span><b>${esc(t.house_number || t.family_number || '—')}</b></div>
        <div><span>WARD</span><b>${esc(t.ward || '—')}</b></div>
      </div>
      <footer><span>Present this token at the event</span><b>VALID</b></footer>
    </article>`;

  const pages: string[] = [];
  for (let i = 0; i < tokenList.length; i += 12) {
    const pageTokens = tokenList.slice(i, i + 12);
    pages.push(`<section class="token-page">${pageTokens.map(makeCard).join('')}</section>`);
  }

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:A4 portrait;margin:0}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;width:210mm;background:#fff}
    body{font-family:Poppins,"Segoe UI",Arial,sans-serif;color:#18231e;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .token-page{width:210mm;height:297mm;padding:8mm 8mm 15mm;display:grid;grid-template-columns:95mm 95mm;grid-template-rows:43mm 43mm 43mm 43mm 43mm 43mm;column-gap:4mm;row-gap:3mm;page-break-after:always;break-after:page;overflow:hidden}
    .token-page:last-child{page-break-after:auto;break-after:auto}
    .ticket{width:95mm;height:43mm;border:.35mm solid #d1e1da;border-radius:2.8mm;padding:3.8mm 4mm 3mm 5mm;position:relative;overflow:hidden;display:flex;flex-direction:column;background:#fff}
    .accent{position:absolute;left:0;top:0;bottom:0;width:1.7mm;background:#159b78}
    .brand{height:8mm;display:flex;align-items:center;gap:2.2mm;min-width:0}
    .logo{width:7mm;height:7mm;flex:0 0 7mm;border-radius:1.8mm;background:#159b78;color:#fff;display:grid;place-items:center;font-size:4mm;font-weight:800}
    .brand-copy{min-width:0}.brand strong{display:block;font-size:2.35mm;line-height:1.15;letter-spacing:.075em}.brand small{display:block;font-size:1.55mm;line-height:1.25;color:#718078;margin-top:.6mm}
    .badge{margin-left:auto;flex:0 0 auto;font-size:1.5mm;color:#138466;font-weight:700;letter-spacing:.09em}
    .event{font-size:2.9mm;line-height:1.2;font-weight:650;margin-top:1.3mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .meta{font-size:1.7mm;line-height:1.2;color:#718078;margin-top:.55mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .code-label{text-align:center;font-size:1.45mm;color:#819088;letter-spacing:.13em;margin-top:1.2mm}
    .code{font:800 7.5mm/1 "Courier New",monospace;letter-spacing:.11em;text-align:center;margin:.7mm 0 1.1mm;color:#15231d}
    .details{border-top:.25mm solid #e2ebe6;padding-top:1.35mm;display:grid;grid-template-columns:1.55fr 1fr .7fr;gap:2.5mm;min-width:0}
    .details span{display:block;font-size:1.4mm;line-height:1.1;color:#819088;letter-spacing:.03em}.details b{display:block;font-size:2.05mm;line-height:1.2;font-weight:650;margin-top:.35mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ticket footer{margin-top:auto;padding-top:1.15mm;border-top:.2mm solid #edf3ef;display:flex;justify-content:space-between;align-items:center;font-size:1.45mm;line-height:1;color:#819088}.ticket footer b{color:#138466;letter-spacing:.08em}
  </style></head><body>${pages.join('')}</body></html>`;
}

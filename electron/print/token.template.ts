import { esc } from './utils.js';

export function buildTokenSheetHtml(tokenList: any[], event: any): string {
  const cards = tokenList.map((t: any) => `
    <article class="ticket">
      <div class="accent"></div>
      <header class="brand"><div class="logo">M</div><div><strong>MINZ MAHALLU</strong><small>Mahallu Management System</small></div><span class="badge">EVENT TOKEN</span></header>
      <div class="event">${esc(event?.event_name || 'Event')}</div>
      <div class="meta">${esc(event?.event_date || '')}${event?.event_time ? ` · ${esc(event.event_time)}` : ''}${event?.venue ? ` · ${esc(event.venue)}` : ''}</div>
      <div class="code">${esc(t.token_code)}</div>
      <div class="details"><div><span>Family</span><b>${esc(t.house_name || t.family_number || '—')}</b></div><div><span>House No.</span><b>${esc(t.house_number || t.family_number || '—')}</b></div><div><span>Ward</span><b>${esc(t.ward || '—')}</b></div></div>
      <footer>Present this token at the event <b>VALID</b></footer>
    </article>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;padding:0;width:210mm;font-family:Poppins,"Segoe UI",Arial,sans-serif;color:#18231e;-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{padding:9mm;display:grid;grid-template-columns:1fr 1fr;gap:4mm}.ticket{height:43mm;border:.35mm solid #d2e2db;border-radius:3mm;padding:4mm 4.5mm 3mm;position:relative;overflow:hidden;display:flex;flex-direction:column;background:#fff}.accent{position:absolute;left:0;top:0;bottom:0;width:1.8mm;background:#159b78}.brand{display:flex;align-items:center;gap:2.5mm}.logo{width:7mm;height:7mm;border-radius:2mm;background:#159b78;color:#fff;display:grid;place-items:center;font-size:4mm;font-weight:800}.brand strong{font-size:2.5mm;letter-spacing:.08em;display:block}.brand small{font-size:1.6mm;color:#718078;display:block}.badge{margin-left:auto;font-size:1.55mm;color:#138466;font-weight:700;letter-spacing:.1em}.event{font-size:3.1mm;font-weight:650;margin-top:2.1mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.meta{font-size:1.8mm;color:#718078;margin-top:.5mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.code{font:800 8.3mm/1 "Courier New",monospace;letter-spacing:.09em;text-align:center;margin:2.3mm 0 1.7mm}.details{border-top:.25mm solid #e2ebe6;padding-top:1.6mm;display:grid;grid-template-columns:1.5fr 1fr .7fr;gap:3mm}.details span{display:block;font-size:1.55mm;color:#819088}.details b{display:block;font-size:2.2mm;margin-top:.35mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ticket footer{margin-top:auto;padding-top:1.4mm;border-top:.2mm solid #edf3ef;display:flex;justify-content:space-between;font-size:1.5mm;color:#819088}.ticket footer b{color:#138466;letter-spacing:.08em}</style></head><body><main class="sheet">${cards}</main></body></html>`;
}

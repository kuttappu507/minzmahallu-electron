import { esc } from './utils.js';

const palettes = [
  { head:'#1e3a8a', line:'#eab308', tokenBg:'#eef2fb', tokenLine:'#c9d4f0', tokenNum:'#1e3a8a', eventBg:'#fdf6e4', eventLine:'#ecd9a0', eventName:'#1e3a8a', eventTime:'#a16207', sep:'#d4a017', chipBg:'#f5f3ec', acc1:'#d4a017', acc2:'#0d9488' },
  { head:'#047857', line:'#eab308', tokenBg:'#ecfdf5', tokenLine:'#a7e3c9', tokenNum:'#065f46', eventBg:'#fdf6e4', eventLine:'#ecd9a0', eventName:'#065f46', eventTime:'#a16207', sep:'#d4a017', chipBg:'#f3f6f2', acc1:'#d4a017', acc2:'#0369a1' },
  { head:'#7c2d3b', line:'#e0a458', tokenBg:'#fdf0f0', tokenLine:'#eec3c3', tokenNum:'#7c2d3b', eventBg:'#fdf3ec', eventLine:'#ecd0b8', eventName:'#7c2d3b', eventTime:'#b45309', sep:'#e0a458', chipBg:'#f7f2ee', acc1:'#e0a458', acc2:'#0f766e' },
  { head:'#6d28d9', line:'#f0abfc', tokenBg:'#f4efff', tokenLine:'#d8c8fb', tokenNum:'#5b21b6', eventBg:'#faf5ff', eventLine:'#e9d5ff', eventName:'#5b21b6', eventTime:'#7e22ce', sep:'#a855f7', chipBg:'#f5f3ff', acc1:'#a855f7', acc2:'#0891b2' },
  { head:'#0f766e', line:'#facc15', tokenBg:'#ecfeff', tokenLine:'#b9e4e7', tokenNum:'#115e59', eventBg:'#f0fdfa', eventLine:'#bce8df', eventName:'#115e59', eventTime:'#0f766e', sep:'#d4a017', chipBg:'#f0f7f6', acc1:'#d4a017', acc2:'#2563eb' },
  { head:'#c2410c', line:'#fbbf24', tokenBg:'#fff7ed', tokenLine:'#fed7aa', tokenNum:'#9a3412', eventBg:'#fffaf0', eventLine:'#fed7aa', eventName:'#9a3412', eventTime:'#c2410c', sep:'#d97706', chipBg:'#fff7ed', acc1:'#d97706', acc2:'#0f766e' },
  { head:'#1d4ed8', line:'#22c55e', tokenBg:'#eff6ff', tokenLine:'#bfdbfe', tokenNum:'#1e40af', eventBg:'#eff6ff', eventLine:'#bfdbfe', eventName:'#1e40af', eventTime:'#1d4ed8', sep:'#16a34a', chipBg:'#f3f7fb', acc1:'#16a34a', acc2:'#0891b2' },
];

function paletteForTokenIndex(index:number){return palettes[Math.abs(index)%palettes.length];}

export function buildTokenSheetHtml(tokenList: any[], event: any): string {
  const eventOffset = Math.max(0, Number(event?.id || 1) - 1);
  const makeCard = (t:any,cardIndex:number)=>{
    const p=paletteForTokenIndex(cardIndex + eventOffset);
    const headName=t.house_head_name || t.head_name || '—';
    const time=event?.event_time || '';
    const timeWithAmPm=time && !/\b(?:AM|PM)\b/i.test(time) ? `${time} AM` : time;
    return `
    <article class="card" style="--head:${p.head};--line:${p.line};--tokenBg:${p.tokenBg};--tokenLine:${p.tokenLine};--tokenNum:${p.tokenNum};--eventBg:${p.eventBg};--eventLine:${p.eventLine};--eventName:${p.eventName};--eventTime:${p.eventTime};--sep:${p.sep};--chipBg:${p.chipBg};--acc1:${p.acc1};--acc2:${p.acc2}">
      <header class="head">
        <h1>MINZ MAHALLU</h1>
        <p>Mahallu Management System</p>
      </header>
      <div class="mid">
        <div class="token"><small>CARD NO</small><b>${esc(t.token_code)}</b></div>
        <div class="family"><span class="lbl">HOUSE HEAD</span><h2>${esc(headName)}</h2><h3>${esc(t.house_name || '—')}</h3></div>
        <div class="regs"><div class="r1"><small>FAMILY NO</small><b>${esc(t.family_number || '—')}</b></div><div class="r2"><small>WARD NO</small><b>${esc(t.ward || '—')}</b></div></div>
      </div>
      <footer class="event"><h4>${esc(event?.event_name || 'Event')}</h4><p><b>${esc(timeWithAmPm)}</b>${timeWithAmPm && event?.venue ? `<span class="sep">◆</span>` : ''}${event?.venue ? `VENUE: ${esc(event.venue)}` : ''}</p></footer>
    </article>`;
  };

  const pages: string[] = [];
  for (let i = 0; i < tokenList.length; i += 12) pages.push(`<section class="page">${tokenList.slice(i, i + 12).map((t,idx)=>makeCard(t,i+idx)).join('')}</section>`);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:A4 portrait;margin:0}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:210mm;margin:0;padding:0;background:#fff}
    body{font-family:"Segoe UI",Arial,Helvetica,sans-serif;color:#1e293b;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{width:210mm;height:297mm;padding:8mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(6,44.75mm);gap:2.5mm;page-break-after:always;break-after:page;overflow:hidden}
    .page:last-child{page-break-after:auto;break-after:auto}
    .card{border:.4mm solid var(--tokenLine);border-radius:2.5mm;overflow:hidden;display:flex;flex-direction:column;background:#fff}
    .head{background:var(--head);color:#fff;text-align:center;padding:1.6mm 2mm 1.3mm;border-bottom:.7mm solid var(--line);min-height:10mm}
    .head h1{font-size:10.5pt;font-weight:700;letter-spacing:.4px;text-transform:uppercase;line-height:1.15}.head p{font-size:5.9pt;opacity:.92;margin-top:.5mm;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .mid{flex:1;display:flex;align-items:stretch;gap:2mm;padding:1mm 2mm;background:#fff;overflow:hidden}
    .token{width:15.5mm;background:var(--tokenBg);border:.35mm solid var(--tokenLine);border-radius:2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6mm;flex:none}.token small{font-size:4.6pt;font-weight:800;letter-spacing:1.2px;color:var(--eventTime)}.token b{font-size:12pt;color:var(--tokenNum);letter-spacing:.5px}
    .family{flex:1;text-align:center;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:.5mm}.family .lbl{font-size:4.6pt;letter-spacing:1.6px;color:#a8a29e;font-weight:700}.family h2{font-size:11.5pt;color:#1e293b;font-weight:800;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.family h3{font-size:8pt;color:#64748b;font-weight:600;letter-spacing:.5px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .regs{width:19.5mm;display:flex;flex-direction:column;justify-content:center;gap:1.1mm;flex:none}.regs div{background:var(--chipBg);border-radius:1.5mm;padding:.9mm 1.3mm;min-width:0}.regs .r1{border-left:.7mm solid var(--acc1)}.regs .r2{border-left:.7mm solid var(--acc2)}.regs small{display:block;font-size:4.6pt;letter-spacing:.55px;color:#64748b;font-weight:700;white-space:nowrap}.regs b{font-size:8.6pt;color:#1e293b;white-space:nowrap}
    .event{background:var(--eventBg);border-top:.3mm solid var(--eventLine);text-align:center;padding:1.3mm 2mm 1.5mm}.event h4{font-size:11.5pt;font-weight:800;color:var(--eventName);letter-spacing:.8px;text-transform:uppercase;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.event p{font-size:6.4pt;color:#475569;margin-top:.6mm;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.event p b{color:var(--eventTime)}.event .sep{color:var(--sep);margin:0 1.2mm}
  </style></head><body>${pages.join('')}</body></html>`;
}

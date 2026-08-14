from pathlib import Path
import re

for p in [
    Path('public/fonts/Gayathri-Bold.ttf'), Path('public/fonts/Gayathri-Regular.ttf'),
    Path('src/assets/fonts/Gayathri-Bold.ttf'), Path('src/assets/fonts/Gayathri-Regular.ttf')
]:
    if p.exists(): p.unlink()

css = Path('src/styles/globals.css')
s = css.read_text()
s = re.sub(r'@font-face\s*\{\s*font-family:\s*Gayathri;.*?\}\s*@font-face\s*\{\s*font-family:\s*Gayathri;.*?\}\s*', '', s, flags=re.S)
start = s.find('/* Malayalam:')
if start >= 0:
    end = s.find('\n\n  input, textarea', start)
    if end >= 0:
        block = '''/* Malayalam typography — Anek Malayalam is bundled through Fontsource. */
  html.lang-ml *,
  html.lang-ml body,
  html.lang-ml input,
  html.lang-ml button,
  html.lang-ml select,
  html.lang-ml textarea {
    font-family: "Anek Malayalam Variable", Poppins, sans-serif !important;
    font-weight: 450 !important;
    line-height: 1.45;
  }

  html.lang-ml th,
  html.lang-ml thead th,
  html.lang-ml .font-semibold,
  html.lang-ml .font-bold,
  html.lang-ml strong,
  html.lang-ml b {
    font-weight: 650 !important;
  }'''
        s = s[:start] + block + s[end:]
css.write_text(s)

over = Path('src/styles/overrides.css')
existing = over.read_text()
if '/* ===== Visual refinement pass ===== */' not in existing:
    with over.open('a') as f:
        f.write('''\n\n/* ===== Visual refinement pass ===== */\n.data-table table { width: 100%; table-layout: fixed; }\n.data-table th, .data-table td { vertical-align: middle; }\n.data-table th { font-size: 12px !important; font-weight: 650 !important; line-height: 1.35; white-space: nowrap; padding: 12px 16px !important; }\n.data-table td { font-size: 14px !important; line-height: 1.45; padding: 13px 16px !important; }\n.data-table th:first-child, .data-table td:first-child { padding-left: 18px !important; }\n.data-table th:last-child, .data-table td:last-child { padding-right: 18px !important; }\n.data-table tbody tr { min-height: 48px; }\n.data-table tbody tr:hover { background: color-mix(in srgb, var(--em) 4%, transparent); }\n.stat-grid .sval, .stat-grid .stat-value, .stat-grid .val { font-size: 32px !important; line-height: 1.05; font-weight: 650 !important; letter-spacing: -0.02em; }\n.stat-grid .slab, .stat-grid .stat-label, .stat-grid .label { font-size: 11.5px !important; line-height: 1.35; font-weight: 600 !important; }\n.stat-grid .sdelta, .stat-grid .stat-delta, .stat-grid .delta { font-size: 11px !important; }\ninput:not([type="checkbox"]):not([type="radio"]), textarea, select { font-size: 15px !important; line-height: 1.45; }\nlabel, .label, .field-label { font-size: 12.5px !important; font-weight: 600 !important; }\nbutton { font-size: 13.5px; }\n.rep-card, .stat-card, .card, .panel { border-radius: 12px; }\n.dlg-pad { padding: 22px !important; }\nhtml.lang-ml .data-table th, html.lang-ml thead th { font-size: 13px !important; font-weight: 650 !important; line-height: 1.4; }\nhtml.lang-ml .data-table td { font-size: 14.5px !important; line-height: 1.55; }\nhtml.lang-ml input, html.lang-ml textarea, html.lang-ml select { font-size: 15.5px !important; line-height: 1.55; }\n''')

main = Path('electron/main.ts')
s = main.read_text()
start = s.index('// ===== Token sheet HTML builder')
end = s.index('// ===== IPC:')
new_block = '''// ===== Print document builders =====
function printCss(extra = ""): string {
  return `@page { size: A4 portrait; margin: 0; } * { box-sizing: border-box; } html, body { margin:0; padding:0; width:210mm; background:#fff; } body { font-family:Poppins, "Segoe UI", Arial, sans-serif; color:#17231d; -webkit-print-color-adjust:exact; print-color-adjust:exact; } ${extra}`;
}

function buildTokenSheetHtml(tokenList: any[], event: any): string {
  const eventName = event?.event_name || "Event", eventDate = event?.event_date || "", venue = event?.venue || "", eventTime = event?.event_time || "";
  const tokens = tokenList.map((t:any) => {
    const family=t.house_name||t.family_number||"—", house=t.house_number||t.family_number||"—", ward=t.ward||"—";
    return `<article class="ticket"><div class="ticket-accent"></div><div class="brand"><span class="brand-mark">M</span><div><b>MINZ MAHALLU</b><small>Mahallu Management System</small></div></div><div class="eyebrow">EVENT TOKEN</div><div class="event">${esc(eventName)}</div><div class="date">${esc(eventDate)}${eventTime?` · ${esc(eventTime)}`:""}${venue?` · ${esc(venue)}`:""}</div><div class="token-number">${esc(t.token_code)}</div><div class="details"><div><span>Family</span><b>${esc(family)}</b></div><div><span>House No.</span><b>${esc(house)}</b></div><div><span>Ward</span><b>${esc(ward)}</b></div></div><div class="ticket-foot"><span>Present this token at the event</span><span>VALID TOKEN</span></div></article>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${printCss(`
    .sheet{padding:10mm;display:grid;grid-template-columns:1fr 1fr;gap:4mm}.ticket{height:42mm;border:.45mm solid #b9d8cb;border-radius:3.5mm;padding:4.5mm 5mm 3.5mm;position:relative;overflow:hidden;background:#fff;display:flex;flex-direction:column}.ticket-accent{position:absolute;left:0;top:0;bottom:0;width:2.2mm;background:#0eab7f}.brand{display:flex;align-items:center;gap:2.5mm}.brand-mark{width:7mm;height:7mm;border-radius:2mm;background:#0eab7f;color:#fff;display:grid;place-items:center;font-size:4mm;font-weight:800}.brand b{display:block;font-size:2.5mm;letter-spacing:.12em}.brand small{display:block;font-size:1.65mm;color:#718178;margin-top:.6mm}.eyebrow{margin-top:2mm;color:#0b916c;font-size:1.75mm;font-weight:700;letter-spacing:.18em}.event{font-size:3.1mm;font-weight:650;margin-top:.5mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.date{font-size:1.8mm;color:#718178;margin-top:.6mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.token-number{margin:2.4mm 0 1.8mm;font-family:"Courier New",monospace;font-size:8.5mm;line-height:.9;letter-spacing:.12em;font-weight:800;color:#17231d;text-align:center}.details{border-top:.25mm solid #e1ebe5;padding-top:1.8mm;display:grid;grid-template-columns:1.5fr 1fr .7fr;gap:3mm}.details span{display:block;color:#819189;font-size:1.7mm}.details b{display:block;font-size:2.2mm;margin-top:.5mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ticket-foot{margin-top:auto;padding-top:1.7mm;display:flex;justify-content:space-between;color:#819189;font-size:1.55mm}.ticket-foot span:last-child{color:#0b916c;font-weight:700;letter-spacing:.08em}`)}</style></head><body><main class="sheet">${tokens}</main></body></html>`;
}

function buildCollectionSheetHtml(tokenList:any[], event:any): string {
  const eventName=event?.event_name||"Event", eventDate=event?.event_date||"";
  const rows=tokenList.map((t:any,i:number)=>`<tr><td>${i+1}</td><td class="code">${esc(t.token_code)}</td><td>${esc(t.house_name||t.family_number||"—")}</td><td>${esc(t.house_number||t.family_number||"—")}</td><td>${esc(t.ward||"—")}</td><td class="check">□</td><td></td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${printCss(`
    .page{padding:15mm 13mm}.mast{display:flex;align-items:center;justify-content:space-between;border-bottom:.35mm solid #cfe2d8;padding-bottom:5mm;margin-bottom:6mm}.brand{display:flex;align-items:center;gap:3mm}.mark{width:10mm;height:10mm;border-radius:3mm;background:#0eab7f;color:#fff;display:grid;place-items:center;font-size:5mm;font-weight:800}h1{margin:0;font-size:6mm;letter-spacing:.02em}.sub{color:#718178;font-size:2.5mm;margin-top:1mm}.eventbox{text-align:right}.eventbox b{display:block;font-size:3.2mm;color:#0b916c}.eventbox span{font-size:2.2mm;color:#718178}table{width:100%;border-collapse:separate;border-spacing:0;border:.3mm solid #d7e5dd;border-radius:2mm;overflow:hidden}th{background:#f2f7f4;color:#51635a;font-size:2.2mm;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:3mm 2.5mm;text-align:left;border-bottom:.3mm solid #d7e5dd}td{font-size:2.8mm;padding:2.8mm 2.5mm;border-bottom:.25mm solid #e4ece7}tr:last-child td{border-bottom:0}td:first-child{text-align:center;width:10mm;color:#819189}td.code{font-family:"Courier New",monospace;font-size:3.1mm;font-weight:700;color:#0b916c;letter-spacing:.06em}.check{text-align:center;font-size:4mm;width:15mm}td:last-child{width:32mm}.foot{margin-top:5mm;display:flex;justify-content:space-between;color:#819189;font-size:2mm}`)}</style></head><body><section class="page"><header class="mast"><div class="brand"><div class="mark">M</div><div><h1>Token Collection Sheet</h1><div class="sub">Minz Mahallu · Mahallu Management System</div></div></div><div class="eventbox"><b>${esc(eventName)}</b><span>${esc(eventDate)}</span></div></header><table><thead><tr><th>No.</th><th>Token</th><th>Family</th><th>House No.</th><th>Ward</th><th>Collected</th><th>Signature</th></tr></thead><tbody>${rows}</tbody></table><div class="foot"><span>Verify each returned token before marking collected.</span><span>Total: ${tokenList.length}</span></div></section></body></html>`;
}

function buildCertificateHtml(cert:any): string {
  const type=String(cert?.type||"Certificate").toLowerCase(); const titleMap:any={membership:"MEMBERSHIP CERTIFICATE",residence:"RESIDENCE CERTIFICATE",marriage:"MARRIAGE CERTIFICATE",death:"DEATH CERTIFICATE"}; const title=titleMap[type]||`${esc(cert?.type||"")} CERTIFICATE`; const issued=cert?.issued_date?new Date(cert.issued_date).toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"}):""; const issuedTo=cert?.issued_to||"—";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${printCss(`
    .certificate{width:210mm;height:297mm;padding:14mm;position:relative;background:#fff}.frame{position:absolute;inset:9mm;border:.5mm solid #b8d8ca;border-radius:2mm}.frame:before{content:"";position:absolute;inset:3mm;border:.2mm solid #dceae3;border-radius:1mm}.topbar{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:flex-start;padding:7mm 8mm 0}.brand{display:flex;align-items:center;gap:3mm}.mark{width:14mm;height:14mm;border-radius:4mm;background:#0eab7f;color:#fff;display:grid;place-items:center;font-size:7mm;font-weight:800}.brand b{display:block;font-size:4.2mm;letter-spacing:.06em}.brand small{display:block;color:#718178;font-size:2.2mm;margin-top:1mm}.meta{text-align:right;color:#718178;font-size:2.2mm;line-height:1.7}.meta b{color:#17231d;font-size:2.5mm}.hero{text-align:center;position:relative;z-index:1;margin-top:24mm}.eyebrow{font-size:2.2mm;letter-spacing:.22em;color:#0b916c;font-weight:700}.title{font-size:9mm;line-height:1.05;letter-spacing:.06em;color:#17231d;font-weight:750;margin-top:3mm}.rule{width:28mm;height:.6mm;background:#0eab7f;margin:5mm auto 10mm;border-radius:1mm}.body{text-align:center;max-width:158mm;margin:0 auto;position:relative;z-index:1}.body .intro{font-size:3.8mm;color:#596b62;line-height:1.8}.name{display:inline-block;margin:7mm 0 6mm;padding:0 12mm 3mm;border-bottom:.45mm solid #0eab7f;color:#0b916c;font-size:7mm;font-weight:650}.body .desc{font-size:3.3mm;color:#394941;line-height:1.9}.ref{margin:10mm auto 0;display:inline-flex;gap:10mm;padding:3mm 7mm;border:.25mm solid #d7e5dd;border-radius:2mm;background:#f7faf8}.ref div{text-align:left}.ref span{display:block;color:#819189;font-size:1.9mm;text-transform:uppercase;letter-spacing:.08em}.ref b{display:block;font-size:2.8mm;margin-top:.7mm}.bottom{position:absolute;z-index:1;left:22mm;right:22mm;bottom:25mm;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12mm;align-items:end}.sig{text-align:center}.sigline{border-top:.3mm solid #4e5e56;height:9mm}.siglabel{font-size:2.2mm;color:#718178}.seal{width:27mm;height:27mm;border:.45mm dashed #0eab7f;border-radius:50%;margin:auto;display:grid;place-items:center;text-align:center;color:#0b916c;font-size:2mm;letter-spacing:.06em}.footer{position:absolute;z-index:1;left:22mm;right:22mm;bottom:13mm;border-top:.25mm solid #e4ece7;padding-top:2mm;display:flex;justify-content:space-between;color:#8a9992;font-size:1.8mm}`)}</style></head><body><main class="certificate"><div class="frame"></div><header class="topbar"><div class="brand"><div class="mark">M</div><div><b>MINZ MAHALLU</b><small>Mahallu Management System</small></div></div><div class="meta"><span>Certificate No.</span><b>${esc(cert?.certificate_number||"—")}</b><br><span>Issued ${esc(issued)}</span></div></header><section class="hero"><div class="eyebrow">OFFICIAL DOCUMENT</div><div class="title">${title}</div><div class="rule"></div><div class="body"><div class="intro">This is to certify that</div><div class="name">${esc(issuedTo)}</div><div class="desc">is a registered record maintained by Minz Mahallu Management System.<br>This certificate is issued upon verification of the corresponding Mahallu records.</div><div class="ref"><div><span>Reference</span><b>${esc(cert?.reference_id??"—")}</b></div><div><span>Issue Date</span><b>${esc(issued)}</b></div></div></div></section><section class="bottom"><div class="sig"><div class="sigline"></div><div class="siglabel">Secretary</div></div><div class="seal">OFFICIAL<br>SEAL</div><div class="sig"><div class="sigline"></div><div class="siglabel">President</div></div></section><footer class="footer"><span>Minz Mahallu · Official Certificate</span><span>Issued by: ${esc(cert?.issued_by||"Mahallu Office")}</span></footer></main></body></html>`;
}
'''
s = s[:start] + new_block + s[end:]
main.write_text(s)

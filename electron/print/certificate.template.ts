import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { esc } from './utils.js';

const require = createRequire(import.meta.url);

function getAnekMalayalamCss(): string {
  try {
    const cssPath = require.resolve('@fontsource-variable/anek-malayalam/wght.css');
    const css = readFileSync(cssPath, 'utf8');
    const cssDir = dirname(cssPath);
    return css.replace(/url\((['"]?)([^'"\)]+)\1\)/g, (_m, quote: string, relativePath: string) => {
      if (/^(data:|https?:|file:)/i.test(relativePath)) return `url(${quote}${relativePath}${quote})`;
      try {
        const fontPath = resolve(cssDir, relativePath);
        const base64 = readFileSync(fontPath).toString('base64');
        return `url("data:font/woff2;base64,${base64}")`;
      } catch { return `url(${quote}${relativePath}${quote})`; }
    });
  } catch { return '@font-face{font-family:"Anek Malayalam Variable";font-weight:100 800;src:local("Anek Malayalam")}'; }
}

export function buildCertificateHtml(cert: any, lang: 'en' | 'ml' = 'en'): string {
  const type = String(cert?.type || 'certificate').toLowerCase();
  const ml = lang === 'ml';
  const labels: Record<string, string> = ml
    ? { membership: 'അംഗത്വ സർട്ടിഫിക്കറ്റ്', residence: 'വസതി സർട്ടിഫിക്കറ്റ്', marriage: 'വിവാഹ സർട്ടിഫിക്കറ്റ്', death: 'മരണ സർട്ടിഫിക്കറ്റ്', certificate: 'സർട്ടിഫിക്കറ്റ്' }
    : { membership: 'MEMBERSHIP CERTIFICATE', residence: 'RESIDENCE CERTIFICATE', marriage: 'MARRIAGE CERTIFICATE', death: 'DEATH CERTIFICATE', certificate: 'CERTIFICATE' };
  const title = labels[type] || labels.certificate;
  const number = esc(cert?.certificate_number || cert?.certificateNo || '—');
  const name = esc(cert?.issued_to || cert?.member_name || cert?.name || '—');
  const mahallu = esc(cert?.mahallu_name || cert?.mahallu || 'Minz Mahallu');
  const issued = cert?.issued_date ? new Date(cert.issued_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
  const typeLabel = ml ? 'സർട്ടിഫിക്കറ്റ് തരം' : 'Certificate Type';
  const numberLabel = ml ? 'സർട്ടിഫിക്കറ്റ് നമ്പർ' : 'Certificate No.';
  const dateLabel = ml ? 'നൽകിയ തീയതി' : 'Issued Date';
  const mahalluLabel = ml ? 'മഹല്ല്' : 'Mahallu';
  const certifyText = ml ? 'ഇതുവഴി സാക്ഷ്യപ്പെടുത്തുന്നത്' : 'This is to certify that';
  const officialDocument = ml ? 'ഔദ്യോഗിക രേഖ' : 'OFFICIAL DOCUMENT';
  const authorityText = ml ? 'മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റിയുടെ അധികാരപ്രകാരം നൽകുന്നു.' : 'Issued under the authority of the Mahallu Management Committee.';
  const signatureText = ml ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : '${lang === 'ml' ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : 'Authorized Signatory'}';
  const committeeText = ml ? 'മഹല്ല് കമ്മിറ്റി' : '${lang === 'ml' ? 'മഹല്ല് കമ്മിറ്റി' : 'Mahallu Committee'}';
  const purpose = ml
    ? type === 'residence' ? 'മുകളിൽ പറഞ്ഞ വ്യക്തിയുടെ മഹല്ലിലെ രജിസ്റ്റർ ചെയ്ത വസതി സ്ഥിരീകരിക്കുന്നതാണ് ഈ സർട്ടിഫിക്കറ്റ്.' : type === 'membership' ? 'മുകളിൽ പറഞ്ഞ വ്യക്തിയുടെ മഹല്ലിലെ രജിസ്റ്റർ ചെയ്ത അംഗത്വം സ്ഥിരീകരിക്കുന്നതാണ് ഈ സർട്ടിഫിക്കറ്റ്.' : type === 'marriage' ? 'മുകളിൽ പറഞ്ഞ വിവരങ്ങൾ മഹല്ല് രജിസ്റ്ററിൽ രേഖപ്പെടുത്തിയിരിക്കുന്നതാണെന്ന് സാക്ഷ്യപ്പെടുത്തുന്നു.' : type === 'death' ? 'മുകളിൽ പറഞ്ഞ വ്യക്തിയുടെ മരണവുമായി ബന്ധപ്പെട്ട രേഖ മഹല്ല് രജിസ്റ്ററിൽ രേഖപ്പെടുത്തിയിട്ടുണ്ടെന്ന് സാക്ഷ്യപ്പെടുത്തുന്നു.' : 'ഔദ്യോഗിക ആവശ്യങ്ങൾക്കായി മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റി നൽകുന്നതാണ് ഈ സർട്ടിഫിക്കറ്റ്.'
    : type === 'residence' ? 'This certificate confirms the above person’s registered residence in the Mahallu.' : type === 'membership' ? 'This certificate confirms the above person’s registered membership in the Mahallu.' : type === 'marriage' ? 'This certifies that the above details are recorded in the Mahallu register.' : type === 'death' ? 'This certifies that the death record of the above person is recorded in the Mahallu register.' : 'This certificate is issued by the Mahallu Management Committee for official purposes.';
  const anekCss = getAnekMalayalamCss();
  return `<!doctype html><html lang="${ml ? 'ml' : 'en'}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${anekCss}@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;width:210mm;min-height:297mm;background:#fff}body{font-family:"Anek Malayalam Variable","Anek Malayalam",Poppins,"Nirmala UI","Segoe UI",Arial,sans-serif;color:#18231e;-webkit-print-color-adjust:exact;print-color-adjust:exact}.certificate{width:210mm;height:297mm;position:relative;padding:18mm 20mm;overflow:hidden}.frame{position:absolute;inset:9mm;border:.5mm solid #9fcfbc}.inner{position:absolute;inset:12mm;border:.18mm solid #dce9e3}.corner{position:absolute;width:14mm;height:14mm;border-color:#159b78;border-style:solid}.c1{left:11mm;top:11mm;border-width:.8mm 0 0 .8mm}.c2{right:11mm;top:11mm;border-width:.8mm .8mm 0 0}.c3{left:11mm;bottom:11mm;border-width:0 0 .8mm .8mm}.c4{right:11mm;bottom:11mm;border-width:0 .8mm .8mm 0}.header{text-align:center;position:relative;z-index:1}.official{display:inline-block;margin-top:2mm;padding:1.5mm 5mm;border:.3mm solid #b9d8cc;border-radius:999px;color:#397260;font-size:9pt;font-weight:600;letter-spacing:1.5px}.brand{margin-top:7mm;font-size:12pt;font-weight:600;letter-spacing:1px;color:#397260}h1{margin:5mm 0 2mm;color:#116f58;font-size:24pt;line-height:1.2}.subtitle{color:#64736d;font-size:10pt}.divider{width:34mm;height:.6mm;margin:5mm auto 0;background:#159b78}.meta{margin-top:13mm;display:grid;grid-template-columns:1fr 1fr;gap:4mm;text-align:left}.meta-item{padding:4mm;border:.2mm solid #dce9e3;border-radius:2mm}.meta-label{color:#708078;font-size:8pt}.meta-value{margin-top:1.5mm;font-size:10.5pt;font-weight:600}.body-copy{margin-top:16mm;text-align:center;line-height:1.8;font-size:11pt}.name{margin:5mm auto;padding-bottom:2mm;width:125mm;border-bottom:.4mm solid #159b78;color:#116f58;font-size:19pt;font-weight:700}.purpose{margin:8mm auto 0;max-width:145mm;color:#596963}.footer{position:absolute;left:20mm;right:20mm;bottom:23mm;display:grid;grid-template-columns:1fr 1fr;gap:20mm}.sign{padding-top:15mm;border-top:.25mm solid #8fa9a0;text-align:center;font-size:8.5pt;color:#53655e}.sign b{display:block;color:#263a33;font-size:9.5pt}.sign small{display:block;margin-top:1mm}.authority{position:absolute;left:25mm;right:25mm;bottom:11mm;text-align:center;color:#71817b;font-size:7.5pt}</style></head><body><main class="certificate"><div class="frame"></div><div class="inner"></div><div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div><header class="header"><span class="official">${officialDocument}</span><div class="brand">${mahallu}</div><h1>${esc(title)}</h1><div class="subtitle">${certifyText}</div><div class="divider"></div></header><section class="meta"><div class="meta-item"><div class="meta-label">${numberLabel}</div><div class="meta-value">${number}</div></div><div class="meta-item"><div class="meta-label">${dateLabel}</div><div class="meta-value">${esc(issued)}</div></div><div class="meta-item"><div class="meta-label">${typeLabel}</div><div class="meta-value">${esc(title)}</div></div><div class="meta-item"><div class="meta-label">${mahalluLabel}</div><div class="meta-value">${mahallu}</div></div></section><section class="body-copy"><div>${certifyText}</div><div class="name">${name}</div><div class="purpose">${purpose}</div></section><div class="footer"><div class="sign"><b>${signatureText}</b><small>${committeeText}</small></div><div class="sign"><b>${committeeText}</b><small>${authorityText}</small></div></div><div class="authority">${esc(authorityText)}</div></main></body></html>`;
}

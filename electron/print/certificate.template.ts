import { esc } from './utils.js';

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
  const issued = cert?.issued_date
    ? new Date(cert.issued_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';

  const typeLabel = ml ? 'സർട്ടിഫിക്കറ്റ് തരം' : 'Certificate Type';
  const numberLabel = ml ? 'സർട്ടിഫിക്കറ്റ് നമ്പർ' : 'Certificate No.';
  const dateLabel = ml ? 'നൽകിയ തീയതി' : 'Issued Date';
  const mahalluLabel = ml ? 'മഹല്ല്' : 'Mahallu';
  const certifyText = ml ? 'ഇതുവഴി സാക്ഷ്യപ്പെടുത്തുന്നത്' : 'This is to certify that';
  const officialDocument = ml ? 'ഔദ്യോഗിക രേഖ' : 'OFFICIAL DOCUMENT';
  const authorityText = ml
    ? 'മിൻസ് മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റിയുടെ അധികാരപ്രകാരം നൽകുന്നു.'
    : '${lang === 'ml' ? 'മിൻസ് മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റിയുടെ അധികാരപ്രകാരം നൽകുന്നു.' : '${lang === 'ml' ? 'മിൻസ് മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റിയുടെ അധികാരപ്രകാരം നൽകുന്നു.' : '${lang === 'ml' ? 'മിൻസ് മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റിയുടെ അധികാരപ്രകാരം നൽകുന്നു.' : '${lang === 'ml' ? 'മിൻസ് മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റിയുടെ അധികാരപ്രകാരം നൽകുന്നു.' : '${lang === 'ml' ? 'മിൻസ് മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റിയുടെ അധികാരപ്രകാരം നൽകുന്നു.' : '${lang === 'ml' ? 'മിൻസ് മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റിയുടെ അധികാരപ്രകാരം നൽകുന്നു.' : '${lang === 'ml' ? 'മിൻസ് മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റിയുടെ അധികാരപ്രകാരം നൽകുന്നു.' : 'Issued under the authority of the Minz Mahallu Management Committee.'}'}'}'}'}'}'}';
  const signatureText = ml ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : '${lang === 'ml' ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : '${lang === 'ml' ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : '${lang === 'ml' ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : '${lang === 'ml' ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : '${lang === 'ml' ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : '${lang === 'ml' ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : '${lang === 'ml' ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : 'Authorized Signatory'}'}'}'}'}'}'}';
  const committeeText = ml ? 'മഹല്ല് കമ്മിറ്റി' : '${lang === 'ml' ? 'മഹല്ല് കമ്മിറ്റി' : '${lang === 'ml' ? 'മഹല്ല് കമ്മിറ്റി' : '${lang === 'ml' ? 'മഹല്ല് കമ്മിറ്റി' : '${lang === 'ml' ? 'മഹല്ല് കമ്മിറ്റി' : '${lang === 'ml' ? 'മഹല്ല് കമ്മിറ്റി' : '${lang === 'ml' ? 'മഹല്ല് കമ്മിറ്റി' : '${lang === 'ml' ? 'മഹല്ല് കമ്മിറ്റി' : 'Mahallu Committee'}'}'}'}'}'}'}';
  const sealText = ml ? 'മിൻസ് മഹല്ല് ഔദ്യോഗികം' : 'MINZ MAHALLU OFFICIAL';
  const purpose = ml
    ? type === 'residence'
      ? 'മുകളിൽ പറഞ്ഞ വ്യക്തിയുടെ മിൻസ് മഹല്ലിലെ രജിസ്റ്റർ ചെയ്ത വസതി സ്ഥിരീകരിക്കുന്നതാണ് ഈ സർട്ടിഫിക്കറ്റ്.'
      : type === 'membership'
        ? 'മുകളിൽ പറഞ്ഞ വ്യക്തിയുടെ മിൻസ് മഹല്ലിലെ രജിസ്റ്റർ ചെയ്ത അംഗത്വം സ്ഥിരീകരിക്കുന്നതാണ് ഈ സർട്ടിഫിക്കറ്റ്.'
        : 'ഔദ്യോഗിക ആവശ്യങ്ങൾക്കായി മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റി നൽകുന്നതാണ് ഈ സർട്ടിഫിക്കറ്റ്.'
    : type === 'residence'
      ? 'This certificate confirms the above person’s registered residence in Minz Mahallu.'
      : type === 'membership'
        ? 'This certificate confirms the above person’s registered membership in Minz Mahallu.'
        : 'This certificate is issued by the Mahallu Management Committee for official purposes.';

  return `<!doctype html>
<html lang="${ml ? 'ml' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;width:210mm;min-height:297mm;background:#fff}body{font-family:Poppins,"Noto Sans Malayalam","Nirmala UI","Segoe UI",Arial,sans-serif;color:#18231e;-webkit-print-color-adjust:exact;print-color-adjust:exact}.certificate{width:210mm;height:297mm;position:relative;padding:18mm 20mm;overflow:hidden}.frame{position:absolute;inset:9mm;border:.5mm solid #9fcfbc}.inner{position:absolute;inset:12mm;border:.18mm solid #dce9e3}.corner{position:absolute;width:14mm;height:14mm;border-color:#159b78;border-style:solid}.c1{left:11mm;top:11mm;border-width:.8mm 0 0 .8mm}.c2{right:11mm;top:11mm;border-width:.8mm .8mm 0 0}.c3{left:11mm;bottom:11mm;border-width:0 0 .8mm .8mm}.c4{right:11mm;bottom:11mm;border-width:0 .8mm 0 0}.header{text-align:center;position:relative;z-index:1}.official{display:inline-block;margin-top:2mm;padding:1.5mm 5mm;border:.3mm solid #b9d8cc;border-radius:999px;color:#397260;font-size:9pt;font-weight:600;letter-spacing:1.5px}.brand{margin-top:7mm;font-size:12pt;font-weight:600;letter-spacing:1px;color:#397260}h1{margin:5mm 0 2mm;color:#116f58;font-size:24pt;letter-spacing:1.5px}.subtitle{color:#64736d;font-size:10pt}.divider{width:34mm;height:.6mm;margin:5mm auto 0;background:#159b78}.meta{margin-top:13mm;display:grid;grid-template-columns:1fr 1fr;gap:4mm;text-align:left}.meta-item{padding:4mm;border:.2mm solid #dce9e3;border-radius:2mm}.meta-label{color:#708078;font-size:8pt;text-transform:uppercase;letter-spacing:.7px}.meta-value{margin-top:1.5mm;font-size:10.5pt;font-weight:600}.body-copy{margin-top:16mm;text-align:center;line-height:1.8;font-size:11pt}.certify{color:#66756f;font-size:10pt}.name{margin:4mm 0;color:#126b56;font-size:21pt;font-weight:700}.purpose{max-width:145mm;margin:5mm auto 0;color:#4e5d57;font-size:10.5pt}.authority{margin-top:8mm;color:#5d6d66;font-size:9.5pt}.footer{position:absolute;left:20mm;right:20mm;bottom:18mm;display:flex;justify-content:space-between;align-items:flex-end;z-index:1}.signature{width:48mm;text-align:center}.signature-line{height:13mm;border-bottom:.3mm solid #6f8178}.signature-label{margin-top:2mm;font-size:8.5pt;color:#52635b}.signature-role{margin-top:1mm;font-size:8pt;color:#7a8882}.seal{width:29mm;height:29mm;border:.6mm solid #159b78;border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;color:#159b78;font-size:7pt;font-weight:700;letter-spacing:.5px;padding:4mm}.footer-note{width:48mm;font-size:8pt;color:#7a8882}.footer-note strong{display:block;color:#53645c;margin-bottom:1mm}@media print{html,body{width:210mm;height:297mm}}
</style>
</head>
<body>
<div class="certificate">
<div class="frame"></div><div class="inner"></div>
<div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div>
<header class="header"><div class="official">${esc(officialDocument)}</div><div class="brand">${mahallu}</div><h1>${esc(title)}</h1><div class="subtitle">${esc(certifyText)}</div><div class="divider"></div></header>
<section class="meta">
<div class="meta-item"><div class="meta-label">${esc(typeLabel)}</div><div class="meta-value">${esc(title)}</div></div>
<div class="meta-item"><div class="meta-label">${esc(numberLabel)}</div><div class="meta-value">${number}</div></div>
<div class="meta-item"><div class="meta-label">${esc(mahalluLabel)}</div><div class="meta-value">${mahallu}</div></div>
<div class="meta-item"><div class="meta-label">${esc(dateLabel)}</div><div class="meta-value">${esc(issued)}</div></div>
</section>
<main class="body-copy"><div class="certify">${esc(certifyText)}</div><div class="name">${name}</div><div class="purpose">${esc(purpose)}</div><div class="authority">${esc(authorityText)}</div></main>
<footer class="footer"><div class="footer-note"><strong>${esc(committeeText)}</strong>${ml ? 'ഔദ്യോഗിക രേഖ' : 'Official document'}</div><div class="seal">${esc(sealText)}</div><div class="signature"><div class="signature-line"></div><div class="signature-label">${esc(signatureText)}</div><div class="signature-role">${esc(committeeText)}</div></div></footer>
</div>
</body>
</html>`;
}

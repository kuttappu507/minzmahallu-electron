import { esc } from './utils.js';

export function buildCertificateHtml(cert: any, lang: "en" | "ml" = "en"): string {
  const type = String(cert?.type || 'certificate').toLowerCase();
  const labels: Record<string, string> = lang === 'ml' ? {
    membership: 'അംഗത്വ സർട്ടിഫിക്കറ്റ്',
    residence: 'വസതി സർട്ടിഫിക്കറ്റ്',
    marriage: 'വിവാഹ സർട്ടിഫിക്കറ്റ്',
    death: 'മരണ സർട്ടിഫിക്കറ്റ്',
  } : {
    membership: 'MEMBERSHIP CERTIFICATE',
    residence: 'RESIDENCE CERTIFICATE',
    marriage: 'MARRIAGE CERTIFICATE',
    death: 'DEATH CERTIFICATE',
  };

  const title = labels[type] || `${esc(cert?.type || 'CERTIFICATE').toUpperCase()} CERTIFICATE`;
  const number = cert?.certificate_number || cert?.certificateNo || '—';
  const name = cert?.issued_to || cert?.member_name || cert?.name || '—';
  const issued = cert?.issued_date
    ? new Date(cert.issued_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  const purpose = lang === 'ml'
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

  const authorityText = lang === 'ml'
    ? 'മിൻസ് മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റിയുടെ അധികാരപ്രകാരം നൽകുന്നു.'
    : '${lang === 'ml' ? 'മിൻസ് മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റിയുടെ അധികാരപ്രകാരം നൽകുന്നു.' : '${lang === 'ml' ? 'മിൻസ് മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റിയുടെ അധികാരപ്രകാരം നൽകുന്നു.' : '${lang === 'ml' ? 'മിൻസ് മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റിയുടെ അധികാരപ്രകാരം നൽകുന്നു.' : '${lang === 'ml' ? 'മിൻസ് മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റിയുടെ അധികാരപ്രകാരം നൽകുന്നു.' : '${lang === 'ml' ? 'മിൻസ് മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റിയുടെ അധികാരപ്രകാരം നൽകുന്നു.' : '${lang === 'ml' ? 'മിൻസ് മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റിയുടെ അധികാരപ്രകാരം നൽകുന്നു.' : '${lang === 'ml' ? 'മിൻസ് മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റിയുടെ അധികാരപ്രകാരം നൽകുന്നു.' : '${lang === 'ml' ? 'മിൻസ് മഹല്ല് മാനേജ്മെന്റ് കമ്മിറ്റിയുടെ അധികാരപ്രകാരം നൽകുന്നു.' : 'Issued under the authority of the Minz Mahallu Management Committee.'}'}'}'}'}'}'}'}';
  const signatureText = lang === 'ml' ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : '${lang === 'ml' ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : '${lang === 'ml' ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : '${lang === 'ml' ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : '${lang === 'ml' ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : '${lang === 'ml' ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : '${lang === 'ml' ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : '${lang === 'ml' ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : '${lang === 'ml' ? 'അധികൃത ഒപ്പുവെപ്പുകാരൻ' : 'Authorized Signatory'}'}'}'}'}'}'}'}';
  const committeeText = lang === 'ml' ? 'മഹല്ല് കമ്മിറ്റി' : '${lang === 'ml' ? 'മഹല്ല് കമ്മിറ്റി' : '${lang === 'ml' ? 'മഹല്ല് കമ്മിറ്റി' : '${lang === 'ml' ? 'മഹല്ല് കമ്മിറ്റി' : '${lang === 'ml' ? 'മഹല്ല് കമ്മിറ്റി' : '${lang === 'ml' ? 'മഹല്ല് കമ്മിറ്റി' : '${lang === 'ml' ? 'മഹല്ല് കമ്മിറ്റി' : '${lang === 'ml' ? 'മഹല്ല് കമ്മിറ്റി' : '${lang === 'ml' ? 'മഹല്ല് കമ്മിറ്റി' : 'Mahallu Committee'}'}'}'}'}'}'}'}';
  const typeLabel = lang === 'ml' ? 'സർട്ടിഫിക്കറ്റ് തരം' : 'Certificate Type';
  const numberLabel = lang === 'ml' ? 'സർട്ടിഫിക്കറ്റ് നമ്പർ' : 'Certificate No.';
  const dateLabel = lang === 'ml' ? 'നൽകിയ തീയതി' : 'Issued Date';
  const mahalluLabel = lang === 'ml' ? 'മഹല്ല്' : 'Mahallu';
  const officialDocument = lang === 'ml' ? 'ഔദ്യോഗിക രേഖ' : 'OFFICIAL DOCUMENT';
  const certifyText = lang === 'ml' ? 'ഇതുവഴി സാക്ഷ്യപ്പെടുത്തുന്നത്' : 'This is to certify that';
  const sealText = lang === 'ml' ? 'മിൻസ് മഹല്ല് ഔദ്യോഗികം' : 'MINZ MAHALLU OFFICIAL';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page{size:A4 portrait;margin:0}
  *{box-sizing:border-box}
  html,body{margin:0;width:210mm;height:297mm;background:#fff}
  body{font-family:Poppins,"Segoe UI",Arial,sans-serif;color:#18231e;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .certificate{width:210mm;height:297mm;position:relative;padding:18mm 20mm}
  .frame{position:absolute;inset:9mm;border:.5mm solid #9fcfbc}
  .inner{position:absolute;inset:12mm;border:.18mm solid #dce9e3}
  .corner{position:absolute;width:14mm;height:14mm;border-color:#159b78;border-style:solid}
  .c1{left:11mm;top:11mm;border-width:.8mm 0 0 .8mm}
  .c2{right:11mm;top:11mm;border-width:.8mm .8mm 0 0}
  .c3{left:11mm;bottom:11mm;border-width:0 0 .8mm .8mm}
  .c4{right:11mm;bottom:11mm;border-width:0 .8mm .8mm 0}
  .top{position:relative;display:flex;justify-content:space-between;align-items:center}
  .brand{display:flex;align-items:center;gap:3.2mm}
  .logo{width:14mm;height:14mm;border-radius:4mm;background:#159b78;color:#fff;display:grid;place-items:center;font-size:7mm;font-weight:800}
  .brand strong{display:block;font-size:4.3mm;line-height:1.1;letter-spacing:.07em}
  .brand small{display:block;font-size:2.1mm;color:#718078;margin-top:1.1mm}
  .meta{text-align:right;font-size:2.2mm;line-height:1.55;color:#718078}
  .meta b{color:#18231e;font-size:2.7mm}
  .hero{position:relative;text-align:center;margin-top:27mm}
  .eyebrow{font-size:2.2mm;letter-spacing:.27em;color:#138466;font-weight:700}
  .title{font-size:8mm;line-height:1.1;font-weight:700;letter-spacing:.055em;margin-top:3.5mm}
  .rule{width:44mm;height:.5mm;background:#159b78;margin:5.5mm auto}
  .intro{font-size:3.4mm;color:#718078;margin-top:15mm}
  .name{font-size:9mm;line-height:1.15;font-weight:700;margin:5mm auto;color:#18231e;max-width:165mm}
  .body-copy{width:145mm;margin:auto;font-size:3.5mm;line-height:1.85;color:#42524b}
  .info{position:relative;margin:18mm 13mm 0;border-top:.25mm solid #dce9e3;border-bottom:.25mm solid #dce9e3;padding:5mm 0;display:grid;grid-template-columns:1fr 1fr;column-gap:13mm;row-gap:4mm}
  .info div{display:grid;grid-template-columns:1fr auto;gap:5mm;align-items:baseline;font-size:2.65mm}
  .info span{color:#819088}
  .info b{font-weight:650;text-align:right}
  .purpose{position:relative;margin:8mm 25mm 0;text-align:center;font-size:2.45mm;color:#718078;line-height:1.6}
  .bottom{position:absolute;left:24mm;right:24mm;bottom:20mm;display:flex;justify-content:space-between;align-items:flex-end}
  .sig{width:46mm;text-align:center;border-top:.25mm solid #718078;padding-top:2.2mm;font-size:2.3mm;color:#50615a}
  .seal{width:25mm;height:25mm;border:.45mm solid #9fcfbc;border-radius:50%;display:grid;place-items:center;color:#138466;font-size:1.8mm;line-height:1.35;font-weight:700;text-align:center;background:#fbfefd}
</style>
</head>
<body>
<main class="certificate">
  <div class="frame"></div><div class="inner"></div>
  <div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div>
  <header class="top">
    <div class="brand"><div class="logo">M</div><div><strong>MINZ MAHALLU</strong><small>Mahallu Management System</small></div></div>
    <div class="meta">${esc(numberLabel)}<br><b>${esc(number)}</b><br>${esc(issued)}</div>
  </header>
  <section class="hero">
    <div class="eyebrow">${esc(officialDocument)}</div>
    <div class="title">${esc(title)}</div>
    <div class="rule"></div>
    <div class="intro">${esc(certifyText)}</div>
    <div class="name">${esc(name)}</div>
    <div class="body-copy">${esc(purpose)}</div>
  </section>
  <section class="info">
    <div><span>${esc(typeLabel)}</span><b>${esc(cert?.type || '—')}</b></div>
    <div><span>${esc(numberLabel)}</span><b>${esc(number)}</b></div>
    <div><span>${esc(dateLabel)}</span><b>${esc(issued || '—')}</b></div>
    <div><span>${esc(mahalluLabel)}</span><b>Minz Mahallu</b></div>
  </section>
  <div class="purpose">${esc(authorityText)}</div>
  <footer class="bottom">
    <div class="sig">${esc(signatureText)}</div>
    <div class="seal">${esc(sealText)}</div>
    <div class="sig">${esc(committeeText)}</div>
  </footer>
</main>
</body>
</html>`;
}

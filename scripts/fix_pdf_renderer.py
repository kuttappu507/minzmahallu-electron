from pathlib import Path

p = Path('electron/main.ts')
s = p.read_text(encoding='utf-8')

marker = '// ===== Robust HTML-to-PDF renderer ====='
if marker not in s:
    helper = '''

// ===== Robust HTML-to-PDF renderer =====
async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const pdfWin = new BrowserWindow({
    show: false,
    width: 794,
    height: 1123,
    useContentSize: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      offscreen: false,
      sandbox: false,
    },
  });

  try {
    const dataUrl = 'data:text/html;charset=UTF-8,' + encodeURIComponent(html);
    await pdfWin.loadURL(dataUrl);

    await pdfWin.webContents.executeJavaScript(`
      document.documentElement.style.width = '210mm';
      document.body.style.width = '210mm';
      void document.body.offsetHeight;
      ({
        bodyWidth: document.body.scrollWidth,
        bodyHeight: document.body.scrollHeight,
        htmlWidth: document.documentElement.scrollWidth,
        htmlHeight: document.documentElement.scrollHeight
      });
    `);

    await new Promise(resolve => setTimeout(resolve, 150));

    return await pdfWin.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: false,
    });
  } finally {
    if (!pdfWin.isDestroyed()) pdfWin.destroy();
  }
}
'''
    s = s.replace('// ===== Token sheet HTML builder', helper + '\n// ===== Token sheet HTML builder', 1)

old_generic = '''      // Create a hidden BrowserWindow to render the HTML
      const pdfWin = new BrowserWindow({
        show: false,
        webPreferences: { offscreen: true },
      });
      const base64Html = Buffer.from(html).toString("base64"); await pdfWin.loadURL("data:text/html;base64," + base64Html);
      // Wait for content to render
      await new Promise(r => setTimeout(r, 500));
      const pdfBuffer = await pdfWin.webContents.printToPDF({
        pageSize: "A4",
        printBackground: true,
        margins: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
        preferCSSPageSize: true,
      });
      pdfWin.close();'''
if old_generic in s:
    s = s.replace(old_generic, '      const pdfBuffer = await renderHtmlToPdf(html);', 1)

old_cert = '''      const pdfWin = new BrowserWindow({ show: false, webPreferences: { } });
      // Use loadURL with base64 encoding for large HTML
      const base64Html = Buffer.from(html).toString("base64");
      await pdfWin.loadURL("data:text/html;base64," + base64Html);
      await new Promise(r => setTimeout(r, 1000));
      const pdfBuffer = await pdfWin.webContents.printToPDF({
        pageSize: "A4", printBackground: true,
        margins: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
        preferCSSPageSize: true,
      });
      pdfWin.close();'''
if old_cert in s:
    s = s.replace(old_cert, '      const pdfBuffer = await renderHtmlToPdf(html);', 1)

old_tokens = '''      const pdfWin = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
      const base64Html = Buffer.from(html).toString("base64"); await pdfWin.loadURL("data:text/html;base64," + base64Html);
      await new Promise(r => setTimeout(r, 500));
      const pdfBuffer = await pdfWin.webContents.printToPDF({
        pageSize: "A4", printBackground: true,
        margins: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
        preferCSSPageSize: true,
      });
      pdfWin.close();'''
if s.count(old_tokens) == 2:
    s = s.replace(old_tokens, '      const pdfBuffer = await renderHtmlToPdf(html);', 2)

p.write_text(s, encoding='utf-8')
print('PDF renderer patch applied')

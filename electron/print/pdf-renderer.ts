/*
 * Offscreen HTML → PDF / print renderer (shared by main.ts handlers and the
 * receipt service).
 *
 * Runs untrusted HTML in a sandboxed, isolated hidden BrowserWindow: no
 * preload, no node integration, sandbox enforced, webSecurity on. The
 * Electron runtime is resolved lazily so importing this module from plain
 * Node (vitest) stays side-effect free.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
function electron(): typeof import("electron") {
  return require("electron");
}

/** Wait for web fonts (Anek Malayalam) so glyphs render in the PDF. */
async function waitForFonts(win: import("electron").BrowserWindow): Promise<void> {
  try {
    await win.webContents.executeJavaScript(`
      (async () => {
        if (document.fonts) {
          await document.fonts.ready;
          await Promise.all([
            document.fonts.load('700 12pt "Anek Malayalam"'),
            document.fonts.load('400 12pt "Anek Malayalam"')
          ]);
        }
        document.documentElement.style.width = 'auto';
        document.body.style.width = 'auto';
        void document.body.offsetHeight;
        return true;
      })()
    `);
    await new Promise((resolve) => setTimeout(resolve, 50));
  } catch { /* fonts are best-effort; latin still renders */ }
}

function newHiddenWindow(width: number, height: number): import("electron").BrowserWindow {
  const { BrowserWindow } = electron();
  return new BrowserWindow({
    show: false,
    width,
    height,
    useContentSize: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: undefined,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
}

/** Render HTML to a PDF buffer. The page size comes from the HTML's own
 * `@page{size:…}` rule (preferCSSPageSize) — A4 statements, A6 receipts. */
export async function renderHtmlToPdf(html: string, opts: { width?: number; height?: number } = {}): Promise<Buffer> {
  const win = newHiddenWindow(opts.width ?? 794, opts.height ?? 1123);
  try {
    await win.loadURL("data:text/html;charset=UTF-8," + encodeURIComponent(html));
    await waitForFonts(win);
    return await win.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: true,
    });
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/** Send HTML to the system print dialog (A4 sheets / single A6 receipts —
 * the @page rule drives layout). Resolves false if the user cancels. */
export async function printHtml(html: string, opts: { width?: number; height?: number } = {}): Promise<{ printed: boolean; cancelled?: boolean; reason?: string }> {
  const win = newHiddenWindow(opts.width ?? 794, opts.height ?? 1123);
  try {
    await win.loadURL("data:text/html;charset=UTF-8," + encodeURIComponent(html));
    await waitForFonts(win);
    return await new Promise((resolve) => {
      let settled = false;
      const finish = (result: { printed: boolean; cancelled?: boolean; reason?: string }) => {
        if (settled) return;
        settled = true;
        try { if (!win.isDestroyed()) win.destroy(); } catch { /* already gone */ }
        resolve(result);
      };
      try {
        win.webContents.print({ printBackground: true, silent: false }, (success: boolean, reason: string) => {
          const cancelled = /cancel/i.test(String(reason || ""));
          finish({ printed: !!success, cancelled, reason: String(reason || "") });
        });
        // Safety net: if the print dialog never calls back (headless
        // environments), resolve after 10 minutes instead of hanging forever.
        setTimeout(() => finish({ printed: false, cancelled: true, reason: "print-dialog-timeout" }), 10 * 60 * 1000).unref?.();
      } catch (err: any) {
        finish({ printed: false, reason: String(err?.message || err) });
      }
    });
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

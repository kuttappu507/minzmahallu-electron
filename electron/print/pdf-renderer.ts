/*
 * Offscreen HTML → PDF renderer (shared by main.ts handlers and the
 * receipt service). Receipts and certificates leave the app as PDF files —
 * there is no direct-to-printer path; the admin prints the saved PDF from
 * any viewer.
 *
 * Runs untrusted HTML in a sandboxed, isolated hidden BrowserWindow: no
 * preload, no node integration, sandbox enforced, webSecurity on. The
 * Electron runtime is resolved lazily so importing this module from plain
 * Node (vitest) stays side-effect free.
 *
 * PERFORMANCE (user report: "receipt sending in subscription and donation
 * takes too much time"). Every render used to CREATE a hidden BrowserWindow —
 * a full renderer-process spawn, worth hundreds of milliseconds and up to
 * seconds on a cold machine or behind antivirus — load one document into it,
 * print it, then DESTROY it again. Receipts are produced one after another
 * (save a payment → send the receipt → next family), so that start-up cost was
 * paid on every single receipt. The window is now kept WARM and reused:
 *   · renders are serialized through a queue (one document per webContents),
 *   · a wedged/crashed warm window is rebuilt transparently and the render
 *     retried once,
 *   · `prewarmPdfRenderer()` builds it shortly after start-up so even the
 *     first receipt of the day is fast,
 *   · `disposePdfRenderer()` releases it when the app quits.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
function electron(): typeof import("electron") {
  return require("electron");
}

// Test seam (see resetPdfRendererForTests at the bottom): a fake window
// factory so the reuse/serialization/retry logic is testable outside Electron.
let windowFactoryOverride: ((width: number, height: number) => unknown) | null = null;

/** Wait for web fonts (Anek Malayalam) so glyphs render in the PDF. */
async function waitForFonts(win: import("electron").BrowserWindow): Promise<void> {
  try {
    await win.webContents.executeJavaScript(`
      (async () => {
        if (document.fonts) {
          await document.fonts.ready;
          await Promise.all([
            document.fonts.load('700 12pt "Anek Malayalam Variable"'),
            document.fonts.load('400 12pt "Anek Malayalam Variable"'),
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
  // Test seam — vitest has no Electron, so tests inject a fake window and can
  // then pin the reuse/serialization/retry behaviour that every PDF in the
  // app (receipts, certificates, statements, registers) now depends on.
  if (windowFactoryOverride) return windowFactoryOverride(width, height) as import("electron").BrowserWindow;
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

const PDF_OPTIONS = {
  pageSize: "A4" as const,
  printBackground: true,
  margins: { top: 0, bottom: 0, left: 0, right: 0 },
  // The page size comes from the HTML's own `@page{size:…}` rule — A4
  // statements, A6 receipts — so ONE warm window serves every template.
  preferCSSPageSize: true,
};

let warmWin: import("electron").BrowserWindow | null = null;
let disposed = false;
/** Renders run one at a time: a single webContents cannot host two documents
 *  at once, and printToPDF must not overlap a loadURL. */
let renderQueue: Promise<unknown> = Promise.resolve();

function destroyWarmWindow(): void {
  const win = warmWin;
  warmWin = null;
  if (!win) return;
  try { if (!win.isDestroyed()) win.destroy(); } catch { /* already gone */ }
}

/** The reusable render window, (re)built on demand. Null when Electron is not
 *  available (plain-Node tests) or window creation failed — callers then fall
 *  back to the old one-shot window. */
function warmWindow(width: number, height: number): import("electron").BrowserWindow | null {
  if (disposed) return null;
  try {
    if (warmWin && !warmWin.isDestroyed() && !warmWin.webContents.isDestroyed() && !warmWin.webContents.isCrashed()) {
      // Keep the content box in step with the requested page (layout widths
      // are mm-based, so this only matters for templates without @page).
      const [w, h] = warmWin.getContentSize();
      if (w !== width || h !== height) warmWin.setContentSize(width, height);
      return warmWin;
    }
  } catch { /* unusable — rebuild below */ }
  try {
    const win = newHiddenWindow(width, height);
    win.webContents.once("render-process-gone", () => destroyWarmWindow());
    win.webContents.once("destroyed", () => { if (warmWin === win) warmWin = null; });
    warmWin = win;
    return win;
  } catch {
    warmWin = null;
    return null;
  }
}

async function renderInto(win: import("electron").BrowserWindow, html: string): Promise<Buffer> {
  await win.loadURL("data:text/html;charset=UTF-8," + encodeURIComponent(html));
  await waitForFonts(win);
  return win.webContents.printToPDF(PDF_OPTIONS);
}

/** One-shot render in a throw-away window (the pre-warm-window behaviour). */
async function renderEphemeral(html: string, width: number, height: number): Promise<Buffer> {
  const win = newHiddenWindow(width, height);
  try {
    return await renderInto(win, html);
  } finally {
    try { if (!win.isDestroyed()) win.destroy(); } catch { /* already gone */ }
  }
}

async function renderOnce(html: string, width: number, height: number): Promise<Buffer> {
  const win = warmWindow(width, height);
  if (!win) return renderEphemeral(html, width, height);
  try {
    return await renderInto(win, html);
  } catch (err) {
    // The warm window can wedge (crashed renderer, aborted load, a document
    // that threw during layout). Drop it and retry ONCE — first with a fresh
    // warm window, then with a throw-away one, so a render never fails just
    // because the reuse path did.
    destroyWarmWindow();
    const retry = warmWindow(width, height);
    if (retry) {
      try { return await renderInto(retry, html); } catch { destroyWarmWindow(); }
    }
    try {
      return await renderEphemeral(html, width, height);
    } catch (retryErr) {
      throw err instanceof Error ? err : retryErr;
    }
  }
}

// A render that never settles would now hold up EVERY later PDF (the queue is
// shared), so each one is capped. On timeout the warm window is destroyed,
// which makes its pending loadURL/printToPDF reject and the queue move on.
const RENDER_TIMEOUT_MS = 45_000;
let renderTimeoutMs = RENDER_TIMEOUT_MS;

async function renderWithTimeout(html: string, width: number, height: number): Promise<Buffer> {
  const work = renderOnce(html, width, height);
  // Swallow a late rejection from the losing side of the race — the main
  // process turns unhandled rejections into an error dialog.
  work.catch(() => { /* reported through the race, or dropped on timeout */ });
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      destroyWarmWindow();
      reject(new Error("PDF rendering timed out — please try again"));
    }, renderTimeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Render HTML to a PDF buffer. The page size comes from the HTML's own
 * `@page{size:…}` rule (preferCSSPageSize) — A4 statements, A6 receipts. */
export async function renderHtmlToPdf(html: string, opts: { width?: number; height?: number } = {}): Promise<Buffer> {
  const width = opts.width ?? 794;
  const height = opts.height ?? 1123;
  // Queue on success AND on failure: one broken render must not wedge the
  // queue for every receipt that follows it.
  const job = renderQueue.then(
    () => renderWithTimeout(html, width, height),
    () => renderWithTimeout(html, width, height),
  );
  renderQueue = job.then(() => undefined, () => undefined);
  return job;
}

/** Build the render window ahead of the first PDF so the first receipt of a
 *  session does not pay the renderer start-up cost. Best-effort: silently a
 *  no-op outside Electron. */
export function prewarmPdfRenderer(): void {
  if (disposed) return;
  try { warmWindow(794, 1123); } catch { /* best effort */ }
}

/** Release the warm window (app quit). Later renders fall back to one-shot
 *  windows, so this is safe to call early. */
export function disposePdfRenderer(): void {
  disposed = true;
  destroyWarmWindow();
}

/** Test seam — swap in a fake window factory and reset the module state
 *  (warm window, queue, disposed flag) so each case starts clean. Call with
 *  no argument to go back to the real Electron path. */
export function resetPdfRendererForTests(
  factory?: ((width: number, height: number) => unknown) | null,
  opts: { renderTimeoutMs?: number } = {}
): void {
  destroyWarmWindow();
  windowFactoryOverride = factory ?? null;
  renderQueue = Promise.resolve();
  disposed = false;
  renderTimeoutMs = opts.renderTimeoutMs ?? RENDER_TIMEOUT_MS;
}

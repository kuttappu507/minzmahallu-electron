/*
 * Instant native splash — the FIRST thing MMS shows after a double-click.
 *
 * User report (Task 44): on office PCs there was a long dead gap between
 * double-clicking the icon and the first visible pixel, because every heavy
 * module (baileys, exceljs, electron-updater) loaded at main.ts import time
 * and all boot work ran BEFORE any window existed. The fix has two halves:
 *
 *   1. THIS window — a tiny frameless BrowserWindow whose HTML is a single
 *      data: URL (zero file reads on the critical path beyond the small
 *      logo, zero network, zero renderer bundle). Created as the very first
 *      statement of app.whenReady(), it paints within ~100-300 ms of process
 *      start and stays up while everything else boots behind it.
 *
 *   2. main.ts reordering — heavy imports became dynamic (loaded UNDER this
 *      splash), and the real renderer window only takes over once it is
 *      ready-to-show, at which point the native splash is destroyed.
 *
 * Electron itself is resolved lazily (createRequire, same pattern as
 * pdf-renderer) so the pure HTML builder stays unit-testable in vitest and
 * importing this module costs nothing before the window is actually made.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const require = createRequire(import.meta.url);
function electron(): typeof import("electron") {
  return require("electron");
}

/* Logo lives in the Vite renderer output (public/logo.png -> dist/logo.png).
 * Both in dev and packaged the electron out dir sits beside dist/, and asar
 * archives are transparent to fs.readFileSync, so one relative path covers
 * every layout. Best-effort: without a logo the splash still renders (the
 * initial letter takes its place). */
export function findSplashLogoDataUrl(): string | null {
  const candidates = [path.join(__dirname, "..", "dist", "logo.png"), path.join(process.cwd(), "dist", "logo.png")];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const buf = fs.readFileSync(p);
      if (!buf.length || buf.length > 512 * 1024) continue;
      return `data:image/png;base64,${buf.toString("base64")}`;
    } catch { /* try next candidate */ }
  }
  return null;
}

/**
 * Builds the complete standalone splash document. Pure string work — no DOM,
 * no Electron — so tests can assert on it directly. All assets are inline
 * (SVG pattern is a data URI; logo arrives as a data URL): the document must
 * never touch the network or the file system at load time, which is exactly
 * what makes it paint instantly.
 */
export function buildSplashHtml(opts: { version: string; logoDataUrl?: string | null }): string {
  const version = String(opts.version ?? "").replace(/[^0-9A-Za-z.\-+]/g, "");
  const logo = opts.logoDataUrl
    ? `<img class="logo" src="${opts.logoDataUrl}" alt="" />`
    : `<div class="logo logo-fallback">M</div>`;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>MMS</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(165deg, #12a396 0%, #0d9488 52%, #0a5f5a 100%);
    color: #eaf7f3; font-family: "Segoe UI", Poppins, "Anek Malayalam", sans-serif;
    overflow: hidden; user-select: none; cursor: default;
  }
  /* Soft brand glows + the same star lattice the renderer splash uses.
   * v2.6.5: these are pure radial-gradients — the old 90px gaussian-blur
   * glow layers were among the most expensive paint ops available and had
   * to run on the software rasterizer on the very first frames of app life
   * (hardware acceleration is disabled app-wide). A radial gradient with a
   * long falloff renders the same soft look in a single cheap pass, so the
   * splash composites in 1-2 frames even on old office CPUs. */
  .glow-a, .glow-b { position: fixed; border-radius: 50%; pointer-events: none; }
  .glow-a { width: 760px; height: 760px; top: -400px; left: 50%; transform: translateX(-58%); background: radial-gradient(circle, rgba(13,148,136,.42) 0%, rgba(13,148,136,.16) 36%, transparent 68%); }
  .glow-b { width: 660px; height: 660px; bottom: -320px; right: -240px; background: radial-gradient(circle, rgba(45,212,191,.26) 0%, rgba(45,212,191,.11) 40%, transparent 70%); }
  .pattern { position: fixed; inset: -40px; pointer-events: none; opacity: .05;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='1'%3E%3Cpath d='M36 6 L42 30 L66 36 L42 42 L36 66 L30 42 L6 36 L30 30 Z'/%3E%3Ccircle cx='36' cy='36' r='6'/%3E%3C/g%3E%3C/svg%3E");
    background-size: 72px 72px; }
  .vignette { position: fixed; inset: 0; pointer-events: none; background: radial-gradient(ellipse at center, transparent 0%, rgba(4,30,27,.5) 100%); }
  .col { position: relative; display: flex; flex-direction: column; align-items: center; padding: 0 40px; text-align: center; }
  .logo { width: 108px; height: 108px; object-fit: contain; filter: drop-shadow(0 10px 26px rgba(4,30,27,.45)); }
  .logo-fallback {
    display: flex; align-items: center; justify-content: center;
    width: 108px; height: 108px; border-radius: 50%;
    background: rgba(255,255,255,.12); border: 1px solid rgba(45,212,191,.35);
    font-size: 52px; font-weight: 700; color: #ffffff;
  }
  h1 { margin-top: 22px; font-size: 34px; line-height: 1.15; font-weight: 700; letter-spacing: .045em; text-transform: uppercase; color: #ffffff; }
  .sub { margin-top: 8px; font-size: 13px; font-weight: 500; letter-spacing: .14em; text-transform: uppercase; color: rgba(220,243,234,.82); }
  .divider { display: flex; align-items: center; gap: 10px; margin: 26px 0 22px; }
  .divider span { width: 64px; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,.28)); }
  .divider span:last-child { background: linear-gradient(90deg, rgba(255,255,255,.28), transparent); }
  .divider i { width: 5px; height: 5px; border-radius: 50%; background: rgba(255,255,255,.55); }
  .spin { width: 30px; height: 30px; border-radius: 50%; border: 3px solid rgba(255,255,255,.18); border-top-color: #5eead4; animation: turn 0.9s linear infinite; }
  @keyframes turn { to { transform: rotate(360deg); } }
  .cap { margin-top: 14px; max-width: 340px; font-size: 13px; line-height: 1.45; color: rgba(220,243,234,.75); }
  .foot { position: fixed; left: 0; right: 0; bottom: 18px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; color: rgba(220,243,234,.6); }
  .foot i { width: 3px; height: 3px; border-radius: 50%; background: rgba(255,255,255,.4); }
</style>
</head>
<body>
  <div class="glow-a"></div>
  <div class="glow-b"></div>
  <div class="pattern"></div>
  <div class="vignette"></div>
  <div class="col">
    ${logo}
    <h1>Minz Mahallu</h1>
    <div class="sub">മിൻസ് മഹല്ല് മാനേജ്മെന്റ്</div>
    <div class="divider"><span></span><i></i><span></span></div>
    <div class="spin"></div>
    <div class="cap" id="splash-cap">മൊഡ്യൂളുകൾ തയ്യാറാക്കുന്നു</div>
  </div>
  <div class="foot"><span>Version ${version}</span><i></i><span>MinZ</span></div>
</body>
</html>`;
}

let splashWin: import("electron").BrowserWindow | null = null;
/** Alt+F4 on the splash must not dismiss it while boot is still running —
 *  that used to look like the app had closed while the process kept going.
 *  closeSplash() (and only closeSplash) lifts this. */
let splashCloseAllowed = false;
let splashShownResolve: (() => void) | null = null;
let splashShown: Promise<void> = new Promise((resolve) => { splashShownResolve = resolve; });
let pendingStatus: string | null = null;

function markSplashShown(): void {
  const resolve = splashShownResolve;
  splashShownResolve = null;
  resolve?.();
  applySplashStatus();
}

/** Resolves when the splash is on screen (or immediately if it could not be
 *  created). Boot uses this so synchronous database work never runs in the
 *  dead gap before the first pixel. */
export function whenSplashShown(): Promise<void> {
  return splashShown;
}

function applySplashStatus(): void {
  const w = splashWin;
  const text = pendingStatus;
  if (!w || w.isDestroyed() || !text) return;
  try {
    if (w.webContents.isLoading()) return;
    void w.webContents.executeJavaScript(
      `(() => { const n = document.getElementById("splash-cap"); if (n) n.textContent = ${JSON.stringify(text)}; })()`
    );
  } catch { /* splash already closing */ }
}

/** Updates the splash caption (bilingual status while boot work runs). No-op
 *  when the splash is gone. Never throws. */
export function setSplashStatus(message: string): void {
  const text = String(message ?? "").slice(0, 180);
  if (!text) return;
  pendingStatus = text;
  applySplashStatus();
}

/** Creates the always-on-top splash if it does not exist yet. Never throws —
 *  a failed splash must not stop the app from booting. */
export function createSplashWindow(): void {
  if (splashWin && !splashWin.isDestroyed()) return;
  splashCloseAllowed = false;
  try {
    const { BrowserWindow } = electron();
    const html = buildSplashHtml({ version: electron().app.getVersion(), logoDataUrl: findSplashLogoDataUrl() });
    splashWin = new BrowserWindow({
      width: 440, height: 480, show: false, frame: false, resizable: false,
      minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, autoHideMenuBar: true, hasShadow: false,
      backgroundColor: "#0a5f5a", title: "MMS",
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    // Above everything while starting (the real window takes over when ready).
    splashWin.setAlwaysOnTop(true, "screen-saver");
    // FIRST-PIXEL GUARANTEE (v2.6.5 — office report: a WHITE BOX of the
    // splash's size appeared right before the splash on mid-range machines,
    // and the splash itself could take seconds to show). The window is now
    // shown the moment it EXISTS, before its HTML even loads: with hardware
    // acceleration disabled (main.ts) the solid backgroundColor below is
    // painted by the software compositor / DWM natively — no renderer, no
    // GPU, no white default-brush frame — so the user sees a full brand-teal
    // panel essentially instantly, and the splash HTML (logo, spinner,
    // caption) paints over it a few frames later. The old path waited for
    // ready-to-show — a renderer-compositing milestone that is exactly what
    // stalls on flaky drivers — and fell back to a 1.5 s force-show, which
    // on a wedged GPU is where the white box came from. ready-to-show still
    // marks the content-visible milestone for the boot gate, and the force
    // fallback stays as belt-and-braces.
    try { splashWin.show(); } catch { /* closing */ }
    splashWin.on("close", (e) => {
      if (!splashCloseAllowed) e.preventDefault();
    });
    splashWin.once("ready-to-show", () => {
      try { splashWin?.show(); } catch { /* closing */ }
      markSplashShown();
    });
    splashWin.webContents.once("did-finish-load", () => applySplashStatus());
    // Paint fallback: "ready-to-show" depends on the splash's own renderer
    // compositing. If it never fires on some GPU/driver, the user gets the
    // exact reported "splash not coming at all" — force-show after 1.5 s so
    // the splash is at least visible even if its content paints late.
    setTimeout(() => {
      try { if (splashWin && !splashWin.isDestroyed() && !splashWin.isVisible()) splashWin.show(); } catch { /* closing */ }
      markSplashShown();
    }, 1500);
    splashWin.on("closed", () => { splashWin = null; });
    void splashWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  } catch (e) {
    console.warn("[splash] could not show the startup splash:", (e as Error)?.message || e);
    splashWin = null;
    markSplashShown();
  }
}

/** Destroys the splash (no-op when it never opened or already closed). */
export function closeSplash(): void {
  splashCloseAllowed = true;
  const w = splashWin;
  splashWin = null;
  if (w && !w.isDestroyed()) {
    try { w.close(); } catch { /* already gone */ }
  }
}

/** Surfaces the splash for the "second-instance" path: while the boot is
 *  still running (heavy modules loading), a second click on the desktop icon
 *  must never look dead — raise the existing splash, or create one if it
 *  failed to open/paint. Pairs with the windowless-revival branch in
 *  main.ts' second-instance handler (which recreates the REAL window once
 *  the boot is complete). */
export function showSplash(): void {
  if (splashWin && !splashWin.isDestroyed()) {
    try { splashWin.show(); splashWin.focus(); } catch { /* already closing */ }
  } else {
    createSplashWindow();
  }
}

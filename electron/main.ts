/*
 * Electron main process — window creation, boot orchestration, lifecycle.
 *
 * LAYOUT (v2.6.3 housekeeping — this file used to be ~1,400 lines):
 *   session.ts          login-session singleton (read by every secured handler)
 *   data-dir.ts         short "mms" userData folder + legacy consolidation
 *   uninstall-verify.ts NSIS --verify-uninstall password gate (own window)
 *   auto-backup.ts      the idle-gated 10-minute auto-backup runner
 *   crud-ipc.ts         auth + every plain data pass-through IPC handler
 *   export-ipc.ts       PDF / Excel / register / token export IPC handlers
 *   backup-ipc.ts       manual verified-backup IPC handlers
 *   security-ipc.ts     the secured channel layer (auth + audit + guards)
 *   receipt-ipc.ts      donation/subscription receipt printing
 * What lives HERE is only what must: window/boot/reveal orchestration,
 * single-instance, quit paths, and the whenReady wiring of the modules
 * above. EVERYTHING heavy — the data-service graph (better-sqlite3 native
 * binding), the IPC modules, the PDF renderer, update-check, the baileys
 * chain and electron-updater — loads dynamically UNDER the splash (the
 * coreReady gate + the whatsappReady/updaterReady promises), so the splash
 * is the first visible pixel after the double-click and the main window is
 * revealed only after all preliminary work has settled (no freeze after).
 */
import { app, BrowserWindow, ipcMain, dialog, powerMonitor } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createSplashWindow, closeSplash, showSplash, setSplashStatus, whenSplashShown } from "./splash-window.js";
import { bootLog, bootLogError } from "./boot-log.js";
import { getActor } from "./session.js";
import { ensureShortDataDir } from "./data-dir.js";
import { isUninstallVerify, runUninstallVerifyMode } from "./uninstall-verify.js";
import { runAutoBackup } from "./auto-backup.js";

// INSTANT-SPLASH PASS (v2.7.0): ONLY genuinely light modules stay in the
// static import chain above — this file, splash-window, boot-log, session,
// data-dir, uninstall-verify (itself lazified) and auto-backup (itself
// lazified). Everything else — the data-service graph with better-sqlite3's
// native binding, every IPC layer module, the PDF renderer, update-check,
// the baileys-bearing whatsapp-ipc chain and electron-updater — loads
// UNDER the splash via dynamic import, so the first visible pixel lands as
// close to the double-click as Electron itself allows, and ALL preliminary
// work (DB open, monthly subscriptions, print prewarm, handler
// registration) settles behind the splash before the main window is
// revealed — no freeze after it. v2.6.11: the WhatsApp engine HANDSHAKE
// (network) left the gate — it starts after the reveal, idle-gated. The
// handles below reach those lazily loaded modules from the quit paths and
// the boot gates.
type DataModule = typeof import("./services/data.service.js");
type DbModule = typeof import("./db/connection.js");
type PdfModule = typeof import("./print/pdf-renderer.js");
type UpdateModule = typeof import("./update-check.js");
type CrudModule = typeof import("./crud-ipc.js");
type WhatsAppModule = typeof import("./whatsapp-ipc.js");
let dataMod: DataModule | null = null;
let dbMod: DbModule | null = null;
let pdfMod: PdfModule | null = null;
let updateMod: UpdateModule | null = null;
let crudMod: CrudModule | null = null;
let whatsappMod: WhatsAppModule | null = null;

/** Thin local alias so the quit paths keep their guarded
 *  `try { closeDB(); } catch` shape while the real connection module is
 *  loaded lazily under the splash. Before that load finishes there is no
 *  open database to close — a no-op is then exactly right. */
function closeDB(): void { dbMod?.closeDB(); }
// STARTUP ORDER: the splash must be the first thing the user sees, and it
// must STAY up until boot work has finished. Heavy modules (exceljs, the
// baileys-bearing whatsapp-ipc / whatsapp.service chain, electron-updater)
// are deliberately NOT imported at top level — a top-level import runs
// before any window exists and brings back the dead-desktop gap. They load
// under the splash via dynamic import, and the main window is revealed only
// once that work (plus the database open, this month's subscriptions and
// the print-window prewarm) has settled. electron-updater keeps the same
// interop note as before: it ships CommonJS only, so under the packaged ESM
// main process it must be default-imported and destructured inside
// auto-update.js when that module is first imported.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// NATIVE RENDERING PATH RESTORED (v2.6.7 — field verdict on the v2.6.5 and
// v2.6.6 builds: the mid-range machines STILL opened badly, and the office
// confirmed the decisive fact — the EARLIER builds, which rendered on each
// machine's real GPU path, had none of these problems on the same
// hardware). That falsifies the v2.6.5 software-everywhere hypothesis:
// the v2.6.5 blanket hardware-acceleration disable traded a fast, working
// hardware pipeline for a slower software one on exactly the machines that
// complained, while low-end machines never needed the switch — Chromium's
// own GPU blocklist already pins old/basic iGPUs to the software path with
// or without it. Every symptom-specific guard stays in place: the opaque
// win32 main window (v2.4.15), the occlusion switch below, the GPU-crash
// invalidate handler, the show-before-load splash with its solid
// backgroundColor, disable-renderer-backgrounding and spellcheck:false.
// MMS keeps the machine's native path — fast on mid and high end,
// deterministic software rendering on blocklisted low end.

// Windows-only Chromium switch (occasional-freeze fix, user report: freezes on
// mid-range machines, smooth on low-end). Chromium's native window-occlusion
// calculation has a long history of false-positives with frameless windows —
// the renderer gets told "you are not visible", stops painting, and the app
// sits frozen until a refocus repaints it. Machine-dependent by nature (it
// depends on DWM/GPU/driver timing), which is exactly the reported pattern.
// Disabling the feature is the standard mitigation shipped by many Electron
// apps. On Chromium builds where the feature flag no longer exists the switch
// is simply ignored — zero risk either way. Must run BEFORE app is ready.
if (process.platform === "win32") {
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
}

// RENDERER PRIORITY (v2.6.6): during the whole splash-time boot the main
// window exists but is HIDDEN (show:false) — and Chromium puts hidden
// renderers into a low-priority "backgrounded" state (lower raster
// priority, slower timers). On office CPUs that stretches the renderer's
// mount + chunk warm-up and the first post-reveal frames — the exact
// window where the office felt the machine lag. This switch keeps every
// renderer at full priority; the hidden main window and the warm print
// window are all doing boot work for us, not idle background tabs.
app.commandLine.appendSwitch("disable-renderer-backgrounding");

let mainWindow: BrowserWindow | null = null;
// True once the first main window has been created (all IPC handlers are
// registered by then). The "second-instance" handler uses it to tell a boot
// still in progress (surface the splash) from a running-but-windowless
// instance (revive the window) — see the zombie-guard comment there.
let bootComplete = false;
// Rolling crash-reload guard for the main window's renderer (see createWindow).
let rendererReloadTimestamps: number[] = [];
// The login session singleton lives in ./session.js (shared with the IPC
// modules); main only hands the getActor accessor around.

// ---------------------------------------------------------------------------
// Close confirmation: the window's close event is intercepted until the user
// answers an in-app "Close MMS?" dialog. Only a renderer "confirm" (or a
// programmatic before-quit) sets closeConfirmed, so Alt+F4, the custom ✕
// button and the taskbar "Close window" all show the same styled dialog.
// ---------------------------------------------------------------------------
let closeConfirmed = false;

// ---------------------------------------------------------------------------
// Startup gate. The splash stays on screen until this is set. The hidden
// main window may load in parallel (so reveal is instant once the work is
// done) but it is not shown — and the splash is not closed — before then.
// That is what stops the "window appears, then hitches while background
// boot catches up" glitch, and what keeps the splash up for the whole delay
// so the user can see the app is opening.
// ---------------------------------------------------------------------------
let startupSettled = false;
let revealRequested = false;
let mainRevealed = false;
// v2.6.3 — set by the renderer's very first IPC ping (App.tsx mount, BEFORE
// its behind-the-splash chunk warm-up). The ready signal now legitimately
// arrives seconds later than page load (the warm-up is the whole point), so
// the post-startup fallback uses this to tell "alive renderer, still
// warming — keep waiting" from "page loaded but renderer silent = broken".
let rendererAnnouncedAlive = false;
let quitRequested = false;
let quitStarted = false;
let autoBackupTimer: ReturnType<typeof setInterval> | null = null;
let autoBackupKick: ReturnType<typeof setTimeout> | null = null;

function clearAutoBackupTimers(): void {
  if (autoBackupTimer) { clearInterval(autoBackupTimer); autoBackupTimer = null; }
  if (autoBackupKick) { clearTimeout(autoBackupKick); autoBackupKick = null; }
  if (engineStartTimer) { clearTimeout(engineStartTimer); engineStartTimer = null; }
}

/** Hidden windows (warm PDF renderer, splash) must not outlive a Close.
 *  They count toward window-all-closed, so leaving them up is how the
 *  process used to keep running in the background with no UI — and hold the
 *  single-instance lock so the next launch died silently. */
function releaseHiddenWindows(): void {
  try { pdfMod?.disposePdfRenderer(); } catch { /* best effort */ }
  try { closeSplash(); } catch { /* best effort */ }
}

function quitApp(): void {
  if (quitStarted) return;
  quitStarted = true;
  quitRequested = true;
  closeConfirmed = true;
  bootLog("quit:requested");
  clearAutoBackupTimers();
  releaseHiddenWindows();
  // WhatsApp's graceful quit preventDefault()s before-quit and calls
  // app.exit itself, bounded at 9s. If that handler never runs (module
  // failed to load) or a leftover handle keeps the loop alive, this net
  // still ends the process. Intentionally NOT unref'd: a timer, socket or
  // hidden window must not be able to outlive the user's Close.
  setTimeout(() => { try { app.exit(0); } catch { /* already gone */ } }, 12_000);
  try { app.quit(); } catch { try { app.exit(0); } catch { /* already gone */ } }
}

function revealMainWindow(force = false): void {
  if (mainRevealed) return;
  // Both halves: boot work finished, AND the renderer has painted (or a
  // fallback decided not to wait any longer).
  if (!startupSettled || !revealRequested) return;
  const w = mainWindow;
  if (!w || w.isDestroyed()) return;
  // FULL-PAINT GUARD (v2.6.1 — office report: the login page appeared half-
  // painted and typing echoed late). Never show the window while its page is
  // still loading. In the normal path the renderer sends "win:renderer-
  // ready" only AFTER React has mounted, the fonts settled and two frames
  // composited, so isLoading is already false here. The guard holds the
  // splash for the forced fallback paths too — a page that is still loading
  // is shown only when `force` decides a wedged renderer must not hold the
  // splash forever.
  if (!force) {
    try {
      if (w.webContents.isLoading()) { bootLog("window:reveal-held", "page still loading"); return; }
    } catch { /* destroyed mid-flight */ }
  }
  mainRevealed = true;
  bootLog("window:revealed");
  try { w.show(); } catch { /* destroyed mid-flight */ }
  try { w.focus(); } catch { /* destroyed mid-flight */ }
  // One settle beat between the main window's show() and the splash's exit
  // (v2.6.7): the splash keeps covering the screen until the login window
  // has composited underneath, so the handover can never flash a
  // half-painted or unpainted frame. closeSplash is idempotent.
  setTimeout(() => { try { closeSplash(); } catch { /* gone */ } }, 80);
}

function armReveal(reason: string): void {
  revealRequested = true;
  bootLog("window:reveal-armed", reason);
  revealMainWindow();
}

function markStartupSettled(reason: string): void {
  if (startupSettled) return;
  startupSettled = true;
  bootLog("startup:settled", reason);
  revealMainWindow();
  // Work is done but the renderer may still be mounting + warming (v2.6.3:
  // it pre-parses every lazy page chunk behind the splash before sending
  // win:renderer-ready — that warm-up is what makes the login page and the
  // post-login dashboard freeze-free, and it can legitimately take several
  // seconds on a low-end machine). Don't hold the splash forever waiting
  // for a signal a wedged renderer never sends — but ALSO don't flash a
  // half-loaded page (v2.6.1) or cut a healthy warm-up short. Poll instead:
  //   - page loaded but renderer NEVER announced itself (JS error, missing
  //     bridge → no warm-up is running) → reveal at 6 s — waiting longer
  //     cannot improve a dead UI;
  //   - renderer announced alive → keep waiting for its full ready signal
  //     (its own 9 s warm budget + 15 s fire cap beat the cap below) and
  //     only force past at the absolute 30 s cap (the splash can never
  //     strand). v2.6.7: the force used to fire at 20 s — INSIDE the
  //     window where a slow-fonts + full-warm-up renderer was still parsing
  //     chunks (budget starts only after fonts.ready). Revealing mid-warm-up
  //     put the chunk parses exactly under the user's first keystrokes —
  //     the reported "one time freeze when inputing login details".
  let fallbackTicks = 0;
  const fallbackTimer = setInterval(() => {
    if (mainRevealed) { clearInterval(fallbackTimer); return; }
    fallbackTicks += 2;
    let loaded = false;
    try {
      const w = mainWindow;
      loaded = !!w && !w.isDestroyed() && !w.webContents.isLoading();
    } catch { loaded = false; }
    if (fallbackTicks >= 30 || (fallbackTicks >= 6 && loaded && !rendererAnnouncedAlive)) {
      clearInterval(fallbackTimer);
      bootLog("window:fallback-reveal", `${fallbackTicks}s loaded=${loaded} alive=${rendererAnnouncedAlive}`);
      armReveal("post-startup-fallback");
      if (!mainRevealed) revealMainWindow(true);
    }
  }, 2_000);
  fallbackTimer.unref?.();
}

/** A wedged import must not strand the splash forever, but a normal boot
 *  waits for the real work instead of opening early and glitching. */
function capStartupWork(work: Promise<unknown>, label: string, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      bootLog("startup:cap", `${label} ${ms}ms`);
      console.warn(`[boot] ${label} still running after ${ms}ms — opening the window anyway`);
      resolve();
    }, ms);
    work.then(
      () => { clearTimeout(timer); resolve(); },
      (err) => {
        clearTimeout(timer);
        bootLog("startup:work-failed", `${label}: ${String((err as Error)?.message || err)}`);
        resolve();
      },
    );
  });
}

// ---------------------------------------------------------------------------
// IDLE-GATED ENGINE START (v2.6.11 — the decisive splash fix).
// v2.6.3 moved the WhatsApp engine HANDSHAKE under the splash and awaited it
// in the reveal gate, because the v2.6.1 "+8 s after the reveal" timer fired
// exactly while the office typed their password. But the handshake is
// NETWORK work: startEngine() awaits fetchWaWebVersion() (an 8 s-bounded
// live fetch) plus the full baileys socket connect + noise handshake — so
// on a slow, capped or absent internet line the splash sat dead for 8–20 s+
// on EVERY boot ("this much lite app why taking freeze"). Only the module
// IMPORT belongs in the gate; the handshake itself now starts after the
// window is revealed AND the machine has gone idle (≥ 4 s system idle —
// typing/clicking keeps resetting it, so it can never land under the
// user's keystrokes), or on demand when the WhatsApp page is opened (the
// existing IPC paths). maybeStartEngine() is idempotent and never rejects.
// ---------------------------------------------------------------------------
let engineStartTimer: ReturnType<typeof setTimeout> | null = null;

function armIdleEngineStart(): void {
  // First attempt 20 s after the reveal — comfortably past the first login
  // interaction window — then re-check every 5 s until the machine is idle.
  // Bounded at 36 tries (~3 min): after that the on-demand paths (opening
  // the WhatsApp page, sending a receipt) still start the engine.
  if (engineStartTimer) return;
  let tries = 0;
  const tick = (): void => {
    engineStartTimer = null;
    if (tries++ >= 36) { bootLog("whatsapp:idle-autostart-gave-up"); return; }
    let idle = 99;
    try { idle = powerMonitor.getSystemIdleTime(); } catch { /* unavailable — treat as idle */ }
    if (idle < 4) {
      engineStartTimer = setTimeout(tick, 5_000);
      engineStartTimer.unref?.();
      return;
    }
    bootLog("whatsapp:idle-autostart", `idle=${idle}s`);
    try { void whatsappMod?.autoStartEngine().catch(() => {}); }
    catch { /* engine unavailable this session — on-demand paths still try */ }
  };
  engineStartTimer = setTimeout(tick, 20_000);
  engineStartTimer.unref?.();
}

// ---------------------------------------------------------------------------
// Uninstall verification mode — see uninstall-verify.ts (the flag is
// imported from there so the lock below, the whenReady branch and the
// window-all-closed exit code all share one definition).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Single-instance lock (user report: "2 or 3 instance are seeing in task
// manager if i clicked one time only"). Two separate things are true here:
//   1. Several exe rows in Task Manager for ONE app launch are NORMAL for
//      every Electron app — the main process, the GPU process and the
//      renderer process each show as their own row of the same exe name.
//   2. BUT a real second instance could spawn when the desktop icon is
//      clicked again while the first launch is still on its splash screen
//      (the main window stays hidden until "win:renderer-ready", which
//      invites a second click). requestSingleInstanceLock() makes every
//      later launch hand over to the running app: it quits itself and the
//      running window is restored + focused instead.
// Skipped in uninstall-verify mode: the NSIS uninstaller may legitimately run
// the gate WHILE the main app is open, and the fail-open exit path (any code
// other than 1) must stay intact. Must run BEFORE app.whenReady().
// ---------------------------------------------------------------------------
const gotSingleInstanceLock = isUninstallVerify || app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // Close already started. Reviving a window here would make it look like
    // the app "kept running in the background" — and the hard-exit timer
    // would then kill that revived window. A new click after the process
    // has actually exited starts a fresh instance (with the splash).
    if (quitRequested) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainRevealed) {
        // Window exists but is still hidden behind the splash (boot work
        // running, or the renderer has not painted yet). Showing it now is
        // the glitch this gate exists to prevent — keep the splash up.
        showSplash();
        if (startupSettled) armReveal("second-instance");
      } else {
        try {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        } catch { /* window destroyed mid-flight */ }
      }
    } else if (bootComplete) {
      // WINDOWLESS REVIVAL (zombie guard): this instance still holds the
      // single-instance lock but has no window — a wedged teardown, an
      // aborted quit or a destroyed renderer could all leave that state.
      // Without this branch every further click on the icon would die
      // silently here ("splash not coming at all, app not coming, only
      // Task Manager rows") until the user manually killed the process.
      // Recreating the window is safe: every IPC handler is registered
      // already (bootComplete), and createWindow is idempotent w.r.t. them.
      try { createWindow(); } catch { /* next click retries */ }
    } else {
      // Boot still in progress (heavy modules still loading under the
      // splash): a second click must never look dead — bring the splash to
      // the front (or put one up if it failed to paint).
      showSplash();
    }
  });
}

// STARTUP DIAGNOSTICS (v2.5.1): every launch records its boot steps (with
// process.uptime() stamps, so even pre-JS init delays are visible) to
// <userData>/logs/boot.log. Process-level handlers make sure a stray
// rejection can never again kill the boot SILENTLY — the failure lands in
// the log AND the window is still created by the whenReady .catch below.
bootLog("main-module-loaded");
process.on("unhandledRejection", (reason) => {
  bootLogError("unhandledRejection", reason);
  console.warn("[boot] unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  bootLogError("uncaughtException", err);
  console.warn("[boot] uncaught exception:", err);
});

// ---------------------------------------------------------------------------
// Data folder: short "mms" directory inside the OS app-data area. Must run
// BEFORE anything touches app.getPath("userData") — DB, WhatsApp session,
// backups and settings all resolve through it. The consolidation logic
// (legacy folder migration, newest-DB wins) lives in ./data-dir.js.
// ---------------------------------------------------------------------------
ensureShortDataDir();

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  try { dialog.showErrorBox("MMS — Unexpected Error", `The application encountered an error:\n\n${err.message}\n\nStack: ${err.stack || "(no stack)"}`); } catch {}
});
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled rejection:", reason);
  try { dialog.showErrorBox("MMS — Unexpected Error", `An async operation failed:\n\n${String(reason)}`); } catch {}
});

// The verified export writer and every PDF/Excel export handler live in
// ./export-ipc.js (split, v2.6.3).

function createWindow() {
  // OPAQUE ON WINDOWS (occasional-freeze fix, user report: freezes on
  // mid-range machines, smooth on low-end). The main window used to be
  // `transparent: true, backgroundColor: "#00000000"` on every platform.
  // Transparent frameless windows are Electron's best-documented freeze
  // vector on Windows: every frame goes through a per-pixel-alpha DWM blend
  // (no opaque fast path), and the behaviour differs wildly by GPU/driver —
  // hybrid-GPU (Optimus) mid-range laptops and Windows 11 24H2's DWM changes
  // are the classic broken combinations, while basic single-iGPU low-end
  // machines sail through. Transparency bought nothing here: .app-shell is a
  // full-bleed SQUARE surface (no CSS rounded-corner window shape) and the
  // boot phase is invisible anyway — the window stays HIDDEN until
  // win:renderer-ready, with the native splash covering the screen. Windows
  // therefore gets a normal opaque window (bg = the app's --bg #f6f8fa, which
  // body.app-loaded paints anyway); macOS/Linux keep the exact previous look.
  const win32 = process.platform === "win32";
  mainWindow = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 640, show: false,
    paintWhenInitiallyHidden: true,
    autoHideMenuBar: true,
    ...(win32 ? { backgroundColor: "#f6f8fa" } : { backgroundColor: "#00000000", transparent: true }),
    title: "MMS — Minz Mahallu Management System", frame: false, hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"), contextIsolation: true, nodeIntegration: false, sandbox: false, zoomFactor: 1.0,
      // v2.6.6 — the office report "one time freeze when inputing login
      // details" is Chromium's spellchecking service spinning up on the
      // FIRST keystroke of the first focused input (Electron's spellcheck
      // default is true; on Windows it hooks the OS spellcheck provider and
      // loads its dictionary exactly then — a one-time 0.5-2 s stall, never
      // again afterwards). A mahallu admin app's inputs are usernames,
      // passwords, names and amounts — spellcheck is pure cost here.
      // Disabled app-wide; LoginPage additionally pins spellCheck={false}
      // per input as belt-and-braces.
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  // Real window takes over only when BOTH are true: boot work has settled
  // (markStartupSettled) AND the renderer has painted (win:renderer-ready,
  // or the ready-to-show grace). Until then the window stays HIDDEN and the
  // splash stays up, so the user goes splash → complete window with nothing
  // glitching in between. The long cap is a last resort for a wedged
  // renderer/import — longer than the startup-work caps so it never wins
  // the race and reveals a half-booted window.
  const unstrand = setTimeout(() => {
    bootLog("window:unstrand");
    startupSettled = true;
    armReveal("unstrand");
    // Absolute last resort (100 s): force past the paint guard — a wedged
    // renderer must never hold the splash hostage forever.
    if (!mainRevealed) revealMainWindow(true);
  }, 100_000);
  mainWindow.once("show", () => clearTimeout(unstrand));
  mainWindow.once("ready-to-show", () => {
    // v2.6.1: LOG ONLY — do NOT arm the reveal here. ready-to-show fires
    // before React has mounted, and the old 400 ms grace still revealed a
    // half-painted login page on slow first runs (office report: fields
    // popped in late, typing echoed late). The reveal waits for the
    // renderer's own full-paint signal (App.tsx → win:renderer-ready after
    // fonts.ready + two composited frames) or the bounded fallback in
    // markStartupSettled.
    bootLog("window:ready-to-show");
  });
  mainWindow.on("closed", () => {
    clearTimeout(unstrand);
    mainWindow = null;
    // A closed main window must take the process with it. Hidden windows
    // (the warm PDF renderer) do not emit window-all-closed by themselves,
    // which is how Close used to leave MMS running in the background.
    if (!isUninstallVerify && process.platform !== "darwin") quitApp();
  });
  // Occasional-freeze resilience (user report: freezes on mid-range machines,
  // smooth on low-end). A crashed MAIN renderer leaves a blank or frozen-
  // looking window — from the outside it IS a freeze. Revive it with one
  // guarded reload: max 2 per rolling minute, so a genuine crash loop can
  // never spin (the close gate and app state survive a reload; the user just
  // logs back in). renderer gone for "clean-exit" is a normal teardown.
  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    console.warn("[renderer] process gone:", details.reason, "exitCode:", details.exitCode);
    if (details.exitCode === 0 || details.reason === "clean-exit") return;
    const now = Date.now();
    rendererReloadTimestamps = rendererReloadTimestamps.filter((t) => now - t < 60_000);
    if (rendererReloadTimestamps.length >= 2) return;
    rendererReloadTimestamps.push(now);
    setTimeout(() => {
      try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload(); } catch { /* gone */ }
    }, 300);
  });
  // Surface silent download failures (Reports page CSV/Excel/PDF blob downloads
  // go through Chromium's download pipeline). Success needs no extra handling;
  // a failed/interrupted download is reported so the UI can warn the user.
  mainWindow.webContents.session.on("will-download", (_event, item) => {
    item.once("done", (_it, state) => {
      if (state !== "completed") {
        try { mainWindow?.webContents.send("download:failed", item.getFilename()); } catch {}
      }
    });
  });
  // Close gate: ask the renderer to confirm before the window goes away.
  // Once the close is real, drop hidden windows FIRST so they cannot keep
  // the process (and the single-instance lock) alive after the UI is gone.
  mainWindow.on("close", (e) => {
    // Local alias: TS cannot narrow the captured module-level `mainWindow`
    // through the `crashed` predicate below (tsc -p electron: TS18047).
    const w = mainWindow;
    const crashed = !w || w.isDestroyed()
      || w.webContents.isCrashed()
      || !w.webContents
      || w.webContents.isDestroyed();
    if (closeConfirmed || crashed) {
      releaseHiddenWindows();
      return;
    }
    e.preventDefault();
    try { w.webContents.send("win:ask-close-confirm"); }
    catch {
      // Renderer can't show the dialog — don't trap a window the user can
      // never close. Quit.
      closeConfirmed = true;
      releaseHiddenWindows();
      setImmediate(() => { try { w.close(); } catch { /* gone */ } });
    }
  });
  if (process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || "http://localhost:5174");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

// Window-control IPC. Registered ONCE here (not inside createWindow) so a
// second createWindow() call — the macOS "activate" re-open path — cannot
// crash with "Attempted to register a second handler".
ipcMain.handle("win:minimize", () => mainWindow?.minimize());
ipcMain.handle("win:maximize", () => { if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize(); });
ipcMain.handle("win:close", () => mainWindow?.close());
// Called by the close-confirm dialog after the user picks "Close app".
// Closing the window is not enough: a hidden print window used to keep the
// process running in the background. confirm-close always starts a real quit
// on Windows/Linux; the closed handler does the same if close() wins the race.
ipcMain.handle("win:confirm-close", () => {
  closeConfirmed = true;
  // Set before close() so a second click during teardown cannot revive a
  // window inside the process that is about to exit.
  quitRequested = true;
  releaseHiddenWindows();
  try { mainWindow?.close(); } catch { /* already gone */ }
  if (process.platform !== "darwin") {
    // If close() was swallowed, don't leave a "closed" app running.
    setTimeout(() => {
      if (quitStarted) return;
      try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy(); } catch { /* gone */ }
      quitApp();
    }, 400);
  }
});
// Sent by App.tsx once the REAL UI has mounted and painted. Revealing is
// gated: if boot work is still running the splash stays up and this just
// arms the reveal, which markStartupSettled performs the moment work ends.
// Registered ONCE (like the win: handlers above) so the macOS activate
// re-open path cannot register it twice.
ipcMain.on("win:renderer-ready", () => {
  armReveal("renderer-ready");
});
// Sent by App.tsx the moment the renderer mounts (BEFORE its splash-time
// chunk warm-up). Latches a health flag the post-startup fallback consults:
// a live renderer that is legitimately still warming gets the full ready-
// wait; a page that loads yet never pings (broken bridge/JS error) is
// force-revealed at 6 s as before. Registered ONCE at module level for the
// same activate re-open reason as the handlers above.
ipcMain.on("win:renderer-alive", () => {
  if (!rendererAnnouncedAlive) bootLog("renderer:alive");
  rendererAnnouncedAlive = true;
});

// Occasional-freeze resilience (user report: freezes on mid-range machines).
// A GPU process death (driver reset / Timeout Detection & Recovery — the
// classic "froze a few seconds, then fine again" on hybrid-GPU laptops) can
// leave the window wedged on a stale frame until something forces a repaint.
// Chromium restarts the GPU process on its own; invalidate() immediately
// pushes a fresh frame so the user never sees the wedge. Machine-dependent by
// nature — exactly the reported symptom pattern.
app.on("child-process-gone", (_event, details) => {
  if (details.type !== "GPU") return;
  console.warn("[gpu] process gone:", details.reason, "exitCode:", details.exitCode);
  try { mainWindow?.webContents.invalidate(); } catch { /* window gone */ }
});

// The uninstaller's password-gate window lives in ./uninstall-verify.js.
// esc() lives in ./print/utils.js; renderHtmlToPdf() in ./print/pdf-renderer.js
// (the duplicates that used to sit here were removed in the dead-code purge).

app.whenReady().then(async () => {
  // LOCKLESS GUARD (zombie guard): a launch that lost the single-instance
  // race already called app.quit() at module level. If the ready event still
  // fires while that quit is in flight, running the boot here could create a
  // window mid-quit and abort it — leaving a second live instance (splash
  // only, no real window, holding nothing) racing the first one for the DB.
  // Exit hard instead: this process must never build windows or handlers.
  if (!gotSingleInstanceLock) { app.exit(0); return; }
  bootLog("whenReady:enter");

  // ===== Uninstall verification mode (launched by the NSIS uninstaller) =====
  // Only the tiny verify window + its IPC run (see uninstall-verify.ts). No
  // main window, no WhatsApp engine, no auto-backup timer, no DB creation.
  if (isUninstallVerify) {
    // Everything the gate needs (3 IPC handlers + the tiny always-on-top
    // window) lives in uninstall-verify.ts. window-all-closed decides the
    // exit code; nothing else of the normal app boots in this mode.
    runUninstallVerifyMode();
    return;
  }

  // FIRST VISIBLE PIXEL (Task 44): the native splash goes up before ANY
  // other boot work — schema/data-file chores, monthly subscription
  // generation, IPC registration and the dynamic import of the heavy
  // modules (baileys chain, exceljs, electron-updater) all now run while the
  // user is already looking at the branded splash instead of a dead desktop.
  createSplashWindow();
  bootLog("splash:created");
  const bootStartedAt = Date.now();

  // SPLASH-CONTENT FIRST (v2.6.7 — the mid-range field reports were precise:
  // "double click has some seconds time to come splash"). v2.6.6 already
  // made the splash window itself zero-work, but the two heaviest dynamic
  // imports used to START right here, BEFORE the splash content had painted
  // — the baileys chain (hundreds of module files under an antivirus scan,
  // a native binding load, JIT) and electron-updater saturate the CPU and
  // the disk exactly while the splash's own renderer is trying its first
  // paint. The splash frame came up seconds late on mid-range machines.
  // Nothing heavy may start until the splash is actually ON SCREEN.
  await whenSplashShown();

  // Heavy modules load UNDER the splash (not at process start — that was
  // the dead-desktop gap) and the boot WAITS for them before the main
  // window is revealed. v2.5.1 stopped waiting so the window could appear
  // sooner; the office then got a window that hitched and glitched while
  // baileys, the database and the print window caught up, and Close left
  // that hidden print window running in the background. A failed import
  // still degrades (WhatsApp / updates unavailable this session) instead of
  // stranding the splash — capStartupWork below is the backstop if a load
  // wedges on antivirus.
  // The WhatsApp MODULE (baileys — the heaviest import in the app) loads
  // here, under the splash, so every handler exists before the window can
  // call one. v2.6.11: the ENGINE HANDSHAKE is NOT started here anymore.
  // autoStartEngine() is a NETWORK operation (8 s-bounded live version fetch
  // + socket connect + noise handshake) — awaiting it gated the splash on
  // the office's internet line and sat dead for 8–20 s+ whenever the line
  // was slow or absent. The handshake now starts after the reveal, only
  // when the machine is idle (armIdleEngineStart below) or on demand from
  // the WhatsApp page — never under the user's typing, never gating boot.
  const whatsappReady = import("./whatsapp-ipc.js")
    .then((m) => m.registerWhatsAppIpc(getActor, () => mainWindow, { autoStart: false })
      .then(() => { bootLog("whatsapp:registered"); whatsappMod = m; }))
    .catch((err) => { console.warn("[whatsapp] engine unavailable this session:", (err as Error)?.message || err); bootLog("whatsapp:failed", String((err as Error)?.message || err)); });

  // In-app download + install (electron-updater) — engages when the user
  // accepts the banner. Like whatsapp-ipc it loads under the splash (started
  // here, awaited by the reveal gate below via capStartupWork) and a load
  // failure degrades to "no update banner" instead of stranding the boot.
  const updaterReady = import("./auto-update.js")
    .then((m) => { m.registerAutoUpdater(() => mainWindow); bootLog("updater:wired"); })
    .catch((err) => { console.warn("[update] updater unavailable this session:", (err as Error)?.message || err); bootLog("updater:failed", String((err as Error)?.message || err)); });

  // Normal boot: bilingual "do not delete" note inside the data folder, so
  // nobody tidies AppData and wipes the mahallu database + backups.
  try {
    const notePath = path.join(app.getPath("userData"), "KEEP-THIS-FOLDER.txt");
    if (!fs.existsSync(notePath)) {
      fs.writeFileSync(notePath, [
        "MMS — Minz Mahallu Management System",
        "======================================",
        "",
        "This folder holds the mahallu's database (mms.db) and .mmbak backups.",
        "",
        "DO NOT DELETE this folder.",
        "Deleting it erases every family, member, subscription and payment record.",
        "",
        "To keep an extra copy on a USB drive or in the cloud:",
        "Settings -> Backup -> Backup mirror folder.",
        "",
        "— — — മലയാളം — — —",
        "ഈ ഫോൾഡറിൽ മഹല്ലുവിന്റെ ഡാറ്റാബേസും (mms.db) ബാക്കപ്പ് ഫയലുകളും സൂക്ഷിച്ചിട്ടുണ്ട്.",
        "ദയവായി ഈ ഫോൾഡർ ഇല്ലാതാക്കരുത് — ഇത് നഷ്ടപ്പെട്ടാൽ എല്ലാ രേഖകളും നഷ്ടപ്പെടും.",
        "അധിക പകർപ്പിനായി: Settings -> Backup -> Backup mirror folder.",
        "",
      ].join("\n"), "utf8");
    }
  } catch {}

  // CORE MODULES + IPC REGISTRATION (v2.7.0 — all under the splash). The
  // data-service graph (better-sqlite3 native binding included), every IPC
  // layer module, the PDF renderer and update-check load HERE, after the
  // splash is already on screen — the same handlers register in the same
  // order as before: crud → export → backup → security → auth-retake →
  // receipt LAST (a window can never call a missing handler — pinned in
  // startup-resilience.test.ts). The hidden window's renderer then loads in
  // parallel while whatsappReady / updaterReady / dataReady settle.
  const coreReady = (async () => {
    setSplashStatus("സർവീസുകൾ ലോഡ് ചെയ്യുന്നു · Loading services");
    const [upd, crud, exp, bk, sec, rec, ds, dbc, pdf] = await Promise.all([
      import("./update-check.js"),
      import("./crud-ipc.js"),
      import("./export-ipc.js"),
      import("./backup-ipc.js"),
      import("./security-ipc.js"),
      import("./receipt-ipc.js"),
      import("./services/data.service.js"),
      import("./db/connection.js"),
      import("./print/pdf-renderer.js"),
    ]);
    updateMod = upd; dataMod = ds; dbMod = dbc; pdfMod = pdf; crudMod = crud;
    // Monthly GitHub release check (Settings → About can also check on demand).
    // The delayed network tick itself is started only after the window is
    // revealed (below) so it cannot hitch the first paint.
    upd.registerUpdateIpc(() => mainWindow);
    crud.registerCrudIpc(() => mainWindow);
    exp.registerExportIpc(() => mainWindow);
    bk.registerBackupIpc(() => mainWindow);
    sec.registerSecurityIpc(getActor);
    crud.registerAuthRetakeIpc(); // re-takes auth:createInitialAdministrator (see crud-ipc.ts)
    // Receipt IPC is the LAST registration before the window is created (a
    // window can never call a missing handler — pinned in
    // startup-resilience.test.ts).
    rec.registerReceiptIpc(getActor, () => mainWindow);
    bootLog("ipc:registered");
  })();
  await coreReady;
  createWindow();
  // From this tick on, a second-instance event can safely (re)create the
  // window — every handler it may call is registered. Reveal stays gated
  // on startupSettled, so a second click during boot raises the splash
  // instead of flashing the hidden window.
  bootComplete = true;
  bootLog("boot:handlers-ready");
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

  // Database open + this month's subscriptions + print-window prewarm.
  // All of these used to run AFTER the window was on screen (1.5s / 2.5s
  // timers) and were the hitch the office saw as a glitch while using the
  // app. They now run while the splash is already up. The hidden main
  // window is loading its renderer at the same time.
  const dataReady = (async () => {
    if (!dbMod || !dataMod || !pdfMod) throw new Error("core modules failed to load");
    const { prewarmPdfRenderer } = pdfMod;
    const yieldMain = () => new Promise<void>((r) => setTimeout(r, 0));
    setSplashStatus("ഡാറ്റാബേസ് തുറക്കുന്നു · Opening database");
    try { dbMod.getDB(); bootLog("db:opened"); }
    catch (err) { bootLogError("db:open", err); console.warn("[boot] database open failed:", err); }
    await yieldMain();
    setSplashStatus("ഈ മാസം തയ്യാറാക്കുന്നു · Preparing this month");
    try { dataMod.subscriptions.ensureCurrentMonth(); bootLog("subscriptions:month-ensured"); }
    catch (err) { console.warn("[subscriptions] monthly generation failed:", err); bootLog("subscriptions:month-failed", String((err as Error)?.message || err)); }
    await yieldMain();
    try { crudMod?.warmStartupData(); bootLog("data:prewarmed"); }
    catch (err) { bootLog("data:prewarm-failed", String((err as Error)?.message || err)); }
    await yieldMain();
    setSplashStatus("പ്രിന്റ് തയ്യാറാക്കുന്നു · Preparing print");
    try { prewarmPdfRenderer(); bootLog("pdf:prewarmed"); }
    catch (err) { bootLog("pdf:prewarm-failed", String((err as Error)?.message || err)); }
    setSplashStatus("സേവനങ്ങൾ തുടങ്ങുന്നു · Starting services");
  })();

  await Promise.all([
    capStartupWork(whatsappReady, "whatsapp", 90_000),
    capStartupWork(updaterReady, "updater", 30_000),
    capStartupWork(dataReady, "data", 60_000),
  ]);
  // Floor so a warm, cached launch still shows the splash long enough for
  // the user to see that the app is opening — not a flash and a glitch.
  // Slow launches are not padded: the splash already covered the real work.
  const splashHoldMs = 800 - (Date.now() - bootStartedAt);
  if (splashHoldMs > 0) await new Promise((r) => setTimeout(r, splashHoldMs));
  // The main-process work is done; the splash now stays up only while the
  // hidden renderer mounts the login page, decodes its fonts and composites
  // two frames (v2.6.11 — page-chunk warming moved AFTER the reveal, paused
  // while the user types, so the splash no longer waits for 23 parses).
  // Say so instead of looking hung on the last data status.
  setSplashStatus("അവസാന സ്പർശം · Final touches");
  markStartupSettled("work-done");
  bootLog("boot:complete");
  updateMod?.scheduleMonthlyUpdateCheck(() => mainWindow);
  // v2.6.11: the WhatsApp engine handshake is started HERE — after the
  // reveal, and only when the machine goes idle (≥ 4 s system idle, polled
  // every 5 s from +20 s). It can no longer delay the splash (network), and
  // it can no longer land under the user's keystrokes (idle gate). The
  // WhatsApp page's own on-demand start paths are unchanged.
  armIdleEngineStart();
  // NOTE: nothing CPU-heavy or network-bound may be scheduled into the
  // post-reveal window without an idle gate — the v2.6.1 "+8 s timer" and
  // the v2.6.3 under-the-splash handshake were both the login-page freeze
  // in their day.

  // ===== Auto-backup timer =====
  // The runner lives in ./auto-backup.js (settings check, idle gate,
  // retention, mirror). These timers only SCHEDULE it: every 10 minutes,
  // plus one 90 s first kick after the work settles.
  autoBackupTimer = setInterval(runAutoBackup, 10 * 60 * 1000); // every 10 min
  // First check 90 seconds after the work settles. DB init already finished
  // under the splash, and runAutoBackup itself is IDLE-GATED (v2.6.3): even
  // when a backup is due it cannot start while the user has touched the
  // machine in the last 30 s, so neither this kick nor any 10-min tick can
  // freeze typing/scrolling again (v2.6.1: 30 s janked the first minute of
  // use on mid-range machines). Cleared on quit so a pending kick cannot
  // reopen the database during teardown and keep the process alive.
  autoBackupKick = setTimeout(() => { autoBackupKick = null; void runAutoBackup(); }, 90_000);
  autoBackupKick.unref?.();
}).catch((err) => {
  // BOOT FAIL-SAFE: ANY throw inside the boot body — a duplicate handler
  // registration, an unexpected data error — must not strand the splash.
  // Record it, release the reveal gate, and still try to put the window up.
  bootLogError("whenReady", err);
  console.error("[boot] whenReady failed:", err);
  markStartupSettled("whenReady-failed");
  try { if (!mainWindow || mainWindow.isDestroyed()) createWindow(); } catch { /* nothing further we can do */ }
});
app.on("window-all-closed", () => {
  // Uninstall gate: window closed without a decision means "declined".
  if (isUninstallVerify) { try { closeDB(); } catch {} app.exit(1); return; }
  // closeDB is guarded: better-sqlite3's close() throws when a statement or
  // transaction is still in flight, and an unguarded throw here would skip
  // the app.quit() below — leaving a WINDOWLESS PROCESS that still holds the
  // single-instance lock. That is precisely the reported "splash not coming
  // at all, app not coming, only Task Manager rows" zombie: every later
  // launch loses the lock and quits silently. The database also closes in
  // before-quit (and better-sqlite3 flushes on process exit), so a failed
  // close here must never be allowed to keep the process alive.
  try { closeDB(); } catch (err) { console.warn("[quit] closeDB failed during exit:", err); }
  bootLog("quit:window-all-closed");
  if (process.platform !== "darwin") quitApp();
});
app.on("before-quit", () => {
  closeConfirmed = true;
  bootLog("quit:before-quit");
  clearAutoBackupTimers();
  // Release the warm offscreen PDF window and the splash: the app is going
  // down, and the WhatsApp quit handler that runs next must not race a
  // hidden renderer. A leftover hidden window is also what used to keep
  // this process running in the background after Close.
  releaseHiddenWindows();
  // Guarded (see window-all-closed): a throwing closeDB here would abort the
  // listener chain before the WhatsApp graceful-quit handler runs.
  try { closeDB(); } catch (err) { console.warn("[quit] closeDB failed:", err); }
});

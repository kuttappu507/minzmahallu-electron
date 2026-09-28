import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Zombie-startup guards (user report on v2.4.15: after the first install the
// app opened once — slowly — and after that "splash screen is not coming at
// all and application also not coming at all, but seeing in task manager").
//
// That symptom is a WINDOWLESS PROCESS still holding the single-instance
// lock: every later launch loses the lock and quits silently, so nothing
// ever appears again until the user manually kills the process. The same
// shape showed up as "Close doesn't really close — it keeps running in the
// background": the warm PDF BrowserWindow (show:false) counted toward
// window-all-closed, so closing the main window never quit the process.
//
// Defenses pinned here, all in electron/main.ts:
//   1. A throwing closeDB() can no longer skip the quit, and quitApp()
//      disposes hidden windows then force-exits if the graceful quit
//      (WhatsApp flush, bounded at 9s) never finishes.
//   2. A launch that loses the lock can never build windows/handlers mid-quit
//      (a window created during the quit sequence can abort that quit).
//   3. A second-instance click NEVER looks dead: boot in progress raises the
//      splash, boot finished with no window revives the real window.
//   4. The splash stays up until startup work settles (heavy imports, DB
//      open, this month's subscriptions, print-window prewarm). The main
//      window is created hidden so its renderer can load in parallel, but
//      it is not revealed — and the splash is not closed — before that.
//      A cap keeps a wedged import from stranding the splash forever, and a
//      throw anywhere in the boot body is caught by the whenReady .catch
//      which still creates the window. Every step is recorded to
//      <userData>/logs/boot.log.
const MAIN = readFileSync(
  fileURLToPath(new URL("./main.ts", import.meta.url)),
  "utf8"
);

describe("quit path cannot leave a lock-holding windowless zombie", () => {
  it("window-all-closed guards closeDB so quitApp() always runs", () => {
    const handler = MAIN.slice(MAIN.indexOf('app.on("window-all-closed"'));
    expect(handler).toContain("try { closeDB(); } catch");
    // The quit call must still follow the guarded close (not be replaced by
    // an early return). quitApp() is the single exit path — it disposes
    // hidden windows and calls app.quit().
    expect(handler.indexOf("quitApp()")).toBeGreaterThan(
      handler.indexOf("try { closeDB(); } catch")
    );
  });

  it("quitApp disposes hidden windows and force-exits if graceful quit stalls", () => {
    const fn = MAIN.slice(MAIN.indexOf("function quitApp()"), MAIN.indexOf("function revealMainWindow()"));
    expect(fn).toContain("releaseHiddenWindows()");
    expect(fn).toContain("app.quit()");
    expect(fn).toContain("app.exit(0)");
    // Longer than the WhatsApp graceful-quit bound (9 s) so a legitimate
    // slow exit is never cut short, and NOT unref'd so a leftover handle
    // cannot outlive Close.
    expect(fn).toContain("12_000");
    // The hard-exit timer must not be unref'd — an unref'd timer does not
    // keep the process alive, so a leftover socket could outlive Close
    // without the net ever firing.
    expect(fn).toContain("setTimeout(() => { try { app.exit(0); } catch { /* already gone */ } }, 12_000);");
    expect(fn).not.toContain("12_000).unref");
    // The warm PDF window is the hidden BrowserWindow that used to keep
    // the process alive after the main window closed.
    const release = MAIN.slice(MAIN.indexOf("function releaseHiddenWindows()"), MAIN.indexOf("function quitApp()"));
    expect(release).toContain("disposePdfRenderer()");
    expect(release).toContain("closeSplash()");
  });

  it("confirm-close and the main window closed handler both quit for real", () => {
    expect(MAIN).toContain('ipcMain.handle("win:confirm-close"');
    const confirm = MAIN.slice(MAIN.indexOf('ipcMain.handle("win:confirm-close"'), MAIN.indexOf('ipcMain.on("win:renderer-ready"'));
    expect(confirm).toContain("releaseHiddenWindows()");
    expect(confirm).toContain("quitApp()");
    expect(confirm).toContain("quitRequested = true");
    // A click on the icon while teardown is in flight must not revive a
    // window inside the process that is about to exit.
    const second = MAIN.slice(MAIN.indexOf('app.on("second-instance"'), MAIN.indexOf("bootLog(\"main-module-loaded\")"));
    expect(second.indexOf("if (quitRequested) return;")).toBeGreaterThan(-1);
    expect(second.indexOf("if (quitRequested) return;")).toBeLessThan(second.indexOf("mainWindow.show()"));
  });

  it("before-quit guards closeDB too (a throw there aborts later quit listeners)", () => {
    const handler = MAIN.slice(MAIN.indexOf('app.on("before-quit"'));
    expect(handler).toContain("try { closeDB(); } catch");
    expect(handler).toContain("releaseHiddenWindows()");
  });
});

describe("a lockless launch can never become a second live instance", () => {
  it("exits hard inside whenReady when the single-instance lock was lost", () => {
    const readyIdx = MAIN.indexOf("app.whenReady().then");
    const guardIdx = MAIN.indexOf(
      "if (!gotSingleInstanceLock) { app.exit(0); return; }"
    );
    expect(readyIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(readyIdx);
  });
});

describe("second-instance clicks are never dead (splash or revival)", () => {
  it("revives the real window when the running instance has none (boot finished)", () => {
    const handler = MAIN.slice(MAIN.indexOf('app.on("second-instance"'));
    expect(handler).toContain("else if (bootComplete)");
    expect(handler.indexOf("createWindow();")).toBeGreaterThan(
      handler.indexOf("else if (bootComplete)")
    );
  });

  it("raises the splash while the boot is still in progress", () => {
    const handler = MAIN.slice(MAIN.indexOf('app.on("second-instance"'));
    expect(handler).toContain("showSplash();");
  });

  it("marks boot complete only after the first createWindow()", () => {
    const createIdx = MAIN.indexOf("  createWindow();\n");
    const flagIdx = MAIN.indexOf("bootComplete = true;");
    expect(createIdx).toBeGreaterThan(-1);
    expect(flagIdx).toBeGreaterThan(createIdx);
  });
});

describe("the boot can never wedge before the first window", () => {
  it("starts the WhatsApp engine import under the splash, before the window is revealed", () => {
    const splashIdx = MAIN.indexOf("createSplashWindow();");
    const bgIdx = MAIN.indexOf('import("./whatsapp-ipc.js")');
    expect(splashIdx).toBeGreaterThan(-1);
    expect(bgIdx).toBeGreaterThan(splashIdx);
    // Registration happens inside the dynamic-import .then, and that
    // promise is part of the reveal gate (not fire-and-forget).
    expect(MAIN).toContain("m.registerWhatsAppIpc(");
    const gateIdx = MAIN.indexOf('capStartupWork(whatsappReady, "whatsapp"');
    const settledIdx = MAIN.indexOf('markStartupSettled("work-done")');
    expect(gateIdx).toBeGreaterThan(bgIdx);
    expect(settledIdx).toBeGreaterThan(gateIdx);
  });

  it("creates the hidden window in parallel, but does not reveal it until startup work settles", () => {
    // No uncapped `await import(...)` before the splash, and no race that
    // reveals early. The renderer loads while the splash is up; reveal is
    // a separate step that requires startupSettled.
    expect(MAIN).not.toContain("Promise.race([whatsappReady");
    expect(MAIN).not.toMatch(/await[\s\S]{0,40}import\("\.\/whatsapp-ipc\.js"\)/);
    expect(MAIN).toContain("if (!startupSettled || !revealRequested) return;");
    // renderer-ready must NOT show the window on its own — that was the
    // path that dropped the splash while boot work was still running.
    const readyHandler = MAIN.slice(MAIN.indexOf('ipcMain.on("win:renderer-ready"'), MAIN.indexOf('app.on("child-process-gone"'));
    expect(readyHandler).toContain('armReveal("renderer-ready")');
    expect(readyHandler).not.toContain("closeSplash()");
    // Receipt IPC (the last non-WhatsApp registration) still happens BEFORE
    // the first createWindow, so a window can never call a missing handler.
    const receiptIdx = MAIN.indexOf("registerReceiptIpc(");
    const createIdx = MAIN.indexOf("  createWindow();\n");
    expect(receiptIdx).toBeGreaterThan(-1);
    expect(receiptIdx).toBeLessThan(createIdx);
    expect(MAIN.indexOf('markStartupSettled("work-done")')).toBeGreaterThan(createIdx);
  });

  it("runs monthly subscription generation and PDF prewarm under the splash, before reveal", () => {
    const createIdx = MAIN.indexOf("  createWindow();\n");
    const monthIdx = MAIN.indexOf('bootLog("subscriptions:month-ensured")');
    const prewarmIdx = MAIN.indexOf("try { prewarmPdfRenderer();");
    const settledIdx = MAIN.indexOf('markStartupSettled("work-done")');
    expect(monthIdx).toBeGreaterThan(createIdx);
    expect(prewarmIdx).toBeGreaterThan(createIdx);
    expect(settledIdx).toBeGreaterThan(monthIdx);
    expect(settledIdx).toBeGreaterThan(prewarmIdx);
    // The old post-reveal timers must be gone — they were the hitch.
    expect(MAIN).not.toContain("setTimeout(() => { try { prewarmPdfRenderer(); }");
  });

  it("catches ANY throw in the boot body and still creates the window", () => {
    // The whenReady chain must end in a .catch that records the failure,
    // releases the reveal gate, and attempts createWindow — a silent
    // rejection used to strand the splash.
    expect(MAIN).toMatch(/\)\.catch\(\(err\) => \{[\s\S]*bootLogError\("whenReady", err\);[\s\S]*markStartupSettled\("whenReady-failed"\);[\s\S]*createWindow\(\);[\s\S]*\} catch/);
  });

  it("logs stray rejections/exceptions instead of dying silently", () => {
    expect(MAIN).toContain('process.on("unhandledRejection"');
    expect(MAIN).toContain('process.on("uncaughtException"');
    expect(MAIN).toContain('bootLog("main-module-loaded")');
  });

  it("wraps the auto-updater import so its failure cannot strand the splash", () => {
    // Loaded under the splash and included in the reveal gate, but a
    // rejection is caught — a failed updater must not block the window.
    expect(MAIN).toContain('import("./auto-update.js")');
    expect(MAIN).toContain("m.registerAutoUpdater(");
    expect(MAIN).toContain('capStartupWork(updaterReady, "updater"');
    expect(MAIN).not.toContain('await import("./auto-update.js")');
    expect(MAIN).toContain('bootLog("updater:failed"');
  });
});

describe("splash paints even when ready-to-show never fires", () => {
  it("has a force-show fallback in createSplashWindow", () => {
    const splashSrc = readFileSync(
      fileURLToPath(new URL("./splash-window.ts", import.meta.url)),
      "utf8"
    );
    expect(splashSrc).toContain("!splashWin.isVisible()");
    expect(splashSrc).toContain("export function showSplash()");
    // Boot waits on this so sync DB work cannot run before the first pixel,
    // and the user cannot dismiss the splash (and think the app closed)
    // while that work is still running.
    expect(splashSrc).toContain("export function whenSplashShown()");
    expect(splashSrc).toContain("splashCloseAllowed");
    expect(splashSrc).toContain('id="splash-cap"');
  });
});

// v2.6.1 — office report on v2.6.0: the login page appeared HALF-PAINTED
// and typing echoed late. Two causes, both pinned here:
//   1. ready-to-show (+400 ms) and the old 4 s post-startup fallback
//      revealed the window before React had mounted and the fonts had
//      settled — on a slow first run the user could type into a page that
//      was still building itself.
//   2. The WhatsApp engine socket start (baileys handshake, CPU-heavy)
//      fired exactly when the login page appeared.
describe("the first appearance of the login page is fully painted", () => {
  it("ready-to-show must NOT arm the reveal (log only)", () => {
    const handler = MAIN.slice(MAIN.indexOf('mainWindow.once("ready-to-show"'));
    expect(handler).toContain('bootLog("window:ready-to-show")');
    const handlerBody = handler.slice(0, handler.indexOf("});"));
    expect(handlerBody).not.toContain("armReveal(");
    expect(handlerBody).not.toContain("show()");
  });

  it("revealMainWindow holds the splash while the page is still loading", () => {
    const fn = MAIN.slice(MAIN.indexOf("function revealMainWindow("), MAIN.indexOf("function armReveal("));
    // The paint guard: a page that is still loading must not be shown
    // (unless a forced fallback decides a wedged renderer must not hold
    // the splash forever).
    expect(fn).toContain("force = false");
    expect(fn).toContain("w.webContents.isLoading()");
    expect(fn).toContain("if (!force) {");
  });

  it("the post-startup fallback is a bounded poll that never cuts a healthy warm-up short", () => {
    const fn = MAIN.slice(MAIN.indexOf("function markStartupSettled("), MAIN.indexOf("/** A wedged import"));
    expect(fn).toContain("setInterval");
    // Page loaded but renderer ALWAYS silent (no alive ping = broken bridge
    // or JS error → no warm-up running) → reveal at 6 s; a renderer that
    // announced itself keeps warming until its own caps fire; absolute 20 s
    // cap no matter what (the splash can never strand).
    expect(fn).toContain("fallbackTicks >= 20");
    expect(fn).toContain("fallbackTicks >= 6 && loaded && !rendererAnnouncedAlive");
    // The forced reveal past the paint guard exists ONLY in this fallback.
    expect(fn).toContain("revealMainWindow(true)");
    // The old unconditional 4 s force-reveal is gone.
    expect(fn).not.toContain('armReveal("post-startup-fallback"); }, 4_000)');
  });

  it("the renderer announces alive at mount, then signals FULL boot: fonts + two frames + all chunks warmed", () => {
    const appSrc = readFileSync(
      fileURLToPath(new URL("../src/App.tsx", import.meta.url)),
      "utf8"
    );
    expect(appSrc).toContain("document.fonts?.ready");
    // Two rAFs = one full frame actually composited past the commit.
    expect(appSrc.match(/requestAnimationFrame\(\(\) => requestAnimationFrame/u)).toBeTruthy();
    // v2.6.3: before win:renderer-ready the renderer pre-parses EVERY lazy
    // page chunk behind the splash (that parse used to freeze the app for
    // seconds right after login), and pings win:renderer-alive at mount so
    // the main-process fallback can tell warming from wedged.
    expect(appSrc).toContain("warmAppChunks(");
    expect(appSrc).toContain("rendererAlive");
    // Bounded twice: the warm-up budget AND the overall fire cap (which must
    // stay below the main process's 20 s fallback) can never strand the splash.
    expect(appSrc).toContain("budgetMs: 12_000");
    expect(appSrc).toContain("setTimeout(fire, 15_000)");
    // The warm-up orders the post-login landing FIRST (Dashboard + recharts).
    const warmSrc = readFileSync(
      fileURLToPath(new URL("../src/lib/boot-warm.ts", import.meta.url)),
      "utf8"
    );
    expect(warmSrc.indexOf('import("@/pages/Dashboard")')).toBeGreaterThan(-1);
    expect(warmSrc.indexOf('import("@/pages/dashboard/DashboardCharts")')).toBeGreaterThan(warmSrc.indexOf('import("@/pages/Dashboard")'));
  });

  it("the WhatsApp engine socket start runs under the splash, awaited by the reveal gate", () => {
    // Registered WITHOUT the module-level autostart…
    expect(MAIN).toContain("{ autoStart: false }");
    // …because main.ts starts the engine itself INSIDE the gated
    // whatsappReady chain — the baileys handshake finishes (bounded) while
    // the splash is up, so it can never again land in the login page's
    // first minute (the v2.6.1 "+8 s after reveal" timer was the freeze).
    const bgIdx = MAIN.indexOf('import("./whatsapp-ipc.js")');
    const startIdx = MAIN.indexOf("m.autoStartEngine()");
    const gateIdx = MAIN.indexOf('capStartupWork(whatsappReady, "whatsapp"');
    const settledIdx = MAIN.indexOf('markStartupSettled("work-done")');
    expect(bgIdx).toBeGreaterThan(-1);
    expect(startIdx).toBeGreaterThan(bgIdx);
    expect(startIdx).toBeLessThan(gateIdx);
    expect(gateIdx).toBeLessThan(settledIdx);
    // No post-reveal engine-start timer may survive anywhere.
    const afterSettle = MAIN.slice(settledIdx);
    expect(afterSettle).not.toContain("autoStartEngine()");
    // And whatsapp-ipc exports the awaited splash-time start hook.
    const ipcSrc = readFileSync(
      fileURLToPath(new URL("./whatsapp-ipc.ts", import.meta.url)),
      "utf8"
    );
    expect(ipcSrc).toContain("export function autoStartEngine(): Promise<void>");
    expect(ipcSrc).toContain("return maybeStartEngine();");
    expect(ipcSrc).toContain("opts.autoStart === false");
  });

  it("auto-backup is idle-gated: it can never freeze an active user", () => {
    // The timers live in main.ts (cleared on quit so a pending kick cannot
    // reopen the DB during teardown); the runner lives in auto-backup.ts.
    expect(MAIN).toContain("autoBackupKick = setTimeout(() => { autoBackupKick = null; void runAutoBackup(); }, 90_000);");
    // v2.6.3: neither the 90 s kick nor any 10-min tick may run backup I/O
    // while the user touched the machine in the last 30 s (unless grossly
    // overdue). powerMonitor is the main-process source of system idle time.
    const backupSrc = readFileSync(
      fileURLToPath(new URL("./auto-backup.ts", import.meta.url)),
      "utf8"
    );
    const fn = backupSrc.slice(backupSrc.indexOf("export async function runAutoBackup"));
    expect(fn).toContain("powerMonitor.getSystemIdleTime()");
    expect(fn).toContain("grosslyOverdue");
  });
});

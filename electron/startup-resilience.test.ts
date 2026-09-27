import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Zombie-startup guards (user report on v2.4.15: after the first install the
// app opened once — slowly — and after that "splash screen is not coming at
// all and application also not coming at all, but seeing in task manager").
//
// That symptom is a WINDOWLESS PROCESS still holding the single-instance
// lock: every later launch loses the lock and quits silently, so nothing
// ever appears again until the user manually kills the process. Four
// independent defenses are pinned here, all in electron/main.ts:
//   1. A throwing closeDB() can no longer skip app.quit() (the classic way a
//      windowless zombie is born), and a safety-net timer force-exits a
//      windowless process 15 s after the last window closed.
//   2. A launch that loses the lock can never build windows/handlers mid-quit
//      (a window created during the quit sequence can abort that quit).
//   3. A second-instance click NEVER looks dead: boot in progress raises the
//      splash, boot finished with no window revives the real window.
//   4. The boot can no longer wedge before the first window: the heavy
//      WhatsApp import runs in the BACKGROUND and the first window is NOT
//      gated on it at all (v2.5.1 — the old 15 s race still left the splash
//      staring at the user for up to 15 s), the auto-updater import is
//      fire-and-forget, and a throw anywhere in the boot body is caught by
//      the whenReady .catch which still creates the window. Every step is
//      recorded to <userData>/logs/boot.log so the next failure report can
//      be diagnosed instead of guessed at.
const MAIN = readFileSync(
  fileURLToPath(new URL("./main.ts", import.meta.url)),
  "utf8"
);

describe("quit path cannot leave a lock-holding windowless zombie", () => {
  it("window-all-closed guards closeDB so app.quit() always runs", () => {
    const handler = MAIN.slice(MAIN.indexOf('app.on("window-all-closed"'));
    expect(handler).toContain("try { closeDB(); } catch");
    // The quit call must still follow the guarded close (not be replaced by
    // an early return).
    expect(handler.indexOf("app.quit();")).toBeGreaterThan(
      handler.indexOf("try { closeDB(); } catch")
    );
  });

  it("window-all-closed installs a hard-exit safety net for windowless processes", () => {
    const handler = MAIN.slice(MAIN.indexOf('app.on("window-all-closed"'));
    expect(handler).toContain("app.exit(0)");
    // The net must be longer than the WhatsApp graceful-quit bound (9 s) so
    // a legitimate slow exit is never cut short.
    expect(handler).toContain("15_000");
    expect(handler).toContain("getAllWindows().length === 0");
  });

  it("before-quit guards closeDB too (a throw there aborts later quit listeners)", () => {
    const handler = MAIN.slice(MAIN.indexOf('app.on("before-quit"'));
    expect(handler).toContain("try { closeDB(); } catch");
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
  it("starts the WhatsApp engine import in the background, under the splash", () => {
    const splashIdx = MAIN.indexOf("createSplashWindow();");
    const bgIdx = MAIN.indexOf('import("./whatsapp-ipc.js")');
    expect(splashIdx).toBeGreaterThan(-1);
    expect(bgIdx).toBeGreaterThan(splashIdx);
    // Registration happens exactly once, inside the background .then chain.
    expect(MAIN).toContain(".then((m) => { m.registerWhatsAppIpc(");
  });

  it("creates the first window WITHOUT waiting for the WhatsApp engine (v2.5.1)", () => {
    // The old `Promise.race` against the engine load kept the splash up for
    // up to 15 s; nothing the login window does needs WhatsApp, so there
    // must be no await/gate of that import anywhere in the boot.
    expect(MAIN).not.toContain("Promise.race([whatsappReady");
    expect(MAIN).not.toMatch(/await[\s\S]{0,40}import\("\.\/whatsapp-ipc\.js"\)/);
    // Receipt IPC (the last non-WhatsApp registration) still happens BEFORE
    // the first createWindow, so a window can never call a missing handler.
    const receiptIdx = MAIN.indexOf("registerReceiptIpc(");
    const createIdx = MAIN.indexOf("  createWindow();\n");
    expect(receiptIdx).toBeGreaterThan(-1);
    expect(receiptIdx).toBeLessThan(createIdx);
  });

  it("defers monthly subscription generation until after the window exists", () => {
    const createIdx = MAIN.indexOf("  createWindow();\n");
    const deferredIdx = MAIN.indexOf("setTimeout(() => {\n    try { data.subscriptions.ensureCurrentMonth();");
    expect(deferredIdx).toBeGreaterThan(createIdx);
  });

  it("catches ANY throw in the boot body and still creates the window", () => {
    // The whenReady chain must end in a .catch that records the failure and
    // attempts createWindow — a silent rejection used to strand the splash.
    expect(MAIN).toMatch(/\}\)\.catch\(\(err\) => \{[\s\S]*bootLogError\("whenReady", err\);[\s\S]*try \{ createWindow\(\); \} catch/);
  });

  it("logs stray rejections/exceptions instead of dying silently", () => {
    expect(MAIN).toContain('process.on("unhandledRejection"');
    expect(MAIN).toContain('process.on("uncaughtException"');
    expect(MAIN).toContain('bootLog("main-module-loaded")');
  });

  it("wraps the auto-updater import so its failure cannot strand the splash", () => {
    // v2.5.1: fire-and-forget — not even the module load is awaited.
    expect(MAIN).toMatch(/void import\("\.\/auto-update\.js"\)\s*\n\s*\.then\(\(m\) => \{ m\.registerAutoUpdater/);
    expect(MAIN).not.toContain('await import("./auto-update.js")');
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
  });
});

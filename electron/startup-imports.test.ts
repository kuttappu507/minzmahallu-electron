/*
 * Task 44 — startup-order guard (import lightness of the Electron entry).
 *
 * The instant-splash architecture depends on main.ts NOT paying for heavy
 * module loads before app.whenReady() can put the splash window on screen.
 * This test pins the architecture at the source level so nobody can quietly
 * reintroduce a top-level import of exceljs / the baileys-bearing
 * whatsapp-ipc chain / electron-updater and silently bring back the
 * "double-click and nothing happens for seconds" experience.
 *
 * The counterpart behaviour tests live in splash-window.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const mainSrc = readFileSync(fileURLToPath(new URL("./main.ts", import.meta.url)), "utf8");

/** A static top-level import of the given specifier (start-of-line `import`,
 *  which dynamic `await import(...)` calls never match). */
function hasStaticImport(specifier: string): boolean {
  const re = new RegExp(`^import\\s[^;]*["']${specifier.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}["']`, "m");
  return re.test(mainSrc);
}

describe("main.ts startup imports stay light (instant splash)", () => {
  it("does not statically import exceljs", () => {
    expect(hasStaticImport("exceljs")).toBe(false);
  });

  it("does not statically import the whatsapp-ipc module (baileys chain)", () => {
    expect(hasStaticImport("./whatsapp-ipc.js")).toBe(false);
  });

  it("does not statically import whatsapp.service either (welfare notify path)", () => {
    expect(hasStaticImport("./services/whatsapp.service.js")).toBe(false);
  });

  it("does not statically import auto-update (electron-updater chain)", () => {
    expect(hasStaticImport("./auto-update.js")).toBe(false);
  });

  it("loads the heavy modules dynamically, under the splash", () => {
    // Still dynamic — a static import would run before the splash exists.
    // The boot DOES wait for these promises before revealing the window
    // (capStartupWork), so the wait happens while the splash is up.
    expect(mainSrc).toContain('import("./whatsapp-ipc.js")');
    expect(mainSrc).toContain('import("./services/whatsapp.service.js")');
    expect(mainSrc).toContain('import("./auto-update.js")');
    expect(mainSrc).toContain('await import("exceljs")');
  });

  it("does not statically await the heavy imports before the splash exists", () => {
    // `await import(...)` before createSplashWindow would bring back the
    // dead-desktop gap. The wait is on the already-started promises, after
    // the splash is up.
    const splashCreate = mainSrc.indexOf("createSplashWindow()");
    const beforeSplash = mainSrc.slice(0, splashCreate);
    expect(beforeSplash).not.toContain('import("./whatsapp-ipc.js")');
    expect(beforeSplash).not.toContain('import("./auto-update.js")');
    expect(mainSrc).not.toContain('await import("./whatsapp-ipc.js")');
    expect(mainSrc).not.toContain('await import("./auto-update.js")');
  });

  it("holds the splash until startup work settles, then reveals the main window", () => {
    const splashCreate = mainSrc.indexOf("createSplashWindow()");
    expect(splashCreate).toBeGreaterThan(-1);
    const afterSplash = mainSrc.slice(splashCreate);
    // Splash paints before the synchronous IPC registrations.
    expect(afterSplash.indexOf("await whenSplashShown()")).toBeGreaterThan(-1);
    expect(afterSplash.indexOf("await whenSplashShown()")).toBeLessThan(afterSplash.indexOf("ipcMain.handle(\"auth:login\""));
    // Hidden window is created so the renderer can load in parallel, but
    // the reveal gate is awaited AFTER that, and only then is the splash
    // allowed to drop (markStartupSettled → revealMainWindow).
    const createWindowIdx = afterSplash.indexOf("createWindow()");
    const gateIdx = afterSplash.indexOf("capStartupWork(whatsappReady, \"whatsapp\"");
    const settledIdx = afterSplash.indexOf('markStartupSettled("work-done")');
    expect(createWindowIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(createWindowIdx);
    expect(settledIdx).toBeGreaterThan(gateIdx);
    expect(afterSplash).toContain('capStartupWork(updaterReady, "updater"');
    expect(afterSplash).toContain('capStartupWork(dataReady, "data"');
    // Month generation and the print-window prewarm are part of that gate,
    // not timers that fire after the window is already on screen.
    expect(afterSplash.indexOf('bootLog("subscriptions:month-ensured")')).toBeGreaterThan(createWindowIdx);
    expect(afterSplash.indexOf('bootLog("subscriptions:month-ensured")')).toBeLessThan(settledIdx);
    expect(afterSplash).toContain("try { prewarmPdfRenderer();");
    expect(mainSrc).toContain("if (!startupSettled || !revealRequested) return;");
    expect(mainSrc).toContain("closeSplash()");
  });
});

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
 * v2.6.3 NOTE: main.ts was split — the IPC handlers and boot helpers moved
 * into crud-ipc.ts / export-ipc.ts / backup-ipc.ts / session.ts /
 * data-dir.ts / auto-backup.ts / uninstall-verify.ts. Those modules are
 * STATICALLY imported by main.ts, so they run pre-splash too: the
 * anti-static-import rule below applies to them exactly as to main.ts
 * (ENTRY_MODULES). exceljs may only ever be dynamically imported.
 *
 * The counterpart behaviour tests live in splash-window.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const mainSrc = read("./main.ts");
// Everything main.ts statically imports that runs before the splash exists.
const ENTRY_MODULES: Array<[string, string]> = [
  ["main.ts", mainSrc],
  ["session.ts", read("./session.ts")],
  ["data-dir.ts", read("./data-dir.ts")],
  ["auto-backup.ts", read("./auto-backup.ts")],
  ["uninstall-verify.ts", read("./uninstall-verify.ts")],
  ["crud-ipc.ts", read("./crud-ipc.ts")],
  ["export-ipc.ts", read("./export-ipc.ts")],
  ["backup-ipc.ts", read("./backup-ipc.ts")],
];
const allEntrySrc = ENTRY_MODULES.map(([, src]) => src).join("\n");

/** A static top-level import of the given specifier (start-of-line `import`,
 *  which dynamic `await import(...)` calls never match). */
function hasStaticImportIn(src: string, specifier: string): boolean {
  const re = new RegExp(`^import\\s[^;]*["']${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "m");
  return re.test(src);
}

describe("boot-chain imports stay light (instant splash)", () => {
  it("does not statically import exceljs anywhere in the pre-splash chain", () => {
    for (const [name, src] of ENTRY_MODULES) {
      expect(hasStaticImportIn(src, "exceljs"), `${name} must only ever dynamically import exceljs`).toBe(false);
    }
  });

  it("does not statically import the whatsapp-ipc module (baileys chain)", () => {
    for (const [name, src] of ENTRY_MODULES) {
      expect(hasStaticImportIn(src, "./whatsapp-ipc.js"), name).toBe(false);
    }
  });

  it("does not statically import whatsapp.service either (welfare notify path)", () => {
    for (const [name, src] of ENTRY_MODULES) {
      expect(hasStaticImportIn(src, "./services/whatsapp.service.js"), name).toBe(false);
    }
  });

  it("does not statically import auto-update (electron-updater chain)", () => {
    for (const [name, src] of ENTRY_MODULES) {
      expect(hasStaticImportIn(src, "./auto-update.js"), name).toBe(false);
    }
  });

  it("loads the heavy modules dynamically, under the splash", () => {
    // Still dynamic — a static import would run before the splash exists.
    // The boot DOES wait for these promises before revealing the window
    // (capStartupWork), so the wait happens while the splash is up.
    expect(mainSrc).toContain('import("./whatsapp-ipc.js")');
    expect(allEntrySrc).toContain('import("./services/whatsapp.service.js")');
    expect(mainSrc).toContain('import("./auto-update.js")');
    expect(allEntrySrc).toContain('await import("exceljs")');
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

  it("forces the uniform software rendering path on every machine class (v2.6.5)", () => {
    // Office report: low-end machines were smooth while mid-range machines
    // opened late (no splash for a long time), flashed a white box of the
    // splash's size and froze for a while after login — the fingerprint of
    // GPU-driver variance (Chromium blocklists basic low-end iGPUs into the
    // deterministic software path, while mid-range hybrid-GPU machines keep
    // a flaky hardware path). app.disableHardwareAcceleration() gives low,
    // mid and high end the IDENTICAL rendering pipeline. It must stay at
    // module level, BEFORE app.whenReady(), or the first windows would come
    // up on whatever GPU path the driver picks.
    const disableIdx = mainSrc.indexOf("app.disableHardwareAcceleration()");
    const readyIdx = mainSrc.indexOf("app.whenReady()");
    expect(disableIdx).toBeGreaterThan(-1);
    expect(readyIdx).toBeGreaterThan(disableIdx);
  });

  it("holds the splash until startup work settles, then reveals the main window", () => {
    const splashCreate = mainSrc.indexOf("createSplashWindow()");
    expect(splashCreate).toBeGreaterThan(-1);
    const afterSplash = mainSrc.slice(splashCreate);
    // Splash paints before the synchronous IPC registrations. (v2.6.3: the
    // registrations live in crud-ipc.ts / export-ipc.ts / backup-ipc.ts and
    // are wired from main.ts — the call sites carry the ordering guarantee.)
    const registerIdx = afterSplash.indexOf("registerCrudIpc(");
    expect(afterSplash.indexOf("await whenSplashShown()")).toBeGreaterThan(-1);
    expect(afterSplash.indexOf("await whenSplashShown()")).toBeLessThan(registerIdx);
    expect(registerIdx).toBeLessThan(afterSplash.indexOf("registerBackupIpc("));
    // The auth:login handler itself must exist in the CRUD module.
    expect(allEntrySrc).toContain('ipcMain.handle("auth:login"');
    // Hidden window is created so the renderer can load in parallel, but
    // the reveal gate is awaited AFTER that, and only then is the splash
    // allowed to drop (markStartupSettled → revealMainWindow).
    const createWindowIdx = afterSplash.indexOf("createWindow()");
    const gateIdx = afterSplash.indexOf('capStartupWork(whatsappReady, "whatsapp"');
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

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
    // the splash is up. (A `typeof import(...)` TYPE reference — used for
    // the lazy module handles since v2.6.11 — is compile-time only and runs
    // nothing, so it is stripped before this check.)
    const splashCreate = mainSrc.indexOf("createSplashWindow()");
    const beforeSplash = mainSrc.slice(0, splashCreate).replace(/typeof import\("[^"]+"\)/g, "");
    expect(beforeSplash).not.toContain('import("./whatsapp-ipc.js")');
    expect(beforeSplash).not.toContain('import("./auto-update.js")');
    expect(mainSrc).not.toContain('await import("./whatsapp-ipc.js")');
    expect(mainSrc).not.toContain('await import("./auto-update.js")');
  });

  it("restores the machine's native rendering path (v2.6.7 field verdict)", () => {
    // v2.6.5 forced app.disableHardwareAcceleration() to give low/mid/high
    // an identical software pipeline. Field verdict on the v2.6.5 + v2.6.6
    // builds: mid-range machines STILL opened badly, and the office
    // confirmed the earlier builds (native GPU path) had none of these
    // problems on the same hardware. Low-end machines never needed the
    // switch — Chromium's own blocklist pins old/basic iGPUs to software
    // rendering with or without it. The blanket disable is therefore a
    // pure mid/high-end slowdown and must NEVER come back; the
    // symptom-specific guards (opaque win32 window, occlusion switch,
    // GPU-crash invalidate, show-before-load splash) stay.
    expect(mainSrc).not.toContain("app.disableHardwareAcceleration()");
  });

  it("starts no heavy import before the splash content is on screen (v2.6.7)", () => {
    // The baileys + electron-updater dynamic imports saturate CPU/disk
    // while running; if they start before the splash has painted, the
    // splash's own renderer is starved and the splash content lands
    // seconds late (the mid-range "double click has some seconds time to
    // come splash" report). Both imports must appear AFTER the
    // `await whenSplashShown()` gate in the whenReady body.
    const splashGate = mainSrc.indexOf("await whenSplashShown()");
    expect(splashGate).toBeGreaterThan(-1);
    // Search AFTER the gate so the compile-time-only `typeof import(...)`
    // type references at the top of the file cannot satisfy this.
    expect(mainSrc.indexOf('import("./whatsapp-ipc.js")', splashGate)).toBeGreaterThan(splashGate);
    expect(mainSrc.indexOf('import("./auto-update.js")', splashGate)).toBeGreaterThan(splashGate);
  });

  it("reveals never mid-warm-up: alive renderers get the 30 s cap (v2.6.7)", () => {
    // The renderer's warm-up budget only starts after fonts.ready; a slow
    // fonts phase used to make the main process force-reveal at 20 s while
    // chunks were still parsing — the one-time freeze exactly when login
    // typing started. A renderer that announced alive must never be
    // force-revealed before 30 s (its own 9 s budget + 15 s cap beat it).
    expect(mainSrc).toContain("fallbackTicks >= 30");
    expect(mainSrc).not.toContain("fallbackTicks >= 20");
  });

  it("keeps hidden-window renderers at full priority during boot (v2.6.6)", () => {
    // The main window spends the whole splash-time boot HIDDEN, and
    // Chromium backgrounded renderers raster and run timers at lower
    // priority — stretching the mount + chunk warm-up on office CPUs.
    // disable-renderer-backgrounding must be registered at module level,
    // before whenReady.
    const bgIdx = mainSrc.indexOf('app.commandLine.appendSwitch("disable-renderer-backgrounding")');
    const readyIdx = mainSrc.indexOf("app.whenReady()");
    expect(bgIdx).toBeGreaterThan(-1);
    expect(readyIdx).toBeGreaterThan(bgIdx);
  });

  it("disables the main window spellchecker (v2.6.6 login-typing freeze)", () => {
    // Office report: "one time freeze is there when inputing login details".
    // Chromium's spellcheck service initialises on the FIRST keystroke of
    // the first focused input (Electron default: enabled) — a one-time
    // stall exactly at the start of login typing. The app's inputs are
    // usernames, passwords, names and amounts; spellcheck is pure cost.
    expect(mainSrc).toContain("spellcheck: false");
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

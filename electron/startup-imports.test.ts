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
    // whatsapp-ipc is started in the BACKGROUND right after the splash goes
    // up (see the zombie/slow-boot guard in main.ts) and — since v2.5.1 — is
    // never awaited by the boot: the first window does not wait for it.
    expect(mainSrc).toContain('import("./whatsapp-ipc.js")');
    expect(mainSrc).toContain('import("./services/whatsapp.service.js")');
    expect(mainSrc).toContain('import("./auto-update.js")');
    expect(mainSrc).toContain('await import("exceljs")');
  });

  it("never awaits the whatsapp-ipc or auto-update imports on the boot path (v2.5.1)", () => {
    expect(mainSrc).not.toContain('await import("./whatsapp-ipc.js")');
    expect(mainSrc).not.toContain('await import("./auto-update.js")');
  });

  it("creates the native splash before any other boot work and closes it on first show", () => {
    const splashCreate = mainSrc.indexOf("createSplashWindow()");
    expect(splashCreate).toBeGreaterThan(-1);
    // The splash must be created BEFORE every IPC registration — i.e. it is
    // the first statement after the uninstall-verify branch inside whenReady.
    // Monthly subscription generation is DEFERRED to after the first window
    // (v2.5.1): on a first run it pays for the DB open + schema + generation
    // synchronously and must never delay the window.
    const afterSplash = mainSrc.slice(splashCreate);
    const createWindowIdx = afterSplash.indexOf("createWindow()");
    expect(createWindowIdx).toBeGreaterThan(-1);
    // The unique marker of the DEFERRED generation call (the plain
    // "ensureCurrentMonth" substring also appears in the IPC handler name
    // registration, which legitimately sits before the window).
    expect(afterSplash.indexOf('bootLog("subscriptions:month-ensured")')).toBeGreaterThan(createWindowIdx);
    expect(mainSrc).toContain("closeSplash()");
  });
});

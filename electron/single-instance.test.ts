import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Single-instance guard (user report: "2 or 3 instance are seeing in task
// manager if i clicked one time only").
//
// Two things are pinned here, both in electron/main.ts:
//   1. requestSingleInstanceLock() runs at module top level (before
//      app.whenReady): a second launch — typically a second click on the
//      desktop icon while the first instance is still on its splash screen,
//      since the main window stays hidden until "win:renderer-ready" — quits
//      itself instead of spawning a real second app.
//   2. The surviving instance restores + focuses its main window on the
//      "second-instance" event, so the user's extra click still "does
//      something" (the window comes to front).
// The uninstaller's --verify-uninstall gate must stay OUTSIDE the lock: the
// NSIS uninstaller may legitimately run the password window while the main
// app is open, and its fail-open exit path depends on the gate launching.
const MAIN = readFileSync(
  fileURLToPath(new URL("./main.ts", import.meta.url)),
  "utf8"
);

describe("single-instance lock (second click must not spawn a second app)", () => {
  it("requests the single-instance lock at module top level", () => {
    expect(MAIN).toContain("const gotSingleInstanceLock = isUninstallVerify || app.requestSingleInstanceLock();");
    // The lock request must sit BEFORE the REAL app.whenReady() call (the
    // comment above it also mentions "app.whenReady()" — match the call
    // with its .then chain, which only exists at the actual boot site).
    const lockIdx = MAIN.indexOf("app.requestSingleInstanceLock()");
    const readyIdx = MAIN.indexOf("app.whenReady().then");
    expect(lockIdx).toBeGreaterThan(-1);
    expect(readyIdx).toBeGreaterThan(lockIdx);
  });

  it("a launch that fails to get the lock quits immediately", () => {
    expect(MAIN).toContain("if (!gotSingleInstanceLock) {");
    expect(MAIN).toContain("app.quit();");
  });

  it("the running app restores + focuses its window on a second-instance event", () => {
    expect(MAIN).toContain('app.on("second-instance"');
    expect(MAIN).toContain("if (mainWindow.isMinimized()) mainWindow.restore();");
    expect(MAIN).toContain("mainWindow.show();");
    expect(MAIN).toContain("mainWindow.focus();");
  });

  it("the uninstall-verify gate bypasses the lock (uninstaller may run while the app is open)", () => {
    const lockIdx = MAIN.indexOf("const gotSingleInstanceLock =");
    // The fallback operand follows on the SAME line, ahead of the lock call,
    // so --verify-uninstall never contends for (or is blocked by) the
    // single-instance lock.
    const guardIdx = MAIN.indexOf("isUninstallVerify ||", lockIdx);
    expect(guardIdx).toBeGreaterThan(lockIdx);
    expect(MAIN.indexOf("app.requestSingleInstanceLock()")).toBeGreaterThan(guardIdx);
  });
});

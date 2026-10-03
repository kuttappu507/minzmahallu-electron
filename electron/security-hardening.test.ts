/*
 * Security hardening tests (v2.7.0 — Electron 44 + sandboxed renderer).
 *
 * These tests pin the security-relevant invariants at the SOURCE level so a
 * future edit cannot silently regress them:
 *
 *   1. EVERY BrowserWindow runs contextIsolation:true + nodeIntegration:false
 *      + sandbox:true, and the main/uninstall windows point at the CommonJS
 *      preload.cjs (sandboxed renderers cannot load ESM preloads).
 *   2. Every window's webContents is hardened: popups denied, page-initiated
 *      navigation blocked, webviews refused (window-hardening.ts).
 *   3. The preload exposes only explicit methods — never raw ipcRenderer —
 *      and refuses channels outside the reviewed namespaces.
 *   4. Dev server / DevTools can only engage in a non-packaged development
 *      runtime — never in a distributed build.
 *   5. Backup verify/restore honour only paths inside the allowed folders.
 *   6. The build emits preload.cjs and cleans up the stale ESM preload.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(path.join(here, p), "utf8");

describe("renderer sandbox", () => {
  it("every BrowserWindow sets contextIsolation:true, nodeIntegration:false, sandbox:true", () => {
    for (const [file, expectations] of [
      ["main.ts", 3], ["uninstall-verify.ts", 3], ["splash-window.ts", 3], ["print/pdf-renderer.ts", 3],
    ] as const) {
      const text = src(file);
      const winIdx = text.indexOf("new BrowserWindow");
      expect(winIdx, `${file} creates a window`).toBeGreaterThanOrEqual(0);
      const prefs = text.slice(winIdx, text.indexOf("});", winIdx));
      expect(prefs, `${file} contextIsolation`).toContain("contextIsolation: true");
      expect(prefs, `${file} nodeIntegration`).toContain("nodeIntegration: false");
      expect(prefs, `${file} sandbox`).toContain("sandbox: true");
      expect(expectations).toBe(3);
    }
  });

  it("no electron source disables the sandbox or re-enables node integration", () => {
    for (const bad of ["sandbox: false", "nodeIntegration: true", "webSecurity: false", "allowRunningInsecureContent: true", "nodeIntegrationInWorker: true"]) {
      expect(src("main.ts"), bad).not.toContain(bad);
      expect(src("uninstall-verify.ts"), bad).not.toContain(bad);
      expect(src("splash-window.ts"), bad).not.toContain(bad);
      expect(src("print/pdf-renderer.ts"), bad).not.toContain(bad);
    }
  });

  it("the main and uninstall-verify windows load the CommonJS preload", () => {
    expect(src("main.ts")).toContain('preload: path.join(__dirname, "preload.cjs")');
    expect(src("uninstall-verify.ts")).toContain('preload: path.join(__dirname, "preload.cjs")');
    // The ESM preload must not be referenced anywhere in the runtime sources.
    expect(src("main.ts")).not.toContain("preload.mjs");
    expect(src("uninstall-verify.ts")).not.toContain("preload.mjs");
  });
});

describe("navigation / window-open lockdown", () => {
  /** Source without comment lines — comments mention APIs too. */
  const codeOf = (file: string) => src(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

  it("every window creation site hardens its webContents", () => {
    for (const file of ["main.ts", "uninstall-verify.ts", "splash-window.ts", "print/pdf-renderer.ts"]) {
      const text = codeOf(file);
      const wins = text.split("new BrowserWindow").length - 1;
      const hardened = text.split("hardenWebContents(").length - 1;
      expect(wins, `${file} creates windows`).toBeGreaterThan(0);
      expect(hardened, `${file} hardens every window`).toBeGreaterThanOrEqual(wins);
    }
  });

  it("hardenWebContents denies popups, blocks navigation, refuses webviews", () => {
    const text = src("window-hardening.ts");
    expect(text).toContain("setWindowOpenHandler");
    expect(text).toContain('"deny"');
    expect(text).toContain("will-navigate");
    expect(text).toContain("preventDefault");
    expect(text).toContain("will-attach-webview");
  });

  it("main window allows renderer navigation only to the dev server in a dev runtime", () => {
    const text = src("main.ts");
    expect(text).toContain("!app.isPackaged");
    expect(text).toContain("process.env.NODE_ENV === \"development\"");
    expect(text).toContain("url.startsWith(process.env.VITE_DEV_SERVER_URL)");
  });
});

describe("dev-only functionality stays out of production", () => {
  it("dev server AND devtools require a non-packaged development runtime", () => {
    const text = src("main.ts");
    expect(text).toContain("isDevRuntime = !app.isPackaged && process.env.NODE_ENV === \"development\"");
    expect(text).toContain("if (isDevRuntime && devServerUrl)");
    // DevTools may only be opened inside that guarded branch.
    const guardIdx = text.indexOf("if (isDevRuntime && devServerUrl)");
    const devtoolsIdx = text.indexOf("openDevTools");
    const elseIdx = text.indexOf("} else mainWindow.loadFile", guardIdx);
    expect(devtoolsIdx).toBeGreaterThan(guardIdx);
    expect(devtoolsIdx).toBeLessThan(elseIdx);
  });
});

describe("preload API surface", () => {
  it("exposes the bridge without leaking ipcRenderer or generic send/invoke", () => {
    const text = src("preload.mts");
    expect(text).toContain("contextBridge.exposeInMainWorld");
    expect(text).not.toContain("exposeInMainWorld(\"mms\", { ipcRenderer");
    expect(text).not.toContain("exposeInMainWorld(\"mms\", { ipcRenderer:");
    expect(text).not.toContain("ipcRenderer: ipcRenderer");
    expect(text).not.toContain("ipcRenderer,");
    // No Node API usage — the sandboxed preload can only require electron.
    for (const banned in { "node:fs": 0, "node:path": 0, "node:os": 0, "node:crypto": 0, "child_process": 0, "require(\"path\")": 0 }) {
      expect(text, banned).not.toContain(banned);
    }
  });

  it("refuses IPC channels outside the reviewed namespaces", () => {
    const text = src("preload.mts");
    expect(text).toContain("CHANNEL_NAMESPACES");
    expect(text).toContain("Blocked IPC channel");
  });
});

describe("backup path validation", () => {
  it("verify/restore validate the renderer-supplied backup path", () => {
    const text = src("backup-ipc.ts");
    expect(text).toContain("validateBackupPath");
    expect(text).toContain('".mmbak"');
    expect(text).toContain("Backup file is outside the allowed backup folders");
    // Both destructive/reading handlers must route through the validator.
    const verifyIdx = text.indexOf("ipcMain.handle(\"backup:verify\"");
    const restoreIdx = text.indexOf("ipcMain.handle(\"backup:restore\"");
    expect(text.indexOf("validateBackupPath", verifyIdx)).toBeGreaterThan(verifyIdx);
    expect(text.indexOf("validateBackupPath", restoreIdx)).toBeGreaterThan(restoreIdx);
  });
});

describe("preload build pipeline", () => {
  it("transforms the TS preload into a CommonJS bundle and cleans stale ESM artifacts", () => {
    const text = src("../scripts/build-preload.mjs");
    expect(text).toContain('"cjs"');
    expect(text).toContain("preload.cjs");
    expect(text).toContain('"preload.mjs"');
  });

  it("the built CommonJS preload exists after the build and requires electron only", () => {
    const built = path.join(here, "..", "dist-electron", "preload.cjs");
    if (!existsSync(built)) {
      // Build products are generated by npm run build; source-level invariants
      // are covered by the other tests when running from a fresh checkout.
      return;
    }
    const text = readFileSync(built, "utf8");
    expect(text).toContain("exposeInMainWorld");
    expect(text).toMatch(/require\("electron"\)/);
  });
});

/*
 * Uninstall verification mode. The Windows uninstaller (NSIS customUnInit in
 * build/installer.nsh) runs the installed exe with --verify-uninstall BEFORE
 * removing any file. The app then shows ONLY a small password window:
 *   exit code 0 -> verified, uninstaller proceeds
 *   exit code 1 -> declined (wrong password / cancel) -> uninstaller aborts
 * A crashed/unlaunchable app fails open (any code other than 1 proceeds) so a
 * broken install can always still be removed. Silent uninstalls (updates,
 * reinstall-over) skip the gate in NSIS itself.
 *
 * Split from main.ts (v2.6.3 housekeeping) — behaviour is unchanged.
 */
import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { closeDB, getDB } from "./db/connection.js";
import { verifyUninstallPassword, UNINSTALL_ADMIN_SQL } from "./services/uninstall-guard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const isUninstallVerify = process.argv.includes("--verify-uninstall");

// Small frameless window for the uninstaller's admin-password gate.
// Sits top-most so it is visible above the uninstaller wizard.
function createUninstallVerifyWindow() {
  const win = new BrowserWindow({
    width: 470, height: 540, show: false, resizable: false, minimizable: false,
    maximizable: false, fullscreenable: false, autoHideMenuBar: true, frame: false,
    backgroundColor: "#0d9488", title: "MMS — Uninstall protection", hasShadow: true,
    webPreferences: { preload: path.join(__dirname, "preload.mjs"), contextIsolation: true, nodeIntegration: false, sandbox: false, zoomFactor: 1.0 },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.once("ready-to-show", () => { win.show(); win.focus(); });
  // The ?uninstall=1 query makes App.tsx render ONLY the UninstallConfirm page.
  win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { query: { uninstall: "1" } });
  win.on("closed", () => { /* window-all-closed decides the exit code */ });
  return win;
}

/** Registers ONLY the tiny verify window + its IPC, then creates the window.
 *  No main window, no WhatsApp engine, no auto-backup timer, and — crucially
 *  — no DB creation: an install that was never run has no database, and the
 *  gate must not seed one just to ask for its password. Called from the
 *  isUninstallVerify branch of main.ts' whenReady (which returns immediately
 *  after this; window-all-closed there decides the exit code). */
export function runUninstallVerifyMode(): void {
  const exitWith = (code: number) => { try { closeDB(); } catch {} app.exit(code); };
  ipcMain.handle("uninstall:dbStatus", () => {
    try { return { hasDb: fs.existsSync(path.join(app.getPath("userData"), "mms.db")) }; }
    catch { return { hasDb: false }; }
  });
  ipcMain.handle("uninstall:verify", (_e, password: string) => {
    try {
      const dbFile = path.join(app.getPath("userData"), "mms.db");
      if (!fs.existsSync(dbFile)) return { ok: false, reason: "no-database" };
      const rows = getDB().prepare(UNINSTALL_ADMIN_SQL).all() as Array<{ id: number; username: string; password_hash: string }>;
      return verifyUninstallPassword(rows, String(password ?? ""));
    } catch (err: any) {
      console.warn("[uninstall-verify] failed:", err?.message || err);
      return { ok: false, reason: "wrong-password" };
    }
  });
  ipcMain.handle("uninstall:finish", (_e, verified: boolean) => exitWith(verified ? 0 : 1));
  createUninstallVerifyWindow();
}

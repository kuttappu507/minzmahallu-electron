/*
 * Backup IPC handlers (split from main.ts, v2.6.3 housekeeping).
 *
 * Manual verified-backup create/list/verify/restore + mirror-folder picker.
 * Handler text moved verbatim — the session and the Administrator gate are
 * unchanged (audit finding A6). Note the automatic backup RUNNER lives in
 * auto-backup.ts (main.ts owns its timers); these are the user-driven ones.
 */
import { app, dialog, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import * as data from "./services/data.service.js";
import { closeDB } from "./db/connection.js";
import { createBackup, verifyBackup, extractVerifiedBackup, listBackups, mirrorBackup } from "./services/backup.service.js";
import { session, type GetWindow } from "./session.js";

export function registerBackupIpc(getWindow: GetWindow): void {
  ipcMain.handle("backup:create", async () => {
    if (!session.user) return { success: false, error: "Authentication required" };
    // A backup is a full copy of the mahallu database (all money records);
    // only administrators may export it (audit finding A6).
    if (session.user.role !== "Administrator") return { success: false, error: "Administrator permission is required" };
    try {
      const defaultName = `mms-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.mmbak`;
      const result = await dialog.showSaveDialog(getWindow()!, {
        title: "Save Backup",
        defaultPath: defaultName,
        filters: [{ name: "MMS Verified Backup", extensions: ["mmbak"] }],
      });
      if (result.canceled || !result.filePath) return { success: false, error: "cancelled" };
      const meta = await createBackup(result.filePath);
      // Mirror to the configured second location (best-effort — a missing USB
      // drive or unreachable folder must never fail the backup itself).
      try {
        const s: any = data.settings.load();
        const mirrorDir = String(s?.backup_mirror_dir || "").trim();
        if (mirrorDir) {
          const r = mirrorBackup(result.filePath, mirrorDir);
          if (r.ok) console.log(`[backup] Mirrored to: ${r.path}`);
          else console.warn("[backup] Mirror failed:", r.error);
        }
      } catch (mirrorErr: any) { console.warn("[backup] Mirror failed:", mirrorErr?.message || mirrorErr); }
      return { success: true, path: result.filePath, size: meta.size, sha256: meta.sha256 };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("backup:chooseMirrorDir", async () => {
    if (!session.user) return { success: false, error: "Authentication required" };
    try {
      const result = await dialog.showOpenDialog(getWindow()!, {
        title: "Choose Backup Mirror Folder",
        properties: ["openDirectory"],
      });
      if (result.canceled || !result.filePaths?.length) return { success: false, cancelled: true };
      return { success: true, path: result.filePaths[0] };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("backup:list", () => {
    if (!session.user) return { backups: [] };
    try {
      const userData = app.getPath("userData");
      const backups = listBackups(userData);
      return { backups };
    } catch (e: any) {
      return { backups: [] };
    }
  });
  ipcMain.handle("backup:verify", (_e, backupPath: string) => {
    if (!session.user) throw new Error("Authentication required");
    try {
      if (!backupPath || !fs.existsSync(backupPath)) throw new Error("Backup file not found");
      const result = verifyBackup(backupPath);
      return { success: true, ...result };
    } catch (err: any) {
      throw new Error(err.message);
    }
  });
  ipcMain.handle("backup:restore", async (_e, backupPath: string) => {
    if (!session.user) return { success: false, error: "Authentication required" };
    // Restoring REPLACES the live database (rolling back every financial
    // record) — administrator-only (audit finding A6).
    if (session.user.role !== "Administrator") return { success: false, error: "Administrator permission is required" };
    try {
      if (!backupPath || !fs.existsSync(backupPath)) return { success: false, error: "Backup file not found" };
      // 1. Verify the target backup integrity before doing anything destructive.
      verifyBackup(backupPath);
      // 2. Make a safety pre-restore backup of the current live DB.
      const userData = app.getPath("userData");
      const safetyPath = path.join(userData, `backup-pre-restore-${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.mmbak`);
      try { await createBackup(safetyPath); } catch (e) { console.warn("[backup] Pre-restore safety backup failed:", e); }
      // 3. Close the live DB connection so the file can be safely replaced.
      try { closeDB(); } catch {}
      // 4. Extract the verified backup into the live DB path.
      const liveDbPath = path.join(userData, "mms.db");
      extractVerifiedBackup(backupPath, liveDbPath);
      // 5. Relaunch the app so the new DB is loaded cleanly.
      setTimeout(() => { app.relaunch(); app.exit(0); }, 250);
      return { success: true, restarted: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}

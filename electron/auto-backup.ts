/*
 * Automatic backup runner (split from main.ts, v2.6.3 housekeeping — the
 * idle gate and all behaviour are unchanged).
 *
 * Called by main.ts on a 10-minute interval plus a 90 s first kick. Checks
 * settings.auto_backup; if enabled and the last backup is older than
 * backup_interval_hours, creates a .mmbak file in the userData directory,
 * prunes old auto-backups, and mirrors to the configured second location.
 */
import { app, powerMonitor } from "electron";
import path from "node:path";
import fs from "node:fs";
import { bootLog } from "./boot-log.js";

// INSTANT-SPLASH PASS (v2.7.0): this module is part of main.ts's pre-splash
// import chain (main.ts arms the timers), so its service imports must be
// lazy — a static import of data.service (better-sqlite3's native binding)
// or backup.service would delay the first visible pixel on every launch.
// The runner only needs them once a backup is actually due, minutes after
// boot, so a dynamic import inside runAutoBackup is free.
type DataModule = typeof import("./services/data.service.js");
type BackupServiceModule = typeof import("./services/backup.service.js");
let dataMod: DataModule | null = null;
let backupMod: BackupServiceModule | null = null;

export async function runAutoBackup(): Promise<void> {
  try {
    if (!dataMod) dataMod = await import("./services/data.service.js");
    if (!backupMod) backupMod = await import("./services/backup.service.js");
    const settings = dataMod.settings.load();
    if (!settings?.auto_backup) return;
    const intervalHours = Number(settings.backup_interval_hours || 24);
    if (intervalHours <= 0) return;
    const userData = app.getPath("userData");
    // Check existing backups to see if the last one is older than the interval.
    const backups = backupMod.listBackups(userData);
    const lastBackup = backups[0]; // sorted by time desc
    const now = Date.now();
    const elapsedHours = lastBackup ? (now - new Date(lastBackup.time).getTime()) / (1000 * 60 * 60) : Number.POSITIVE_INFINITY;
    if (elapsedHours < intervalHours) return; // too soon
    // IDLE-ONLY BACKUP (v2.6.3 — the freeze-fix family): a backup is a full
    // DB copy + SHA-256 + mirror write in THIS process. The 90 s first kick
    // used to land right around login, and a 10-min tick could land
    // mid-typing — the office felt both as a seconds-long input freeze.
    // Never run backup I/O while the user has touched the machine in the
    // last 30 s; the next 10-min tick retries. Exception: a backup overdue
    // by more than 2× the interval (or no backup at all) runs regardless —
    // data safety beats one quiet hitch.
    const grosslyOverdue = !lastBackup || elapsedHours > intervalHours * 2;
    let idleSecs = 0;
    try { idleSecs = powerMonitor.getSystemIdleTime(); } catch { idleSecs = 0; }
    if (idleSecs < 30 && !grosslyOverdue) {
      bootLog("auto-backup:deferred", `user active (idle ${idleSecs}s), retry next tick`);
      return;
    }
    const name = `backup-auto-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.mmbak`;
    const filePath = path.join(userData, name);
    await backupMod.createBackup(filePath);
    console.log(`[auto-backup] Created: ${name}`);
    // Retention: keep only the newest N auto-backups in the app data folder
    // (manual/verified backups and mirrored copies are NEVER touched).
    // Without this the folder grows forever — a hidden disk-space leak on
    // machines that run for months.
    try {
      const keepRaw = Number((settings as any)?.backup_keep_count ?? 30);
      const keep = Number.isFinite(keepRaw) && keepRaw > 0 ? Math.min(200, Math.max(3, Math.floor(keepRaw))) : 30;
      const autoBackups = backups
        .filter((b: any) => /^backup-auto-.*\.mmbak$/i.test(String(b?.name || "")))
        .sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime());
      for (const old of autoBackups.slice(keep)) {
        const oldPath = path.join(userData, String(old.name));
        try { if (fs.existsSync(oldPath)) { fs.unlinkSync(oldPath); console.log(`[auto-backup] Pruned old: ${old.name}`); } } catch (e) { console.warn("[auto-backup] prune failed:", e); }
      }
    } catch (e) { console.warn("[auto-backup] retention check failed:", e); }
    // Mirror the auto-backup to the configured second location (best-effort).
    const mirrorDir = String((settings as any)?.backup_mirror_dir || "").trim();
    if (mirrorDir) {
      const r = backupMod.mirrorBackup(filePath, mirrorDir);
      if (r.ok) console.log(`[auto-backup] Mirrored to: ${r.path}`);
      else console.warn("[auto-backup] Mirror failed:", r.error);
    }
  } catch (e) {
    console.warn("[auto-backup] Failed:", e);
  }
}

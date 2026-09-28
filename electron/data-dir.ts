/*
 * Data folder: short "mms" directory inside the OS app-data area (hidden from
 * casual browsing on Windows). Split from main.ts (v2.6.3 housekeeping) —
 * behaviour is unchanged. Must run BEFORE anything touches
 * app.getPath("userData") — DB, WhatsApp session, backups and settings all
 * resolve through it. Existing test installs are migrated by folder rename,
 * so their database, backups and WhatsApp pairing survive the change.
 */
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR_NAME = "mms";

// Consolidate every historical data-folder name into the single short "mms"
// directory. Runs at every boot: migrates a legacy folder when "mms" is
// missing, fills missing pieces (db / WhatsApp session / backups) when both
// exist, keeps whichever copy of the database is newer, and removes the
// legacy folder afterwards so users always see exactly ONE data folder.
function consolidateDataDirs(): void {
  const base = app.getPath("appData");
  const desired = path.join(base, DATA_DIR_NAME);
  const legacyNames = [
    "Minz Mahallu Management System",
    "Minz Mahallu Management",
    "minz-mahallu-management",
    "minz mahallu management",
  ];
  const seen = new Set<string>();
  const legacyDirs: string[] = [];
  const push = (p: string) => { if (!seen.has(p) && p !== desired) { seen.add(p); legacyDirs.push(p); } };
  for (const n of legacyNames) push(path.join(base, n));
  try {
    for (const e of fs.readdirSync(base)) {
      if (/minz\s*mahallu/i.test(e)) push(path.join(base, e));
    }
  } catch { /* appData unreadable — fall through with name list only */ }

  const hasDb = (d: string) => fs.existsSync(path.join(d, "mms.db"));
  const dbMtime = (d: string) => { try { return fs.statSync(path.join(d, "mms.db")).mtimeMs; } catch { return 0; } };

  for (const legacy of legacyDirs) {
    try {
      if (!fs.existsSync(legacy)) continue;
      if (!fs.existsSync(desired)) {
        fs.renameSync(legacy, desired);
        console.log(`[paths] Migrated data folder: "${path.basename(legacy)}" -> "${DATA_DIR_NAME}"`);
        continue;
      }
      // Both exist — move anything "mms" is missing out of the legacy folder.
      const coreFiles = ["mms.db", "mms.db-wal", "mms.db-shm"];
      if (!hasDb(desired) && hasDb(legacy)) {
        for (const f of coreFiles) {
          const src = path.join(legacy, f);
          if (fs.existsSync(src)) fs.renameSync(src, path.join(desired, f));
        }
      }
      if (!fs.existsSync(path.join(desired, "whatsapp")) && fs.existsSync(path.join(legacy, "whatsapp"))) {
        fs.renameSync(path.join(legacy, "whatsapp"), path.join(desired, "whatsapp"));
      }
      for (const f of fs.readdirSync(legacy)) {
        if (f.endsWith(".mmbak") && !fs.existsSync(path.join(desired, f))) {
          fs.renameSync(path.join(legacy, f), path.join(desired, f));
        }
      }
      if (hasDb(legacy) && hasDb(desired)) {
        // Two databases — keep the newer one as the live data.
        if (dbMtime(legacy) > dbMtime(desired)) {
          const aside = `${desired}-old-${new Date().toISOString().slice(0, 10)}`;
          try { fs.rmSync(aside, { recursive: true, force: true }); } catch { /* best effort */ }
          fs.renameSync(desired, aside);
          fs.renameSync(legacy, desired);
          console.log("[paths] Newer database found in legacy folder — swapped it in (old copy kept as " + path.basename(aside) + ")");
        } else {
          fs.rmSync(legacy, { recursive: true, force: true });
          console.log(`[paths] Removed already-migrated legacy folder: "${path.basename(legacy)}"`);
        }
      } else if (!hasDb(legacy)) {
        fs.rmSync(legacy, { recursive: true, force: true });
        console.log(`[paths] Removed leftover empty legacy folder: "${path.basename(legacy)}"`);
      }
    } catch (e: any) {
      console.warn(`[paths] Could not consolidate "${path.basename(legacy)}":`, e?.message || e);
    }
  }
  app.setPath("userData", desired);
}

/** Run at module-top of main.ts (before any userData access). Never throws:
 *  a failed consolidation falls back to pointing userData at the plain "mms"
 *  directory (or, failing even that, Electron's default userData). */
export function ensureShortDataDir(): void {
  try {
    consolidateDataDirs();
  } catch (e: any) {
    console.warn("[paths] Could not set short data folder (staying on default):", e?.message || e);
    try { app.setPath("userData", path.join(app.getPath("appData"), DATA_DIR_NAME)); } catch { /* keep default */ }
  }
}

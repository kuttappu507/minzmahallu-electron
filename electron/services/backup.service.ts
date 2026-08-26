import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDB } from "../db/connection.js";

export type BackupMeta = { version: 1; createdAt: string; size: number; sha256: string; file: string };

function sha256(file: string) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

export function createBackup(filePath: string): BackupMeta {
  const temp = `${filePath}.tmp-db`;
  try {
    // Use .backup() which returns a promise in newer better-sqlite3, or
    // works synchronously in older versions. Wrap in try to handle both.
    const db = getDB();
    try {
      // Synchronous backup (better-sqlite3 v9+)
      db.backup(temp);
    } catch (syncErr: any) {
      // If synchronous backup fails (e.g. file in use, WAL mode), try
      // copying the DB file directly as a fallback.
      console.warn("[backup] Sync backup failed, trying file copy fallback:", syncErr.message);
      const dbPath = path.join(path.dirname(temp), "mms.db");
      if (require("fs").existsSync(dbPath)) {
        // Copy main DB file
        fs.copyFileSync(dbPath, temp);
        // Copy WAL and SHM if they exist (to get a consistent snapshot)
        for (const suffix of ["-wal", "-shm"]) {
          const src = dbPath + suffix;
          if (fs.existsSync(src)) {
            try { fs.copyFileSync(src, temp + suffix); } catch {}
          }
        }
        // Checkpoint to merge WAL into the main DB before hashing
        try { db.pragma("wal_checkpoint(TRUNCATE)"); } catch {}
      } else {
        throw syncErr;
      }
    }
    const digest = sha256(temp);
    const stat = fs.statSync(temp);
    const manifest = Buffer.from(JSON.stringify({ version: 1, createdAt: new Date().toISOString(), size: stat.size, sha256: digest }), "utf8");
    const dbBytes = fs.readFileSync(temp);
    const header = Buffer.alloc(8);
    header.writeUInt32BE(manifest.length, 0);
    header.writeUInt32BE(0x4d4d5342, 4); // MMSB
    fs.writeFileSync(filePath, Buffer.concat([header, manifest, dbBytes]));
    return { version: 1, createdAt: new Date().toISOString(), size: stat.size, sha256: digest, file: filePath };
  } finally {
    try { fs.rmSync(temp, { force: true }); try { fs.rmSync(temp + "-wal", { force: true }); } catch {} try { fs.rmSync(temp + "-shm", { force: true }); } catch {} } catch {}
  }
}

export function verifyBackup(filePath: string) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.length < 8 || bytes.readUInt32BE(4) !== 0x4d4d5342) throw new Error("Invalid Minz Mahallu backup file");
  const manifestLength = bytes.readUInt32BE(0);
  const manifest = JSON.parse(bytes.subarray(8, 8 + manifestLength).toString("utf8"));
  const dbBytes = bytes.subarray(8 + manifestLength);
  const actual = crypto.createHash("sha256").update(dbBytes).digest("hex");
  if (actual !== manifest.sha256) throw new Error("Backup integrity check failed");
  if (dbBytes.length !== manifest.size) throw new Error("Backup size validation failed");
  return { valid: true, manifest };
}

export function extractVerifiedBackup(filePath: string, targetDb: string) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.length < 8 || bytes.readUInt32BE(4) !== 0x4d4d5342) throw new Error("Invalid Minz Mahallu backup file");
  const manifestLength = bytes.readUInt32BE(0);
  const manifest = JSON.parse(bytes.subarray(8, 8 + manifestLength).toString("utf8"));
  const dbBytes = bytes.subarray(8 + manifestLength);
  const actual = crypto.createHash("sha256").update(dbBytes).digest("hex");
  if (actual !== manifest.sha256 || dbBytes.length !== manifest.size) throw new Error("Backup integrity check failed");
  fs.writeFileSync(targetDb, dbBytes);
  return manifest;
}

export function listBackups(userData: string) {
  return fs.readdirSync(userData).filter(f => (f.startsWith("backup-") || f.startsWith("mms-backup-")) && f.endsWith(".mmbak")).map(file => {
    const full = path.join(userData, file); const stat = fs.statSync(full);
    let valid = false; try { verifyBackup(full); valid = true; } catch {}
    return { name: file, path: full, size: stat.size, time: stat.mtime.toISOString(), valid };
  }).sort((a,b)=>b.time.localeCompare(a.time));
}

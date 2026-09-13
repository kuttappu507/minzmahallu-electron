/* ============================================================================
 * Backups — `.mmbak` container files, byte-identical to the desktop format.
 *
 *   [0..4)  u32 BE — manifest length
 *   [4..8)  u32 BE — magic 0x4d4d5342 ("MMSB")
 *   [8..8+n)        JSON manifest { version, createdAt, size, sha256 }
 *   [8+n..]         the SQLite database image
 *
 * A backup made on the phone restores on the desktop and vice versa: same
 * magic, same manifest, same SHA-256 integrity check.
 *
 * Storage: files live in the app's documents folder ("docs/…"), which on
 * Android is app-private but reachable through the share sheet — so the admin
 * can send every backup to WhatsApp, Drive, or another phone. The mirror copy
 * (a second, byte-verified folder) survives a corrupted live database, and the
 * newest `keep` files are retained.
 * ========================================================================== */
import { getDB } from "../db/connection.js";
import { platform } from "../platform/index.js";
import { concat, sha256Hex, utf8Bytes, utf8String } from "../platform/crypto.js";

export type BackupMeta = { version: 1; createdAt: string; size: number; sha256: string; file: string };

export const BACKUP_FOLDER = "docs";
export const MIRROR_FOLDER = "docs/mirror";

function digest(bytes: Uint8Array): string {
  return sha256Hex(bytes);
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function writeU32BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

export function backupFileName(prefix = "mms-backup"): string {
  const stamp = new Date().toISOString().slice(0, 19).replace("T", "-").replace(/:/g, "-");
  return `${prefix}-${stamp}.mmbak`;
}

interface Container {
  manifest: { version: number; createdAt: string; size: number; sha256: string };
  payload: Uint8Array;
}

function unpack(bytes: Uint8Array): Container {
  if (bytes.length < 8 || readU32BE(bytes, 4) !== 0x4d4d5342) {
    throw new Error("Invalid Minz Mahallu backup file");
  }
  const manifestLength = readU32BE(bytes, 0);
  const manifest = JSON.parse(utf8String(bytes.subarray(8, 8 + manifestLength)));
  const payload = bytes.subarray(8 + manifestLength);
  const actual = digest(payload);
  if (actual !== manifest.sha256) throw new Error("Backup integrity check failed");
  if (payload.length !== manifest.size) throw new Error("Backup size validation failed");
  return { manifest, payload };
}

/**
 * Create a backup of the live database. The SQLite image is taken straight
 * from the in-memory engine (the mobile equivalent of better-sqlite3's
 * WAL-safe `db.backup()`).
 */
export async function createBackup(fileName?: string): Promise<BackupMeta> {
  const db = getDB();
  if (db.inTransaction) throw new Error("A database transaction is in progress — try the backup again in a moment");
  const image = db.export();
  const manifest = utf8Bytes(
    JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      size: image.length,
      sha256: digest(image),
    })
  );
  const header = new Uint8Array(8);
  writeU32BE(header, 0, manifest.length);
  writeU32BE(header, 4, 0x4d4d5342);
  const name = fileName || backupFileName();
  const host = await platform();
  await host.files.write(`${BACKUP_FOLDER}/${name}`, concat(concat(header, manifest), image));
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    size: image.length,
    sha256: digest(image),
    file: `${BACKUP_FOLDER}/${name}`,
  };
}

/** Validate a backup file without restoring it. */
export async function verifyBackup(path: string): Promise<{ valid: true; manifest: Container["manifest"] }> {
  const host = await platform();
  const bytes = await host.files.read(path);
  if (!bytes) throw new Error("Backup file not found");
  const { manifest } = unpack(bytes);
  return { valid: true, manifest };
}

/** Verify + return the SQLite image inside a backup (restore path). */
export async function extractVerifiedBackup(path: string): Promise<Uint8Array> {
  const host = await platform();
  const bytes = await host.files.read(path);
  if (!bytes) throw new Error("Backup file not found");
  return unpack(bytes).payload;
}

export interface BackupEntry {
  name: string;
  path: string;
  size: number;
  time: string;
  valid: boolean;
}

/** Every backup stored on the device, newest first. */
export async function listBackups(): Promise<BackupEntry[]> {
  const host = await platform();
  const files = (await host.files.list(BACKUP_FOLDER)).filter((file) => file.name.endsWith(".mmbak"));
  const entries: BackupEntry[] = [];
  for (const file of files) {
    const path = `${BACKUP_FOLDER}/${file.name}`;
    let valid = false;
    try {
      const bytes = await host.files.read(path);
      if (bytes) { unpack(bytes); valid = true; }
    } catch { valid = false; }
    entries.push({
      name: file.name,
      path,
      size: file.size,
      time: new Date(file.mtime || Date.now()).toISOString(),
      valid,
    });
  }
  return entries.sort((a, b) => b.time.localeCompare(a.time));
}

export async function deleteBackup(path: string): Promise<void> {
  const host = await platform();
  await host.files.remove(path);
}

/** Send a backup off the device (share sheet: Drive, WhatsApp, another phone). */
export async function shareBackup(path: string): Promise<{ saved: boolean; error?: string; cancelled?: boolean }> {
  const host = await platform();
  const bytes = await host.files.read(path);
  if (!bytes) throw new Error("Backup file not found");
  const name = path.split("/").pop() || "mms-backup.mmbak";
  return host.share.saveFile({ name, mime: "application/octet-stream", data: bytes, title: "MMS Backup" });
}

/**
 * Copy a finished .mmbak into a SECOND folder so data survives even if the live
 * database is wiped. Best-effort and non-throwing: a failed mirror must never
 * break the backup flow itself. The copy is byte-verified, and only the newest
 * `keep` backups are retained (oldest pruned) so the folder cannot grow without
 * bound.
 */
export async function mirrorBackup(sourcePath: string, mirrorFolder = MIRROR_FOLDER, keep = 10): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    if (!mirrorFolder || !mirrorFolder.trim()) return { ok: false, error: "no mirror folder configured" };
    const host = await platform();
    const bytes = await host.files.read(sourcePath);
    if (!bytes) return { ok: false, error: "source backup missing" };
    const name = sourcePath.split("/").pop() || backupFileName();
    const target = `${mirrorFolder.replace(/\/+$/, "")}/${name}`;
    await host.files.write(target, bytes);
    const copy = await host.files.read(target);
    if (!copy || digest(copy) !== digest(bytes)) {
      await host.files.remove(target);
      return { ok: false, error: "mirror copy failed verification" };
    }
    // Prune: keep the newest `keep` backups. Ordering prefers the ISO timestamp
    // embedded in the filename (all MMS backups carry one); files without a
    // stamp fall back to their modified time.
    const stamp = (fileName: string): string | null => {
      const match = /(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})/.exec(fileName);
      return match ? match[1] : null;
    };
    const files = (await host.files.list(mirrorFolder.replace(/\/+$/, ""))).filter((file) => file.name.endsWith(".mmbak"));
    files.sort((a, b) => {
      const keyA = stamp(a.name) ?? new Date(a.mtime).toISOString().slice(0, 19).replace("T", "-").replace(/:/g, "-");
      const keyB = stamp(b.name) ?? new Date(b.mtime).toISOString().slice(0, 19).replace("T", "-").replace(/:/g, "-");
      return keyB.localeCompare(keyA);
    });
    for (const old of files.slice(keep)) {
      await host.files.remove(`${mirrorFolder.replace(/\/+$/, "")}/${old.name}`);
    }
    return { ok: true, path: target };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

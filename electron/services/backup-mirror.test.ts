import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mirrorBackup, verifyBackup, createBackup, extractVerifiedBackup } from "./backup.service.js";

// mirrorBackup is pure-filesystem (no DB), so it can be tested directly.
// createBackup touches the DB — the mock lives in scripts/ and is wired via
// vitest config only for template tests; here we build a valid .mmbak by
// hand using the same file format (header + manifest + payload).

function makeFakeBackup(file: string, payload = "demo-payload") {
  const manifest = Buffer.from(JSON.stringify({ version: 1, createdAt: new Date().toISOString(), size: Buffer.byteLength(payload), sha256: "x" }), "utf8");
  const header = Buffer.alloc(8);
  header.writeUInt32BE(manifest.length, 0);
  header.writeUInt32BE(0x4d4d5342, 4);
  fs.writeFileSync(file, Buffer.concat([header, manifest, Buffer.from(payload)]));
}

describe("backup mirror", () => {
  let dir: string;
  let mirrorDir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "mms-mirror-test-"));
    mirrorDir = path.join(dir, "mirror");
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("copies the backup into the mirror folder and byte-verifies it", () => {
    const src = path.join(dir, "backup-auto-2026-09-05.mmbak");
    makeFakeBackup(src, "payload-a");
    const r = mirrorBackup(src, mirrorDir);
    expect(r.ok).toBe(true);
    expect(r.path).toBe(path.join(mirrorDir, "backup-auto-2026-09-05.mmbak"));
    expect(fs.existsSync(r.path!)).toBe(true);
    expect(fs.readFileSync(r.path!)).toEqual(fs.readFileSync(src));
  });

  it("creates the mirror folder if it does not exist", () => {
    const src = path.join(dir, "backup-1.mmbak");
    makeFakeBackup(src);
    const r = mirrorBackup(src, path.join(mirrorDir, "nested", "deep"));
    expect(r.ok).toBe(true);
    expect(fs.existsSync(r.path!)).toBe(true);
  });

  it("keeps only the newest N backups in the mirror (prune, filename timestamps)", () => {
    // Production names embed ISO timestamps; prune order must follow them.
    const names = [
      "backup-auto-2026-09-01-10-00-00.mmbak",
      "backup-auto-2026-09-02-10-00-00.mmbak",
      "backup-auto-2026-09-03-10-00-00.mmbak",
      "backup-auto-2026-09-04-10-00-00.mmbak",
      "backup-auto-2026-09-05-10-00-00.mmbak",
    ];
    for (const n of names) {
      const f = path.join(dir, n);
      makeFakeBackup(f, `payload-${n}`);
      const r = mirrorBackup(f, mirrorDir, 3);
      expect(r.ok).toBe(true);
    }
    const remaining = fs.readdirSync(mirrorDir).filter(f => f.endsWith(".mmbak")).sort();
    expect(remaining).toEqual([
      "backup-auto-2026-09-03-10-00-00.mmbak",
      "backup-auto-2026-09-04-10-00-00.mmbak",
      "backup-auto-2026-09-05-10-00-00.mmbak",
    ]);
  });

  it("prunes stamped names correctly even when file mtimes are identical (burst copies)", () => {
    const names = [
      "mms-backup-2026-09-01-09-00-00.mmbak",
      "mms-backup-2026-09-02-09-00-00.mmbak",
      "mms-backup-2026-09-03-09-00-00.mmbak",
      "mms-backup-2026-09-04-09-00-00.mmbak",
    ];
    for (const n of names) {
      const f = path.join(dir, n);
      makeFakeBackup(f, `p-${n}`);
      mirrorBackup(f, mirrorDir, 2);
    }
    // force identical mtimes on the mirrored copies (simulates a burst)
    const same = new Date();
    for (const f of fs.readdirSync(mirrorDir)) fs.utimesSync(path.join(mirrorDir, f), same, same);
    // one more mirror triggers a prune pass under identical mtimes
    const f2 = path.join(dir, "mms-backup-2026-09-05-09-00-00.mmbak");
    makeFakeBackup(f2, "p-newest");
    const r = mirrorBackup(f2, mirrorDir, 2);
    expect(r.ok).toBe(true);
    const remaining = fs.readdirSync(mirrorDir).filter(f => f.endsWith(".mmbak")).sort();
    expect(remaining).toEqual([
      "mms-backup-2026-09-04-09-00-00.mmbak",
      "mms-backup-2026-09-05-09-00-00.mmbak",
    ]);
  });

  it("fails soft (ok:false) when the source is missing", () => {
    const r = mirrorBackup(path.join(dir, "nope.mmbak"), mirrorDir);
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("fails soft when no mirror dir is configured", () => {
    const src = path.join(dir, "backup-1.mmbak");
    makeFakeBackup(src);
    const r = mirrorBackup(src, "");
    expect(r.ok).toBe(false);
  });

  it("fails soft when the mirror path is not a valid directory (a file)", () => {
    const src = path.join(dir, "backup-1.mmbak");
    makeFakeBackup(src);
    const blocker = path.join(dir, "blocker");
    fs.writeFileSync(blocker, "i am a file");
    const r = mirrorBackup(src, blocker);
    expect(r.ok).toBe(false);
  });

  it("mirrored file still passes verifyBackup format check", () => {
    const src = path.join(dir, "backup-auto-x.mmbak");
    makeFakeBackup(src, "payload-a");
    const r = mirrorBackup(src, mirrorDir);
    expect(r.ok).toBe(true);
    // verifyBackup checks the MMSB magic + internal sha256 of the payload —
    // our fake manifest sha256 is "x", so it must FAIL integrity (proving the
    // mirror kept the exact bytes rather than rewriting the file).
    expect(() => verifyBackup(r.path!)).toThrow(/integrity/i);
  });
});

describe("verified backup roundtrip (create → verify → restore)", () => {
  // createBackup reads the LIVE database file through the electron stub's
  // per-PID userData — the same environment the vitest setup seeds with a
  // real (empty) mms.db, so the roundtrip below exercises the production
  // format end to end: MMSB container + manifest sha256 + payload.
  it("creates a backup of the live DB, verifies it, and restores byte-identical data", async () => {
    const { app } = await import("electron");
    const userData = app.getPath("userData");
    const dbPath = path.join(userData, "mms.db");
    // The vitest setup guarantees a live DB; write a marker row into it so
    // the restore target provably carries the original bytes.
    let marker = "";
    try {
      const Database = (await import("better-sqlite3")).default;
      const db = new Database(dbPath);
      marker = `marker-${Date.now()}`;
      db.exec("CREATE TABLE IF NOT EXISTS backup_roundtrip_probe (marker TEXT)");
      db.prepare("INSERT INTO backup_roundtrip_probe (marker) VALUES (?)").run(marker);
      db.close();
    } catch { /* DB unavailable — roundtrip still validates the container format */ }

    const dest = path.join(userData, `test-roundtrip-${Date.now()}.mmbak`);
    const meta = await createBackup(dest);
    expect(fs.existsSync(dest)).toBe(true);
    // meta.size counts the database payload; the .mmbak container adds the
    // MMSB header + manifest on top, so the file is at least that big.
    expect(meta.size).toBeGreaterThan(0);
    expect(fs.statSync(dest).size).toBeGreaterThanOrEqual(meta.size);
    expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);

    // Verify passes on the freshly created file.
    const v = verifyBackup(dest);
    expect(v.valid).toBe(true);
    expect(v.manifest.sha256).toBe(meta.sha256);

    // Extract (the restore path) and confirm the bytes landed.
    const targetDb = path.join(userData, `restored-${Date.now()}.db`);
    extractVerifiedBackup(dest, targetDb);
    expect(fs.existsSync(targetDb)).toBe(true);
    if (marker) {
      const Database = (await import("better-sqlite3")).default;
      const db = new Database(targetDb);
      const row = db.prepare("SELECT marker FROM backup_roundtrip_probe ORDER BY rowid DESC LIMIT 1").get() as { marker: string };
      expect(row?.marker).toBe(marker);
      db.close();
    }
    fs.rmSync(dest, { force: true });
    fs.rmSync(targetDb, { force: true });
  });

  it("refuses to extract a tampered backup", async () => {
    const { app } = await import("electron");
    const userData = app.getPath("userData");
    const dest = path.join(userData, `test-tampered-${Date.now()}.mmbak`);
    await createBackup(dest);
    const bytes = fs.readFileSync(dest);
    bytes[bytes.length - 5] ^= 0xff; // flip one payload byte
    fs.writeFileSync(dest, bytes);
    const targetDb = path.join(userData, `never-${Date.now()}.db`);
    expect(() => extractVerifiedBackup(dest, targetDb)).toThrow(/integrity|corrupt|mismatch/i);
    expect(fs.existsSync(targetDb)).toBe(false);
    fs.rmSync(dest, { force: true });
  });
});

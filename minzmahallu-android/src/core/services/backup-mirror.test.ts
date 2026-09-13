/*
 * Backup mirroring — the second, off-app copy of every .mmbak.
 *
 * The desktop build wrote to a user-picked folder; Android writes through the
 * platform file store (an app folder on the phone, a temp folder under test).
 * The CONTRACT is unchanged and is what these tests pin down:
 *   · the copy is byte-verified before it is reported as mirrored,
 *   · only the newest N backups are kept (ordering by the ISO timestamp in the
 *     filename, falling back to the file's mtime),
 *   · every failure is soft — a missing drive or unwritable folder must never
 *     break the backup that triggered the mirror.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mirrorBackup, verifyBackup } from "./backup.service.js";
import { platform } from "../platform/index.js";
import { utf8Bytes } from "../platform/crypto.js";

let seq = 0;
const nextFolder = () => `test-mirror-${process.pid}-${Date.now()}-${seq++}`;

/** Header + manifest + payload, exactly like the real .mmbak container. */
async function makeFakeBackup(path: string, payload = "demo-payload") {
  const host = await platform();
  const body = utf8Bytes(payload);
  const manifest = utf8Bytes(JSON.stringify({ version: 1, createdAt: new Date().toISOString(), size: body.length, sha256: "x" }));
  const header = new Uint8Array(8);
  new DataView(header.buffer).setUint32(0, manifest.length, false);
  new DataView(header.buffer).setUint32(4, 0x4d4d5342, false);
  const file = new Uint8Array(header.length + manifest.length + body.length);
  file.set(header, 0);
  file.set(manifest, header.length);
  file.set(body, header.length + manifest.length);
  await host.files.write(path, file);
}

async function readMirror(folder: string): Promise<string[]> {
  const host = await platform();
  return (await host.files.list(folder)).map((file) => file.name).filter((name) => name.endsWith(".mmbak")).sort();
}

describe("backup mirror", () => {
  let dir: string;
  let mirrorDir: string;

  beforeEach(() => {
    const base = nextFolder();
    dir = `test-work/${base}`;
    mirrorDir = `${dir}/mirror`;
  });

  it("copies the backup into the mirror folder and byte-verifies it", async () => {
    const src = `${dir}/backup-auto-2026-09-05.mmbak`;
    await makeFakeBackup(src, "payload-a");
    const result = await mirrorBackup(src, mirrorDir);
    expect(result.ok).toBe(true);
    expect(result.path).toBe(`${mirrorDir}/backup-auto-2026-09-05.mmbak`);
    const host = await platform();
    expect(await host.files.read(result.path!)).toEqual(await host.files.read(src));
  });

  it("creates the mirror folder if it does not exist", async () => {
    const src = `${dir}/backup-1.mmbak`;
    await makeFakeBackup(src);
    const result = await mirrorBackup(src, `${mirrorDir}/nested/deep`);
    expect(result.ok).toBe(true);
    expect(await (await platform()).files.exists(result.path!)).toBe(true);
  });

  it("keeps only the newest N backups in the mirror (prune, filename timestamps)", async () => {
    const names = [
      "backup-auto-2026-09-01-10-00-00.mmbak",
      "backup-auto-2026-09-02-10-00-00.mmbak",
      "backup-auto-2026-09-03-10-00-00.mmbak",
      "backup-auto-2026-09-04-10-00-00.mmbak",
      "backup-auto-2026-09-05-10-00-00.mmbak",
    ];
    for (const name of names) {
      const file = `${dir}/${name}`;
      await makeFakeBackup(file, `payload-${name}`);
      expect((await mirrorBackup(file, mirrorDir, 3)).ok).toBe(true);
    }
    expect(await readMirror(mirrorDir)).toEqual([
      "backup-auto-2026-09-03-10-00-00.mmbak",
      "backup-auto-2026-09-04-10-00-00.mmbak",
      "backup-auto-2026-09-05-10-00-00.mmbak",
    ]);
  });

  it("prunes stamped names correctly even when file times are identical (burst copies)", async () => {
    const names = [
      "mms-backup-2026-09-01-09-00-00.mmbak",
      "mms-backup-2026-09-02-09-00-00.mmbak",
      "mms-backup-2026-09-03-09-00-00.mmbak",
      "mms-backup-2026-09-04-09-00-00.mmbak",
    ];
    for (const name of names) {
      await makeFakeBackup(`${dir}/${name}`, `p-${name}`);
      await mirrorBackup(`${dir}/${name}`, mirrorDir, 2);
    }
    const newest = `${dir}/mms-backup-2026-09-05-09-00-00.mmbak`;
    await makeFakeBackup(newest, "p-newest");
    expect((await mirrorBackup(newest, mirrorDir, 2)).ok).toBe(true);
    expect(await readMirror(mirrorDir)).toEqual([
      "mms-backup-2026-09-04-09-00-00.mmbak",
      "mms-backup-2026-09-05-09-00-00.mmbak",
    ]);
  });

  it("fails soft (ok:false) when the source is missing", async () => {
    const result = await mirrorBackup(`${dir}/nope.mmbak`, mirrorDir);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("fails soft when no mirror folder is configured", async () => {
    const src = `${dir}/backup-1.mmbak`;
    await makeFakeBackup(src);
    expect((await mirrorBackup(src, "")).ok).toBe(false);
  });

  it("mirrored file still passes the backup format check byte-for-byte", async () => {
    const src = `${dir}/backup-auto-x.mmbak`;
    await makeFakeBackup(src, "payload-a");
    const result = await mirrorBackup(src, mirrorDir);
    expect(result.ok).toBe(true);
    // verifyBackup checks the MMSB magic + the sha256 inside the manifest — our
    // fake manifest hash is "x", so it must FAIL integrity: proof that the
    // mirror kept the exact bytes instead of rewriting the file.
    await expect(verifyBackup(result.path!)).rejects.toThrow(/integrity/i);
  });

  it("mirrors a real, verifiable backup produced from the live database", async () => {
    // createBackup() snapshots the running database — the strongest end-to-end
    // check that the mirror is a usable backup, not just a copied file.
    const { createBackup } = await import("./backup.service.js");
    const meta = await createBackup("backup-auto-2026-09-06-10-00-00.mmbak");
    const result = await mirrorBackup(meta.file, mirrorDir, 1);
    expect(result.ok).toBe(true);
    const verified = await verifyBackup(result.path!);
    expect(verified.valid).toBe(true);
  });
});

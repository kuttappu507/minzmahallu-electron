/*
 * Whole-folder WhatsApp session snapshot — the "pairing STILL gone after
 * closing the app" and "connects then disconnects forever after a restart"
 * regression suite.
 *
 * ROOT CAUSE (still present after the creds.json.bak fix): Baileys'
 * useMultiFileAuthState writes EVERY file — creds.json, every session key,
 * every app-state-sync key — directly to its destination. app.exit(0) racing
 * an in-flight write (or a hard kill / power cut) leaves a TRUNCATED key
 * file behind even when creds.json survives intact. The old recovery healed
 * only creds.json, so the poisoned key file killed every later handshake:
 * either a 401/403 ("pairing lost") or an endless connect → disconnect
 * loop. Restoring creds ALONE could additionally pair old credentials with
 * newer keys — an inconsistent state that loops too.
 *
 * The fix has three layers, all exercised here with the real file logic:
 *   1. atomic writes (temp + rename) so a torn file can never be READ,
 *   2. a whole-folder snapshot (auth.good) captured after every server-
 *      accepted session — creds and keys, one consistent state,
 *   3. start-up healing: any torn JSON anywhere in the folder restores the
 *      WHOLE folder from that snapshot before the engine ever sees it.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  hasPersistedSession, flushAuthWrites, setAuthDirForTests,
  snapshotAuthNow, drainAuthWrites, atomicAuthStateForTests,
} from "./whatsapp-engine.service.js";

// What Baileys writes after a QR pairing (see the persistence suite).
const QR_PAIRED_CREDS = {
  noiseKey: { private: "AAA", public: "BBB" },
  signedIdentityKey: { private: "CCC", public: "DDD" },
  signedPreKey: { keyPair: { private: "EEE", public: "FFF" }, signature: "GGG", keyId: 1 },
  registrationId: 123,
  advSecretKey: "adv-secret",
  nextPreKeyId: 31,
  firstUnuploadedPreKeyId: 31,
  serverHasPreKeys: true,
  account: { details: "CAE", accountSignatureKey: "sig", accountSignature: "sig2", deviceSignature: "dev" },
  me: { id: "919876543210:12@s.whatsapp.net", name: "Mahallu Office", lid: "1234@lid" },
  signalIdentities: [{ identifier: { name: "919876500000:0@lid", deviceId: 0 }, identifierKey: "key" }],
  platform: "android",
  registered: false,
};

let root = "";
let dir = "";
let good = "";

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

/** Build a believable paired session folder. */
function seedPairedFolder(target: string, creds = QR_PAIRED_CREDS): void {
  writeJson(path.join(target, "creds.json"), creds);
  writeJson(path.join(target, "pre-key-30.json"), { keyId: 30, keyPair: { private: "pk", public: "PK" } });
  writeJson(path.join(target, "pre-key-31.json"), { keyId: 31, keyPair: { private: "pk31", public: "PK31" } });
  writeJson(path.join(target, "session-919876500000_42_0.json"), { _sessions: { abc: { registrationId: 1 } } });
  writeJson(path.join(target, "app-state-sync-key-AAAA.json"), { keyData: "a2V5", fingerprint: {} });
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "mms-wa-snap-"));
  dir = path.join(root, "auth");
  good = `${dir}.good`;
  fs.mkdirSync(dir, { recursive: true });
  setAuthDirForTests(dir);
});

afterEach(() => {
  setAuthDirForTests(undefined);
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("snapshotAuthNow — building the verified whole-folder snapshot", () => {
  it("snapshots a paired folder (creds + keys together)", () => {
    seedPairedFolder(dir);
    expect(snapshotAuthNow()).toBe(true);
    expect(fs.existsSync(path.join(good, "creds.json"))).toBe(true);
    expect(fs.existsSync(path.join(good, "pre-key-30.json"))).toBe(true);
    expect(fs.existsSync(path.join(good, "app-state-sync-key-AAAA.json"))).toBe(true);
    // No temp detritus of the copy process itself may remain.
    expect(fs.readdirSync(root).filter((n) => n.includes(".tmp-"))).toEqual([]);
  });

  it("refuses to snapshot an UNPAIRED folder (a half pairing must never become the restore point)", () => {
    writeJson(path.join(dir, "creds.json"), { registrationId: 9, advSecretKey: "x", registered: false });
    expect(snapshotAuthNow()).toBe(false);
    expect(fs.existsSync(good)).toBe(false);
  });
});

describe("start-up healing from the snapshot", () => {
  it("heals a TORN KEY FILE by restoring the whole folder — the restart class the creds.bak fix could not cover", () => {
    seedPairedFolder(dir);
    expect(snapshotAuthNow()).toBe(true);

    // A kill mid-write tears a key file while creds.json stays perfect.
    fs.writeFileSync(path.join(dir, "session-919876500000_42_0.json"), '{"_sessions":{"abc":{"regist');

    expect(hasPersistedSession()).toBe(true);
    const healed = JSON.parse(fs.readFileSync(path.join(dir, "session-919876500000_42_0.json"), "utf-8"));
    expect(healed._sessions.abc.registrationId).toBe(1);
    // Repeated polls stay healthy — the folder is consistent again.
    expect(hasPersistedSession()).toBe(true);
  });

  it("restores creds.json from the snapshot when it went missing (and removes files the snapshot never had)", () => {
    seedPairedFolder(dir);
    expect(snapshotAuthNow()).toBe(true);

    fs.rmSync(path.join(dir, "creds.json"));
    // A stray newer key file must not survive side by side with the
    // restored (older, consistent) state.
    writeJson(path.join(dir, "session-stranger.json"), { _sessions: { x: 1 } });

    expect(hasPersistedSession()).toBe(true);
    expect(fs.existsSync(path.join(dir, "creds.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "session-stranger.json"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "pre-key-30.json"))).toBe(true);
  });

  it("still heals a torn creds.json via creds.json.bak on installs with NO snapshot (pre-snapshot fallback)", () => {
    seedPairedFolder(dir);
    fs.writeFileSync(path.join(dir, "creds.json"), '{"registrationId":123,"advSe');
    writeJson(path.join(dir, "creds.json.bak"), QR_PAIRED_CREDS);

    expect(hasPersistedSession()).toBe(true);
    const healed = JSON.parse(fs.readFileSync(path.join(dir, "creds.json"), "utf-8"));
    expect(healed.me.id).toBe(QR_PAIRED_CREDS.me.id);
  });

  it("ignores stray temp files (a kill mid-write leaves only those behind)", () => {
    seedPairedFolder(dir);
    fs.writeFileSync(path.join(dir, "pre-key-32.json.tmp-1-7"), '{"partial"');

    expect(hasPersistedSession()).toBe(true);
    // …and the sweep removed the stray temp, so it never confuses reads.
    expect(fs.readdirSync(dir).filter((n) => n.includes(".tmp-"))).toEqual([]);
  });
});

describe("atomic auth state — writes a reader can trust", () => {
  it("round-trips a FileSignalCredential through the store (byte-compatible with Baileys' encoding)", async () => {
    const store = await atomicAuthStateForTests(dir);
    await store.state.keys.set({ "pre-key": { "7": { keyId: 7, keyPair: { private: Buffer.from([1, 2, 3]), public: Buffer.from([4, 5]) } } } });
    const back = await store.state.keys.get("pre-key", ["7"]);
    expect(back["7"].keyId).toBe(7);
    // BufferJSON survives: private came back as a Buffer, not a plain object.
    expect(Buffer.isBuffer(back["7"].keyPair.private)).toBe(true);
    // No temp files leaked into the folder.
    expect(fs.readdirSync(dir).filter((n) => n.includes(".tmp-"))).toEqual([]);
  });

  it("nulls missing files exactly like Baileys' readData", async () => {
    const store = await atomicAuthStateForTests(dir);
    const back = await store.state.keys.get("session", ["nobody"]);
    expect(back.nobody).toBeNull();
  });

  it("drainAuthWrites settles with nothing pending", async () => {
    const started = Date.now();
    await drainAuthWrites(400);
    expect(Date.now() - started).toBeGreaterThanOrEqual(100); // the settle beat
  });
});

describe("flushAuthWrites with a verified snapshot", () => {
  it("confirms pairing and leaves both backups on disk", async () => {
    seedPairedFolder(dir);
    expect(await flushAuthWrites(1000)).toBe(true);
    expect(fs.existsSync(path.join(dir, "creds.json.bak"))).toBe(true);
    expect(snapshotAuthNow()).toBe(true);
  });
});

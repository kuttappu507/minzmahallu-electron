/*
 * WhatsApp session persistence — the "pair once, scan again after closing the
 * app" regression suite.
 *
 * ROOT CAUSE (v2.4.0 and earlier): every persistence check keyed off
 * `creds.registered === true`. Baileys 7 sets that flag ONLY on the
 * phone-number (link-code) pairing path — a QR-scan pairing fills `me` +
 * `account` + `signalIdentities` through configureSuccessfulPairing() and
 * leaves `registered` false forever. So for a QR pairing:
 *   · creds.json.bak was never written (the backup required the same flag),
 *   · hasPersistedSession() answered "no session" and then WIPED the whole
 *     auth folder — on the very first status poll after a restart,
 *   · flushAuthWrites() spun its full deadline on every quit.
 * The user paired, closed the app, and had to scan a new QR every time.
 *
 * These tests run the real file logic against a temp auth folder (the engine
 * exposes setAuthDirForTests because plain Node has no Electron userData).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isPairedCreds, hasPersistedSession, flushAuthWrites, setAuthDirForTests,
} from "./whatsapp-engine.service.js";

// What Baileys writes after a QR pairing: configureSuccessfulPairing() emits
// { account, me, signalIdentities, platform } and `registered` stays false.
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

// What Baileys writes the moment requestPairingCode() is called — `me` is set
// BEFORE the phone accepts the code, so this must NOT count as paired.
const LINK_CODE_REQUESTED_CREDS = {
  registrationId: 1,
  advSecretKey: "adv",
  me: { id: "919876500000@s.whatsapp.net", name: "~" },
  pairingCode: "ABCD1234",
  registered: false,
};

// A brand-new, never-paired folder (initAuthCreds()).
const FRESH_CREDS = { registrationId: 7, advSecretKey: "adv", nextPreKeyId: 1, registered: false };

// The engine RETIRES a rejected session folder as "<auth>-retired-<stamp>"
// next to it (recoverable instead of deleted), so the tests live in a wrapper
// directory that cleanup can remove whole.
let root = "";
let dir = "";

function writeCreds(creds: unknown, file = "creds.json"): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), JSON.stringify(creds));
}

function retiredFolders(): string[] {
  try { return fs.readdirSync(root).filter((n) => n.startsWith("auth-retired-")); } catch { return []; }
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "mms-wa-"));
  dir = path.join(root, "auth");
  fs.mkdirSync(dir, { recursive: true });
  setAuthDirForTests(dir);
});

afterEach(() => {
  setAuthDirForTests(undefined);
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("isPairedCreds — what counts as a completed pairing", () => {
  it("accepts a QR pairing (registered stays false in Baileys 7)", () => {
    expect(isPairedCreds(QR_PAIRED_CREDS)).toBe(true);
  });

  it("accepts a phone-number (link-code) pairing", () => {
    expect(isPairedCreds({ ...LINK_CODE_REQUESTED_CREDS, registered: true })).toBe(true);
  });

  it("rejects a half-finished link-code request (me alone is not a pairing)", () => {
    expect(isPairedCreds(LINK_CODE_REQUESTED_CREDS)).toBe(false);
  });

  it("rejects fresh and malformed creds", () => {
    expect(isPairedCreds(FRESH_CREDS)).toBe(false);
    expect(isPairedCreds(null)).toBe(false);
    expect(isPairedCreds(undefined)).toBe(false);
    expect(isPairedCreds("creds")).toBe(false);
    expect(isPairedCreds({ signalIdentities: [] })).toBe(false);
  });
});

describe("a QR pairing SURVIVES an app restart", () => {
  it("reports the persisted session without wiping anything", () => {
    writeCreds(QR_PAIRED_CREDS);
    // Signal keys live beside creds.json — they must survive too, or the
    // server rejects the resumed session with 401.
    fs.writeFileSync(path.join(dir, "pre-key-30.json"), JSON.stringify({ keyId: 30 }));
    fs.writeFileSync(path.join(dir, "sender-key-abc.json"), JSON.stringify({ k: 1 }));

    expect(hasPersistedSession()).toBe(true);
    expect(fs.existsSync(path.join(dir, "creds.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "pre-key-30.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "sender-key-abc.json"))).toBe(true);
  });

  it("keeps reporting the same session on every repeated check (status polls)", () => {
    writeCreds(QR_PAIRED_CREDS);
    // The WhatsApp page polls status() every 6 s and each poll asks this
    // question — one "no" used to delete the session for good.
    for (let i = 0; i < 5; i++) expect(hasPersistedSession()).toBe(true);
    expect(fs.existsSync(path.join(dir, "creds.json"))).toBe(true);
  });

  it("restores a paired backup when the live creds.json was truncated by a hard exit", () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "creds.json"), '{"registrationId":123,"advSe'); // torn write
    fs.writeFileSync(path.join(dir, "creds.json.bak"), JSON.stringify(QR_PAIRED_CREDS));
    fs.writeFileSync(path.join(dir, "pre-key-30.json"), JSON.stringify({ keyId: 30 }));

    expect(hasPersistedSession()).toBe(true);
    const healed = JSON.parse(fs.readFileSync(path.join(dir, "creds.json"), "utf-8"));
    expect(healed.me.id).toBe(QR_PAIRED_CREDS.me.id);
    expect(fs.existsSync(path.join(dir, "pre-key-30.json"))).toBe(true);
  });

  it("restores a paired backup when creds.json is missing entirely", () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "creds.json.bak"), JSON.stringify(QR_PAIRED_CREDS));

    expect(hasPersistedSession()).toBe(true);
    expect(fs.existsSync(path.join(dir, "creds.json"))).toBe(true);
  });

  it("quit-time flush confirms a paired session immediately (no 5 s stall)", async () => {
    writeCreds(QR_PAIRED_CREDS);
    const started = Date.now();
    expect(await flushAuthWrites(3000)).toBe(true);
    expect(Date.now() - started).toBeLessThan(1500);
    // The flush also refreshes the atomic backup for the next start.
    expect(fs.existsSync(path.join(dir, "creds.json.bak"))).toBe(true);
  });
});

describe("an UNPAIRED folder is still cleaned up, and never stalls the exit", () => {
  it("retires leftovers from an aborted pairing (recoverable, never retried)", () => {
    writeCreds(LINK_CODE_REQUESTED_CREDS);
    fs.writeFileSync(path.join(dir, "pre-key-1.json"), JSON.stringify({ keyId: 1 }));

    expect(hasPersistedSession()).toBe(false);
    // The doomed handshake must not be retried on the next start…
    expect(fs.existsSync(path.join(dir, "creds.json"))).toBe(false);
    // …but a heuristic "not paired" verdict must never DESTROY credentials:
    // they are moved aside, so support can put them back if it was wrong.
    expect(retiredFolders().length).toBe(1);
    expect(fs.existsSync(path.join(root, retiredFolders()[0], "creds.json"))).toBe(true);
    // Repeated checks do not pile up retired folders.
    expect(hasPersistedSession()).toBe(false);
    expect(retiredFolders().length).toBe(1);
  });

  it("retires fresh (never paired) credentials", () => {
    writeCreds(FRESH_CREDS);
    expect(hasPersistedSession()).toBe(false);
    expect(fs.existsSync(path.join(dir, "creds.json"))).toBe(false);
    expect(retiredFolders().length).toBe(1);
  });

  it("does not restore an UNPAIRED backup over the live file", () => {
    writeCreds(FRESH_CREDS);
    fs.writeFileSync(path.join(dir, "creds.json.bak"), JSON.stringify(LINK_CODE_REQUESTED_CREDS));
    expect(hasPersistedSession()).toBe(false);
  });

  it("flush returns at once when there is no pairing to protect", async () => {
    const started = Date.now();
    expect(await flushAuthWrites(3000)).toBe(false);
    expect(Date.now() - started).toBeLessThan(600);
  });
});

describe("no Electron auth folder (plain Node)", () => {
  it("answers 'no session' instead of throwing", () => {
    setAuthDirForTests(null);
    expect(hasPersistedSession()).toBe(false);
  });
});

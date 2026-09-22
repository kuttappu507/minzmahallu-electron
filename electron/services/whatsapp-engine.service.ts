// WhatsApp engine — in-process WhatsApp Web session via Baileys.
//
// Replaces the previously bundled WAHA gateway (a separate Node service with
// its own port, health checks and a browser-driven WhatsApp Web client that
// inflated the installer by hundreds of MB and introduced a whole class of
// spawn/ESM/firewall failures on end-user machines).
//
// Baileys speaks the WhatsApp Web "multi-device" protocol directly over a
// WebSocket — no browser, no child process, no local HTTP port. The session
// persists in <userData>/whatsapp/auth so one QR pairing survives restarts,
// and the socket reconnects automatically with backoff when the network drops.
//
// All Electron APIs are resolved lazily so importing this module from plain
// Node (vitest) is side-effect free.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import QRCode from "qrcode";
import {
  makeWASocket,
  makeCacheableSignalKeyStore,
  fetchLatestWaWebVersion,
  DisconnectReason,
  Browsers,
  proto,
  initAuthCreds,
  BufferJSON,
} from "@whiskeysockets/baileys";
import type { WASocket, ConnectionState } from "@whiskeysockets/baileys";

const require = createRequire(import.meta.url);
function electron(): typeof import("electron") {
  return require("electron");
}

export type EngineState = "IDLE" | "CONNECTING" | "QR_REQUIRED" | "CONNECTED" | "RECONNECTING";

// Auto-(re)start guard: how long a failed automatic attempt blocks the next
// one. The UI polls status() every 6s — without this a persistently offline
// machine would retry the handshake forever.
const AUTO_START_BACKOFF_MS = 60_000;
// Cap for the reconnect backoff ladder (1s → 2s → 4s → … → 30s).
const MAX_RECONNECT_DELAY_MS = 30_000;

const silentLogger: any = {
  level: "silent",
  child() { return silentLogger; },
  trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {},
};

let sock: WASocket | null = null;
let state: EngineState = "IDLE";
let lastError = "";
let stateSince = Date.now();
let qrDataUrl = "";
let me: { number: string; name: string } | null = null;
let intentionalStop = false;
let startPromise: Promise<void> | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
let lastAutoAttempt = 0;
// One-shot guard for the loggedOut recovery: a truncated/rotated key file can
// present as "logged out" even though the phone still lists the device. We
// retry ONCE with the verified creds.json.bak before declaring the pairing
// dead and wiping it. Reset on every successful connection.open.
let loggedOutRetryUsed = false;
// Latest credential saver handed to us by useMultiFileAuthState. Quit calls it
// once more and AWAITS it — Baileys otherwise writes creds asynchronously and
// a hard exit can drop a pending key rotation, which the next start then reads
// as stale keys -> server 401 -> "session gone after closing" (user report).
let credsSaver: (() => Promise<void>) | null = null;
// The LIVE creds object of the current socket (Baileys merges every
// creds.update into it). Used to stamp the "pairing completed" marker that
// Baileys only writes on the link-code path — see markPairedOnDisk().
let liveCreds: any = null;
// Stale-session loop guard (user report: after closing and reopening the app,
// WhatsApp "tries to connect, disconnects, tries again" forever). A session
// the server no longer accepts does not always close with 401/403 — it can
// also surface as a bare connectionClosed/restartRequired. Guard: while the
// PAIRED session has NEVER reached `open` in this app run, count consecutive
// server-side closes; a healthy session opens on the 1st–2nd attempt, so
// after 4 we retire the session and ask for a fresh QR instead of looping.
// Fresh QR pairings are exempt — their creds are not paired-on-disk yet.
const MAX_CLOSES_WITHOUT_OPEN = 4;
let sessionProven = false;      // this persisted session reached `open` at least once this run
let closesWithoutOpen = 0;
// One-shot guard for the whole-folder snapshot retry (separate from the
// creds-only retry): a stale session that fails to open repeatedly gets ONE
// reconnect with the last server-accepted folder before it is retired.
let snapshotRetryUsed = false;
// Flap detector (user report: "after restart it connects and disconnects
// over and over"). A session the server drops WITHIN SECONDS of every open —
// stream errors, a conflicting second client using the same pairing,
// app-state-sync mismatches — would otherwise flip the UI between
// connected/disconnected forever (auto-reconnect caps at 30 s). Consecutive
// SHORT-LIVED sessions are counted; a session that stays up for 90 s+ clears
// the counter. After 5 short sessions in a row the engine STOPS
// auto-reconnecting and holds a stable, explained "needs attention" state —
// a manual Connect still retries. Going silent was judged worse than asking.
const FLAP_WINDOW_MS = 15_000;
const FLAP_HEAL_MS = 90_000;
const MAX_FLAPS = 5;
let openedAt = 0;
let shortCycles = 0;
let flapHalted = false;

// ---------------------------------------------------------------------------
// Delivery tracking — the privacy lock needs to know the moment a message
// ACTUALLY reached the recipient's phone. WhatsApp reports this as a receipt
// status on the message (DELIVERY_ACK = 3, READ = 4, PLAYED = 5); Baileys
// surfaces them as `messages.update` events. We keep the best status seen
// per message id so a send can wait for it (fast path) and LATE receipts
// (recipient's phone was offline for hours) still land via the listener.
// ---------------------------------------------------------------------------
export type DeliveryEvent = (msgId: string) => void;
const DELIVERED = proto.WebMessageInfo.Status.DELIVERY_ACK;
const deliveryStatus = new Map<string, number>();
const deliveryListeners = new Set<DeliveryEvent>();

function noteMessageStatus(msgId: string, status: number): void {
  if (!msgId || !Number.isFinite(status) || status <= 0) return;
  const prev = deliveryStatus.get(msgId) || 0;
  if (status <= prev) return;
  deliveryStatus.set(msgId, status);
  // Bound the map: every message the app sends used to be remembered for the
  // life of the process. 5 000 ids of headroom is far beyond any send the
  // delivery logic might still wait for, and eviction only forgets the
  // OLDEST entries (already confirmed or long past their wait window).
  if (deliveryStatus.size > 5000) {
    const excess = deliveryStatus.size - 5000;
    let dropped = 0;
    for (const key of deliveryStatus.keys()) {
      deliveryStatus.delete(key);
      if (++dropped >= excess) break;
    }
  }
  if (status >= DELIVERED) {
    for (const cb of deliveryListeners) {
      try { cb(msgId); } catch { /* listener errors never break the socket */ }
    }
  }
}

/** Subscribe to delivery confirmations (fires once per message id). */
export function onDelivery(cb: DeliveryEvent): () => void {
  deliveryListeners.add(cb);
  return () => { deliveryListeners.delete(cb); };
}

/** True when the recipient's phone has confirmed receiving `msgId`. */
export function isDelivered(msgId: string): boolean {
  return !!msgId && (deliveryStatus.get(msgId) || 0) >= DELIVERED;
}

/** Resolve once `msgId` is confirmed delivered — or `false` after the
 *  timeout. The status map survives across sockets, so a re-connecting
 *  session can still confirm a send that happened minutes ago. */
export function waitForDelivery(msgId: string, timeoutMs: number): Promise<boolean> {
  if (!msgId) return Promise.resolve(false);
  if (isDelivered(msgId)) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (v: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      off();
      resolve(v);
    };
    const off = onDelivery((id) => { if (id === msgId) finish(true); });
    const timer = setTimeout(() => finish(isDelivered(msgId)), Math.max(0, timeoutMs));
  });
}

function userDataDir(): string | null {
  try { return electron().app.getPath("userData"); } catch { return null; }
}
/** <userData>/whatsapp — home of the auth session AND the send-throttle
 *  counters. Exported for the throttle's persisted anti-ban counters. */
export function whatsappStoreDir(): string | null {
  const base = userDataDir();
  return base ? path.join(base, "whatsapp") : null;
}
// Test seam — vitest runs OUTSIDE Electron, where app.getPath("userData")
// throws and no auth folder can be resolved at all. Tests point the engine at
// a temp directory so the real persistence + recovery logic (paired-session
// detection, backup restore, aborted-pairing cleanup) is exercised as it runs
// in the app. `undefined` = no override (normal Electron resolution).
let authDirOverride: string | null | undefined;
export function setAuthDirForTests(dir: string | null | undefined): void {
  authDirOverride = dir;
}
function authDir(): string | null {
  if (authDirOverride !== undefined) return authDirOverride;
  const base = userDataDir();
  return base ? path.join(base, "whatsapp", "auth") : null;
}

// ---------------------------------------------------------------------------
// Atomic file auth state — a drop-in replacement for Baileys'
// useMultiFileAuthState with the one weakness removed that kept costing users
// their pairing (user reports: "connection is gone after closing the app",
// "after restart it connects and disconnects forever"):
//
//   Baileys writes EVERY file DIRECTLY to its destination with plain
//   fs.writeFile — creds.json, every session key and every app-state-sync
//   key. A kill / BSOD / power cut mid-write (or app.exit(0) racing the
//   writes that Baileys still has in flight at quit) leaves a TRUNCATED file
//   behind. The old recovery only healed creds.json via creds.json.bak; a
//   torn KEY file survived and poisoned every later handshake — either
//   answered with 401/403 ("pairing lost") or, worse, with endless
//   connect → disconnect loops. Rolling creds.json back from the backup
//   without the keys ALSO creates an inconsistent auth state, which is
//   another connect/disconnect class on its own.
//
// Here every write is unique temp file + atomic rename, so a reader never
// sees a half-written file (a kill mid-write only leaves a stray *.tmp-*
// behind, which is swept on start). Reads stay byte-compatible with what
// Baileys wrote (same BufferJSON encoding), so existing installs adopt this
// transparently.
// ---------------------------------------------------------------------------
let authWriteSeq = 0;
// Serializes ALL pending auth-file writes so "is everything on disk yet?"
// has one answer — the quit drain awaits exactly this.
let pendingAuthWrites: Promise<unknown> = Promise.resolve();

/** Track an auth write through the shared pending-writes chain (used by the
 *  quit drain; individual writes are sync + atomic, so this only measures
 *  whether Baileys' async call sites have REACHED us yet). */
function trackAuthWrite<T>(p: Promise<T> | undefined): Promise<T> | undefined {
  if (!p || typeof (p as any).then !== "function") return p;
  const tracked = p.catch((err) => { throw err; });
  pendingAuthWrites = pendingAuthWrites.then(() => tracked, () => tracked).then(() => undefined, () => undefined);
  return tracked;
}

/** Settle once every auth write ISSUED SO FAR has completed. Baileys queues
 *  some writes asynchronously, so the quit path also allows a short settle. */
export async function drainAuthWrites(timeoutMs = 2500): Promise<void> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  for (;;) {
    try {
      await Promise.race([
        pendingAuthWrites,
        new Promise((resolve) => setTimeout(resolve, Math.min(300, Math.max(0, deadline - Date.now())))),
      ]);
      // Wait one beat: a write that Baileys queued but has not REACHED the
      // atomic layer yet appears after its internal awaits settle.
      await new Promise((resolve) => setTimeout(resolve, 120));
      // pendingAuthWrites is a continuously-replaced chain; if nothing new
      // arrived during the settle, everything is on disk.
      const snapshot = pendingAuthWrites;
      await Promise.resolve();
      if (snapshot === pendingAuthWrites) return;
    } catch { /* write errors are surfaced by Baileys; the drain never throws */ }
    if (Date.now() >= deadline) return;
  }
}

/** JSON.parse tolerant reader identical in encoding to Baileys' readData. */
function readAuthJson(file: string): any | null {
  try { return JSON.parse(fs.readFileSync(file, "utf-8"), BufferJSON.reviver as any); } catch { return null; }
}

/** The same file-name escaping Baileys applies (sends/keys contain ':' and '/'). */
function fixAuthFileName(file: string): string {
  return file.replace(/\//g, "__").replace(/:/g, "-");
}

interface AtomicAuthState {
  state: {
    creds: any;
    keys: {
      get: (type: string, ids: string[]) => Promise<Record<string, any>>;
      set: (data: any) => Promise<void>;
    };
  };
  saveCreds: () => Promise<void>;
}

/** Atomic, quit-safe replacement for Baileys' useMultiFileAuthState. */
async function useAtomicMultiFileAuthState(folder: string): Promise<AtomicAuthState> {
  fs.mkdirSync(folder, { recursive: true });
  sweepStrayTempFiles(folder);
  const writeData = async (data: any, file: string): Promise<void> => {
    const filePath = path.join(folder, fixAuthFileName(file));
    const raw = JSON.stringify(data, BufferJSON.replacer as any);
    const tmp = `${filePath}.tmp-${process.pid}-${authWriteSeq++}`;
    // Sync writes keep ordering trivial and make "pending" measurable: once
    // our promise resolves, the bytes are on disk. Files are a few KB at
    // most, so blocking the loop costs <1 ms each.
    try { fs.writeFileSync(tmp, raw); } catch { return; }
    try { fs.renameSync(tmp, filePath); return; } catch { /* Windows lock (AV/indexer): fall through */ }
    try { fs.copyFileSync(tmp, filePath); } catch { /* best effort */ }
    try { fs.rmSync(tmp, { force: true }); } catch { /* stray temp is swept later */ }
  };
  const removeData = async (file: string): Promise<void> => {
    try { fs.rmSync(path.join(folder, fixAuthFileName(file)), { force: true }); } catch { /* best effort */ }
  };
  const readData = async (file: string): Promise<any | null> => {
    return readAuthJson(path.join(folder, fixAuthFileName(file)));
  };
  const creds = (await readData("creds.json")) || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: Record<string, any> = {};
          await Promise.all(ids.map(async (id) => {
            let value = await readData(`${type}-${id}.json`);
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }));
          return data;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const category of Object.keys(data || {})) {
            for (const id of Object.keys(data[category] || {})) {
              const value = data[category][id];
              const file = `${category}-${id}.json`;
              const task = value ? writeData(value, file) : removeData(file);
              tasks.push(trackAuthWrite(task)!);
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await trackAuthWrite(writeData(creds, "creds.json"));
    },
  };
}

/** Test seam — drives the atomic auth store from plain Node (vitest). */
export { useAtomicMultiFileAuthState as atomicAuthStateForTests };

/** A kill mid-write only leaves a stray `*.tmp-*` behind; sweep them so they
 *  never confuse the (name-based) integrity check below. */
function sweepStrayTempFiles(dir: string): void {
  try {
    for (const name of fs.readdirSync(dir)) {
      if (name.includes(".tmp-")) {
        try { fs.rmSync(path.join(dir, name), { force: true }); } catch { /* best effort */ }
      }
    }
  } catch { /* folder may not exist yet */ }
}

function setState(next: EngineState, error = "") {
  state = next;
  stateSince = Date.now();
  if (error !== undefined && error !== "") lastError = error;
  else if (error === "") lastError = "";
}

/** Does this creds object describe a COMPLETED pairing?
 *
 *  Baileys 7 sets `registered: true` ONLY on the phone-number (link-code)
 *  pairing path — see Socket/messages-recv.js. A QR-scan pairing goes through
 *  `configureSuccessfulPairing()`, which fills `me` + `account` +
 *  `signalIdentities` + `platform` and leaves `registered` FALSE forever.
 *  Answering "is a session persisted?" from `registered` alone therefore
 *  classified every QR pairing as an aborted one and WIPED the auth folder on
 *  the next start — the exact user report ("pair once, it is gone after
 *  closing the app, I have to scan again").
 *
 *  `me` alone is NOT sufficient either: `requestPairingCode()` writes `me`
 *  before the phone ever accepts the code, so a half-finished link-code
 *  attempt must still count as unpaired. */
export function isPairedCreds(creds: any): boolean {
  if (!creds || typeof creds !== "object") return false;
  if (creds.registered === true) return true;
  // QR pairing: the signed device identity from the phone.
  if (creds.account && typeof creds.account === "object") return true;
  // QR pairing: the primary device's signal identity.
  const ids = creds.signalIdentities;
  if (Array.isArray(ids) && ids.length > 0) return true;
  return false;
}

/** Read + parse a creds-shaped JSON file. Null when absent/unreadable. */
function readCredsFile(file: string): any | null {
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return null; }
}

/** Write JSON the safe way: temp file + atomic rename, so a kill/BSOD
 *  mid-write can never leave a half-written file at the destination. */
function atomicWriteJson(file: string, raw: string): boolean {
  try {
    const tmp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, raw);
    fs.renameSync(tmp, file);
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Whole-folder session snapshot — the consistent backup.
//
// creds.json and the ~50–300 key files around it are ONE state: they have to
// move together. Restoring JUST creds.json from creds.json.bak (the previous
// recovery) can pair old credentials with newer keys, an inconsistency that
// itself surfaces as "reconnects then drops right away". So in addition to
// the per-file backup, every server-accepted session is snapshotted as a
// whole folder (auth.good) — and every start VALIDATES the live folder
// (every .json must parse, and creds.json must still describe a completed
// pairing). Any torn file heals the whole folder from the snapshot: the
// exact, consistent state the server last accepted.
// ---------------------------------------------------------------------------
function snapshotDir(): string | null {
  const dir = authDir();
  return dir ? `${dir}.good` : null;
}

/** Every .json file the ENGINE reads parses as JSON (torn writes => false).
 *  `.json.bak` is skipped deliberately: it is OUR recovery artifact, never
 *  engine data — a torn backup next to a healthy creds.json must not keep
 *  failing the integrity check on every status poll (the next backupCreds
 *  rewrite heals it atomically anyway). */
function authFolderIsIntact(dir: string): boolean {
  try {
    for (const name of fs.readdirSync(dir)) {
      if (name.includes(".tmp-")) continue;
      if (!name.endsWith(".json")) continue;
      if (JSON.parse(fs.readFileSync(path.join(dir, name), "utf-8")) === undefined) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function authFolderIntactForTests(dir: string): boolean {
  return authFolderIsIntact(dir);
}

/** Copy the auth folder to `auth.good` (via a temp folder + rename so a kill
 *  mid-snapshot can never half-replace a good one). Only paired creds are
 *  snapshotted. */
function snapshotAuthDir(reason = ""): boolean {
  const dir = authDir();
  const good = snapshotDir();
  if (!dir || !good) return false;
  try {
    if (!fs.existsSync(path.join(dir, "creds.json"))) return false;
    const creds = readCredsFile(path.join(dir, "creds.json"));
    if (!isPairedCreds(creds)) return false; // never snapshot a half pairing
    const tmp = `${good}.tmp-${process.pid}`;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
    fs.mkdirSync(tmp, { recursive: true });
    for (const name of fs.readdirSync(dir)) {
      if (name.includes(".tmp-")) continue;
      const src = path.join(dir, name);
      try { if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(tmp, name)); } catch { /* skip locked file */ }
    }
    try { fs.rmSync(good, { recursive: true, force: true }); } catch { /* best effort */ }
    fs.renameSync(tmp, good);
    if (reason) console.log(`[whatsapp] WhatsApp session snapshot refreshed (${reason})`);
    return true;
  } catch (err: any) {
    console.warn("[whatsapp] Could not snapshot the session folder:", err?.message || err);
    return false;
  }
}

// Debounce: a fresh pairing triggers dozens of creds/key writes in a burst;
// one snapshot shortly after the flood settles is enough.
let snapshotTimer: NodeJS.Timeout | null = null;
function scheduleAuthSnapshot(delayMs = 2500, reason = ""): void {
  if (snapshotTimer) clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(() => {
    snapshotTimer = null;
    snapshotAuthDir(reason);
  }, delayMs);
  if (typeof (snapshotTimer as any).unref === "function") (snapshotTimer as any).unref();
}

/** Restore the whole auth folder from the last server-accepted snapshot.
 *  Live creds must not be OVERWRITTEN while a socket is mid-pairing. */
function restoreSessionSnapshot(why: string): boolean {
  const dir = authDir();
  const good = snapshotDir();
  if (!dir || !good) return false;
  try {
    if (!fs.existsSync(good)) return false;
    const creds = readCredsFile(path.join(good, "creds.json"));
    if (!isPairedCreds(creds)) return false;
    const files = fs.readdirSync(good).filter((n) => !n.includes(".tmp-"));
    if (!files.includes("creds.json")) return false;
    fs.mkdirSync(dir, { recursive: true });
    // Remove live key files that the snapshot does not have — a mix of
    // leftover files and restored files is the inconsistency we are fixing.
    for (const name of fs.readdirSync(dir)) {
      if (!files.includes(name)) {
        try { fs.rmSync(path.join(dir, name), { force: true }); } catch { /* best effort */ }
      }
    }
    for (const name of files) {
      try { fs.copyFileSync(path.join(good, name), path.join(dir, name)); } catch { /* locked file — keep live copy */ }
    }
    integrityMemo.set(dir, true);
    console.log(`[whatsapp] Restored the WhatsApp session from the verified snapshot${why ? ` (${why})` : ""}`);
    return true;
  } catch {
    return false;
  }
}

/** Restore creds.json from the verified backup (creds.json.bak). Returns
 *  true when a complete, PAIRED backup was copied over the live file. */
function restoreBackupCreds(): boolean {
  const dir = authDir();
  if (!dir) return false;
  const bak = path.join(dir, "creds.json.bak");
  if (!fs.existsSync(bak)) return false;
  const creds = readCredsFile(bak);
  if (!isPairedCreds(creds)) return false;
  // Copy through a temp file so the live creds.json is never half-written.
  let raw = "";
  try { raw = fs.readFileSync(bak, "utf-8"); } catch { return false; }
  const ok = atomicWriteJson(path.join(dir, "creds.json"), raw);
  if (ok) console.log("[whatsapp] Restored WhatsApp session from creds.json.bak");
  return ok;
}

// Folder integrity is checked ONCE per app run per folder: with atomic
// writes a live folder cannot tear itself mid-run, so corruption is a
// start-of-day finding (previous shutdown truncation / tampering). Re-parsing
// every file on every 6-second status poll would stall the main process for
// nothing (heavy users accumulate hundreds of session files).
const integrityMemo = new Map<string, boolean>();
function liveAuthFolderIntact(dir: string): boolean {
  if (!fs.existsSync(dir)) return true; // nothing to corrupt
  const memo = integrityMemo.get(dir);
  if (memo === true) return true;
  // Stray temp leftovers from killed writes are swept once per run: readers
  // and snapshot copies ignore them anyway, but they should not pile up.
  sweepStrayTempFiles(dir);
  const ok = authFolderIsIntact(dir);
  if (ok) integrityMemo.set(dir, true);
  return ok;
}

/** A paired session's credentials exist AND the pairing completed on disk.
 * Leftovers from an ABORTED pairing (creds.json written before the QR was
 * scanned) are wiped so the next start doesn't run a doomed handshake that
 * the server answers with 401 — the "logged out after close" class. */
export function hasPersistedSession(): boolean {
  const dir = authDir();
  if (!dir) return false;
  // Whole-folder integrity FIRST (user reports: pairing lost after closing /
  // reconnect loop after restart). A torn KEY file poisons every handshake
  // even when creds.json is perfectly fine — so before answering anything,
  // any corruption in the folder is healed from the last server-accepted
  // snapshot (creds + keys restored TOGETHER, never a mix).
  if (!liveAuthFolderIntact(dir)) {
    if (restoreSessionSnapshot("torn auth file detected")) {
      integrityMemo.set(dir, true);
    }
    // If no snapshot exists the file-level checks below still run: the
    // creds.json.bak fallback keeps healing pre-snapshot installs.
  }
  const credsPath = path.join(dir, "creds.json");
  // MISSING live file: a previous exit may have been killed mid-write with no
  // chance to run the recovery path. The verified backups MUST be tried
  // before answering "no session" — otherwise the app asks for a fresh QR
  // even though the phone still lists the device (user report: pairing lost
  // after closing, "still"). The whole-folder snapshot wins over the
  // single-file backup because it restores a CONSISTENT state.
  if (!fs.existsSync(credsPath)) {
    if (restoreSessionSnapshot("creds.json missing")) return true;
    return restoreBackupCreds();
  }
  const creds = readCredsFile(credsPath);
  if (isPairedCreds(creds)) return true;
  if (creds === null) {
    // Live creds.json is UNREADABLE (truncated by a hard exit, antivirus
    // lock, …). The phone still lists the device, so restore the last
    // verified state — the keys in it are what the server knows.
    if (restoreSessionSnapshot("creds.json unreadable")) return true;
    return restoreBackupCreds();
  }
  // Parses, but the pairing never completed. If a VERIFIED backup exists,
  // prefer it over wiping — the pairing may still be alive on the phone.
  // ALL of these recovery/retirement moves are gated on no live socket: a
  // QR/phone pairing IN PROGRESS holds exactly this creds shape (registered
  // only turns true at connection.open), and rewriting files under the live
  // handshake used to fight it mid-pairing.
  if (!sock && !startPromise) {
    if (restoreSessionSnapshot("live creds lost their pairing")) return true;
    if (restoreBackupCreds()) return true;
    // Leftovers from an aborted pairing are retired so the next Connect
    // shows a fresh QR instead of a doomed handshake.
    resetAuth("quarantine", "pairing never completed");
  }
  return false;
}

/** Full engine snapshot for the service layer / UI status mapping. */
export function engineState() {
  return {
    state,
    connected: state === "CONNECTED" && !!sock,
    hasSession: hasPersistedSession(),
    number: me?.number || "",
    name: me?.name || "",
    qrReady: !!qrDataUrl,
    lastError,
    since: stateSince,
  };
}

function clearReconnectTimer() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}

// Live WA Web version — cached for the whole process. The remote fetch is a
// network round trip on EVERY connect (reconnects included) and can hang for
// seconds behind a proxy/firewall; one fetch per app run is plenty, and a
// cached answer makes reconnects after a drop instant.
let cachedWaVersion: { version: [number, number, number]; at: number } | null = null;
const WA_VERSION_TTL_MS = 12 * 60 * 60 * 1000;

// Test seams — the state machine (stale-socket guard, flap detector,
// retries) is exercised from plain Node with a fake socket factory and no
// network. `undefined` = real behavior.
type EngineSocketFactory = (opts: any) => WASocket;
let socketFactoryOverride: EngineSocketFactory | null = null;
let waVersionOverride: [number, number, number] | undefined | null;
export function setEngineDepsForTests(deps: { socketFactory?: EngineSocketFactory | null; waVersion?: [number, number, number] | null } = {}): void {
  socketFactoryOverride = deps.socketFactory ?? null;
  waVersionOverride = deps.waVersion === undefined ? undefined : deps.waVersion;
  // Reset the full state machine so each case starts from IDLE determinism.
  clearReconnectTimer();
  if (snapshotTimer) { clearTimeout(snapshotTimer); snapshotTimer = null; }
  sock = null;
  intentionalStop = false;
  sessionProven = false;
  closesWithoutOpen = 0;
  snapshotRetryUsed = false;
  loggedOutRetryUsed = false;
  openedAt = 0;
  shortCycles = 0;
  flapHalted = false;
  reconnectAttempts = 0;
  qrDataUrl = "";
  me = null;
  liveCreds = null;
  credsSaver = null;
  setState("IDLE", "");
}

async function fetchWaWebVersion(): Promise<[number, number, number] | undefined> {
  if (waVersionOverride !== undefined) return waVersionOverride ?? undefined;
  if (cachedWaVersion && Date.now() - cachedWaVersion.at < WA_VERSION_TTL_MS) return cachedWaVersion.version;
  try {
    // Bound the fetch to 8s so the socket still opens with Baileys' bundled
    // version instead of hanging (user report: pairing stuck on "Starting").
    const fetched = await Promise.race([
      fetchLatestWaWebVersion(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    const version = fetched?.version || undefined;
    if (version) cachedWaVersion = { version, at: Date.now() };
    return version;
  } catch {
    return cachedWaVersion?.version; // offline or blocked — reuse/omit
  }
}

async function connectInternal(): Promise<void> {
  const dir = authDir();
  if (!dir) throw new Error("WhatsApp engine is only available inside the app.");
  fs.mkdirSync(dir, { recursive: true });
  clearReconnectTimer();
  // Atomic auth state: every creds/key file lands via temp-file + rename, and
  // every write is tracked so the quit path can drain them before app.exit.
  const { state: authState, saveCreds } = await useAtomicMultiFileAuthState(dir);
  // Keep a handle on the LIVE creds object: Baileys merges every
  // `creds.update` into it (Socket/socket.js: `Object.assign(creds, update)`),
  // so writing it back later persists whatever the socket learned meanwhile.
  liveCreds = authState.creds as any;
  const version = await fetchWaWebVersion();

  const socketOpts = {
    auth: {
      creds: authState.creds,
      keys: makeCacheableSignalKeyStore(authState.keys, silentLogger),
    },
    logger: silentLogger,
    // macOS/Chrome fingerprint pairs most reliably with the current WA Web
    // protocol — the Ubuntu fingerprint used before was being rejected
    // outright by some servers (user report: "pairing is failing").
    browser: Browsers.macOS("Chrome"),
    version,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  };
  const created = (socketFactoryOverride ? socketFactoryOverride(socketOpts) : makeWASocket(socketOpts)) as WASocket;
  sock = created;
  const queuedSaveCreds = () => {
    // Only the CURRENT socket may write credentials: a stale socket kept
    // alive by a slow close would otherwise overwrite the fresh pairing's
    // creds with its own (old) handshake state mid-connect.
    if (sock !== created) return Promise.resolve();
    credsSaveQueue = credsSaveQueue
      .then(() => saveCreds())
      .then(() => backupCreds(dir))
      .catch(() => { /* verification loop in flushAuthWrites is the safety net */ });
    return credsSaveQueue;
  };
  created.ev.on("creds.update", queuedSaveCreds);
  credsSaver = queuedSaveCreds;
  created.ev.on("connection.update", (update) => {
    // STALE-SOCKET GUARD (user reports: "after restart it connects and
    // disconnects forever"). Baileys emits connection.update from internal
    // async flows, so a SUPERSEDED socket's late close used to land on the
    // module state AFTER the replacement socket was created — nulling the
    // live socket and firing a phantom reconnect, which the next late event
    // would undo again. Only the live socket may move the state machine.
    if (sock !== created) return;
    void onConnectionUpdate(update);
  });
  // Delivery / read receipts for messages WE sent (privacy lock source).
  // `messages.update` carries { key: { id }, update: { status } } — statuses
  // below DELIVERY_ACK (PENDING/SERVER_ACK) are ignored: "the server took
  // it" is NOT "the recipient got it".
  created.ev.on("messages.update", (updates: any[]) => {
    // Delivery acks are idempotent bookkeeping — an ack that arrives on a
    // closing socket is still a valid ack, so this intentionally has no
    // stale-socket guard (the connection state machine is guarded instead).
    for (const u of updates || []) {
      const id = String(u?.key?.id || "");
      const st = Number(u?.update?.status ?? 0);
      if (id && st > 0 && u?.key?.fromMe !== false) noteMessageStatus(id, st);
    }
  });
  if (state !== "QR_REQUIRED" && state !== "CONNECTED") setState("CONNECTING");
}

async function onConnectionUpdate(update: Partial<ConnectionState>) {
  const { connection, lastDisconnect, qr } = update;
  const current = sock;
  if (!current) return; // socket already torn down by stopEngine()

  if (qr) {
    try {
      qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
      setState("QR_REQUIRED", "");
    } catch { /* QR rendering failure — the next rotation retries */ }
  }

  if (connection === "open") {
    qrDataUrl = "";
    loggedOutRetryUsed = false;
    snapshotRetryUsed = false;
    sessionProven = true;
    closesWithoutOpen = 0;
    openedAt = Date.now();
    const user = (current as any).user;
    me = {
      number: String(user?.id || "").replace(/@.*$/, ""),
      name: String(user?.name || user?.verifiedName || ""),
    };
    reconnectAttempts = 0;
    setState("CONNECTED", "");
    // The server accepted this session — stamp the pairing as COMPLETE and
    // force a verified write (live creds + creds.json.bak). This is what
    // makes the session survive a restart for QR pairings, which Baileys
    // never flags as `registered` by itself.
    markPairedOnDisk();
    // …and snapshot the whole folder (creds + keys, one consistent state) a
    // moment after the connection settles. This is the backup every later
    // "torn session" recovery restores from.
    scheduleAuthSnapshot(2500, "server accepted the session");
    return;
  }

  if (connection === "close") {
    const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
    const reason = String((lastDisconnect?.error as any)?.message || "");
    // ONLY these mean the stored session itself is rejected — reconnecting
    // with the same credentials then loops forever, so they are handled like
    // a logout instead of being retried in the backoff ladder. `forbidden`
    // (403, "Stream Errored (forbidden)") is what the server answers when the
    // stored device identity is no longer accepted.
    //
    // badSession (500) is deliberately NOT here: it is WhatsApp's generic
    // transient "Stream Errored (unknown)" — thrown routinely on hiccups,
    // famously right after an app/boot restart while the network is still
    // warming up. Treating it as session-dead meant TWO unlucky 500s in a
    // row permanently retired a perfectly healthy pairing (user reports:
    // "pairing lost after restart", "keeps connecting and disconnecting").
    // 500/408/428/440/503/515 all ride the normal ladder, with the flap
    // detector and the never-opens guard as the loop stoppers.
    const sessionRejected = statusCode === DisconnectReason.loggedOut
      || statusCode === DisconnectReason.forbidden
      || statusCode === DisconnectReason.multideviceMismatch;
    if (sessionRejected) {
      // One-shot second chance: restore the verified state ONCE before
      // retiring the session — a mid-write kill can surface as loggedOut
      // while the phone still lists the device. The whole-folder snapshot is
      // tried first (creds + keys, consistent); the legacy creds-only backup
      // is the fallback for installs that predate snapshots. If the retry
      // also fails, the pairing is dead. The failing socket is retired from
      // the module state FIRST so its late creds writes can never overwrite
      // the just-restored files (the stale-socket guard then blocks it).
      if (!loggedOutRetryUsed) {
        loggedOutRetryUsed = true;
        sock = null;
        if (restoreSessionSnapshot("session rejected by the server") || restoreBackupCreds()) {
          setState("RECONNECTING", "Retrying with the backed-up WhatsApp session…");
          scheduleReconnect();
          return;
        }
      }
      // The phone unlinked this device (or the server rejected the stored
      // session) — the credentials are dead. Retire them (kept recoverable,
      // see resetAuth) so the next Connect shows a fresh QR instead of a
      // doomed handshake.
      resetAuth("quarantine", "rejected by WhatsApp");
      liveCreds = null;
      sock = null;
      setState("IDLE", statusCode === DisconnectReason.loggedOut
        ? "WhatsApp session was unlinked from the phone. Pair again by scanning the QR code."
        : "WhatsApp rejected the stored session. Pair again by scanning the QR code.");
      return;
    }
    sock = null;
    if (intentionalStop) { setState("IDLE", ""); return; }
    // Flap detector tally: how long did THIS session stay up? A within-
    // seconds drop counts against the limit; a long healthy session clears
    // it. (Skip when the socket never opened — the loop guard below owns
    // that case.)
    if (sessionProven && openedAt) {
      const lifetime = Date.now() - openedAt;
      if (lifetime < FLAP_WINDOW_MS) shortCycles++;
      else if (lifetime > FLAP_HEAL_MS) shortCycles = 0;
      openedAt = 0;
      if (shortCycles >= MAX_FLAPS) {
        flapHalted = true;
        setState("IDLE",
          "WhatsApp keeps dropping the connection a few seconds after connecting. This usually means the number was rate-limited, another app is using this WhatsApp pairing, or the internet line is unstable. Check the connection, then press Connect to try again — if it repeats, unlink the phone and pair again by scanning the QR code.");
        return;
      }
    }
    // Loop guard: a session that keeps getting closed WITHOUT a single `open`
    // is stale no matter what statusCode the server used. Give the verified
    // whole-folder snapshot ONE try before retiring the session and asking
    // for a fresh QR instead of flashing connect/disconnect forever.
    if (!sessionProven) {
      closesWithoutOpen++;
      const credsOnDisk = readCredsFile(path.join(authDir() || "", "creds.json"));
      if (closesWithoutOpen >= MAX_CLOSES_WITHOUT_OPEN && isPairedCreds(credsOnDisk)) {
        if (!snapshotRetryUsed && restoreSessionSnapshot("session never opened after restart")) {
          snapshotRetryUsed = true;
          closesWithoutOpen = 0;
          setState("RECONNECTING", "Trying the verified WhatsApp session snapshot…");
          scheduleReconnect();
          return;
        }
        resetAuth("quarantine", "session never reconnected after restart");
        liveCreds = null;
        closesWithoutOpen = 0;
        setState("IDLE",
          "WhatsApp could not re-establish the saved session. The stored session was retired — pair again by scanning the QR code.");
        return;
      }
    }
    setState("RECONNECTING", reason);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (intentionalStop || startPromise || flapHalted) return;
  clearReconnectTimer();
  const delay = Math.min(1000 * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startEngine().catch(() => { /* state/lastError already recorded */ });
  }, delay);
}

/** Retire the stored credentials.
 *
 *  They are MOVED ASIDE, not deleted. "Is this a completed pairing?" is a
 *  heuristic about Baileys' internal creds shape, and a false negative used to
 *  DELETE a perfectly good session — the user then had to scan a new QR after
 *  every restart. Quarantining keeps the last two retired attempts recoverable
 *  (support can drop one back in place) while still guaranteeing the next
 *  Connect starts from a clean slate. Only an explicit "Unlink phone" hard-
 *  deletes, because that is the user asking for the credentials to go. */
function resetAuth(mode: "quarantine" | "delete" = "quarantine", reason = ""): void {
  const dir = authDir();
  if (!dir) return;
  try {
    if (!fs.existsSync(dir)) return;
    if (mode === "delete") {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.renameSync(dir, `${dir}-retired-${stamp}`);
    console.log(`[whatsapp] Stored WhatsApp session retired${reason ? ` (${reason})` : ""} — pair again to continue`);
  } catch (err: any) {
    // Renaming can fail (a locked file on Windows): fall back to deleting so a
    // rejected session is never presented to the server again.
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    console.warn("[whatsapp] Could not retire the session folder:", err?.message || err);
  } finally {
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* created on next connect */ }
    // The whole-folder snapshot belongs to the retired session — it must go
    // too, or a later corruption check would resurrect the dead pairing over
    // a FRESH one. (The snapshot of the next good pairing rebuilds itself at
    // the next connection.open.)
    const good = snapshotDir();
    if (good) { try { fs.rmSync(good, { recursive: true, force: true }); } catch { /* best effort */ } }
    integrityMemo.delete(dir);
    // The session identity the guards tracked is gone — a fresh pairing that
    // follows must earn its own proven/loop counts.
    sessionProven = false;
    closesWithoutOpen = 0;
    pruneRetiredAuth();
  }
}

/** Keep at most the two most recent retired session folders. */
function pruneRetiredAuth(): void {
  const dir = authDir();
  if (!dir) return;
  try {
    const parent = path.dirname(dir);
    const prefix = `${path.basename(dir)}-retired-`;
    const old = fs.readdirSync(parent).filter((n) => n.startsWith(prefix)).sort();
    for (const name of old.slice(0, Math.max(0, old.length - 2))) {
      try { fs.rmSync(path.join(parent, name), { recursive: true, force: true }); } catch { /* best effort */ }
    }
  } catch { /* best effort */ }
}

/** Stamp the persisted creds as a COMPLETED pairing and force a verified
 *  write (live creds.json + creds.json.bak).
 *
 *  Baileys 7 sets `registered` only on the link-code pairing path, so a QR
 *  session on disk never carried the flag; every "is a session persisted?"
 *  answer then came out "no" and the auth folder was wiped at the next start.
 *  Nothing inside Baileys READS `registered` (grep: only initAuthCreds and the
 *  link-code handler touch it), so writing it once the server has accepted the
 *  login is a safe, self-describing marker for our own recovery logic — and it
 *  also heals sessions paired by older builds on the very first connect. */
function markPairedOnDisk(): void {
  try {
    if (liveCreds && liveCreds.registered !== true) liveCreds.registered = true;
    void credsSaver?.();
  } catch { /* the quit-time flush is the safety net */ }
}

// ---- Creds write safety (user report: after quitting, the app came back
// "logged out" while the PHONE still listed the device — a truncated
// creds.json from a mid-write exit is the classic cause). ----
// 1) All Baileys creds writes run through ONE serialized queue: rapid
//    creds.update events used to interleave and cut each other off.
// 2) Every completed write is JSON-verified and only then copied to
//    creds.json.bak — a complete backup therefore always exists on disk.
// 3) hasPersistedSession() restores the .bak automatically if the live file
//    is ever found unreadable (heals already-broken installs too).
let credsSaveQueue: Promise<void> = Promise.resolve();
function backupCreds(dir: string): void {
  try {
    const live = path.join(dir, "creds.json");
    const raw = fs.readFileSync(live, "utf-8");
    // Only back up a COMPLETE, PAIRED file (JSON.parse proves it is not
    // mid-write) and write the copy ATOMICALLY, so the backup itself can
    // never be the file a hard exit truncates.
    if (isPairedCreds(JSON.parse(raw))) atomicWriteJson(path.join(dir, "creds.json.bak"), raw);
  } catch { /* live file mid-write or absent — skip this round */ }
}

/** Start the engine (creates the socket; QR/login follows asynchronously).
 *  Single-flight: concurrent callers share one attempt.
 *
 *  `voluntary` marks a DELIBERATE user action (pressing Connect, starting a
 *  QR/phone pairing): it clears the flap halt so a halted engine is one
 *  button away from trying again. Automatic starts (reconnect ladder,
 *  status-poll auto-start) pass false — the reconnect loop must NOT erase
 *  the flap tally it is itself being counted for. */
export async function startEngine(voluntary = false): Promise<void> {
  if (sock || startPromise) return startPromise ?? Promise.resolve();
  intentionalStop = false;
  if (voluntary) { flapHalted = false; shortCycles = 0; }
  lastError = "";
  startPromise = connectInternal()
    .catch((err: any) => {
      setState("IDLE", String(err?.message || err));
      sock = null;
      throw err;
    })
    .finally(() => { startPromise = null; });
  return startPromise;
}

/** Auto-start from status polling — only when a paired session exists (no
 *  pointless QR handshakes for unpaired machines), within the backoff, and
 *  not while the flap detector has halted automatic reconnects (a manual
 *  Connect is the deliberate retry then). */
export function maybeStartEngine(): void {
  if (sock || startPromise || intentionalStop || flapHalted) return;
  if (!hasPersistedSession()) return;
  if (Date.now() - lastAutoAttempt < AUTO_START_BACKOFF_MS) return;
  lastAutoAttempt = Date.now();
  startEngine().catch(() => { /* recorded in state */ });
}

/**** Graceful-quit auth flush — makes "connection gone after closing" impossible.
 * 1. Force one FINAL creds write through Baileys' own saver (awaited, with a
 *    timeout so a wedged socket can never block exit).
 * 2. VERIFY the persisted creds actually parse and describe a completed
 *    pairing; if the file is mid-write/unreadable, wait briefly for the write
 *    to land. An UNPAIRED machine returns immediately — there is nothing to
 *    verify, and burning the whole deadline made every close take 5 seconds.
 * Without this, quitting right after a key rotation could leave a truncated
 * creds.json behind and the pairing would be lost by the next start. */
export async function flushAuthWrites(maxMs = 3000): Promise<boolean> {
  const dir = authDir();
  if (!dir) return false;
  try {
    if (credsSaver) {
      await Promise.race([
        credsSaver(),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
    }
  } catch { /* best effort — verification below is the real safety net */ }
  // Also drain Baileys' in-flight KEY writes: only creds used to be flushed
  // here, so a quick close could still truncate a session/pre-key file —
  // the exact "connection gone after closing" class the atomic writes and
  // the folder snapshot now back-stop together.
  try {
    await Promise.race([
      drainAuthWrites(2000),
      new Promise((r) => setTimeout(r, 2200)),
    ]);
  } catch { /* best effort */ }
  const deadline = Date.now() + maxMs;
  for (;;) {
    const creds = readCredsFile(path.join(dir, "creds.json"));
    if (creds === null) {
      // Nothing usable on disk: either an unpaired machine (normal) or a
      // truncated file. Stop waiting when no pairing was ever stamped.
      if (!isPairedCreds(liveCreds)) return false;
    } else if (isPairedCreds(creds)) {
      // Final verified backup — the next start can always restore a complete
      // pairing even if the very last write was cut off.
      backupCreds(dir);
      return true; // pairing is safely on disk
    }
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

/** Take the consistent whole-folder snapshot NOW (quit path): the state the
 *  next start restores from if anything below it got cut off mid-flight. */
export function snapshotAuthNow(): boolean {
  if (snapshotTimer) { clearTimeout(snapshotTimer); snapshotTimer = null; }
  return snapshotAuthDir("quit flush");
}

/** Tear the session down. WITHOUT `logout` the paired device STAYS linked on
 *  the phone (clean WebSocket close) — the close/quit path. With
 * `logout: true` the device is unlinked on the phone AND credentials are
 * wiped — only for an explicit "Unlink phone" action. */
export async function stopEngine(opts: { logout?: boolean } = {}): Promise<void> {
  intentionalStop = true;
  clearReconnectTimer();
  // A deliberate stop is never a flap, and it must not leave a half-tally
  // behind that trips the detector on the next Connect.
  openedAt = 0;
  shortCycles = 0;
  const current = sock;
  sock = null;
  qrDataUrl = "";
  if (!current) { setState("IDLE", ""); return; }
  try {
    if (opts.logout) {
      await Promise.race([current.logout(), new Promise((r) => setTimeout(r, 6000))]);
    } else {
      await Promise.race([current.end(new Error("stopped")), new Promise((r) => setTimeout(r, 3000))]);
    }
  } catch { /* already closed */ }
  if (opts.logout) {
    // Explicit "Unlink phone": the credentials really are removed.
    resetAuth("delete", "unlink");
    // Forget the in-memory creds + saver: a wiped session must never be
    // written back (and must never satisfy the quit-time flush check).
    liveCreds = null;
    credsSaver = null;
  }
  me = null;
  setState("IDLE", "");
}

/** Current QR code as a PNG data URL, waiting for the first one to arrive. */
export async function currentQr(waitMs = 25000): Promise<string> {
  if (!sock && !startPromise) await startEngine(true).catch(() => { /* surfaced below */ });
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (qrDataUrl) return qrDataUrl;
    if (!sock && !startPromise && state === "IDLE" && lastError) {
      throw new Error(lastError ? `Could not start WhatsApp: ${lastError}` : "QR code is not available yet");
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("QR code is not available yet");
}

/** Phone-number pairing ("Link with phone number") — the ALTERNATIVE to the
 *  QR scan, added because QR pairing was failing for some users. Requests an
 *  8-character code that the user types into WhatsApp on the phone:
 *  WhatsApp → Settings → Linked Devices → Link a Device → Link with phone
 *  number instead. Must run while the session is UNPAIRED. */
export async function requestPairingCode(phone: string, waitMs = 20000): Promise<string> {
  if (hasPersistedSession()) {
    throw new Error("WhatsApp is already paired. Unlink the phone first if you want to pair a different device.");
  }
  if (!sock && !startPromise) await startEngine(true).catch(() => { /* surfaced below */ });
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const s = sock;
    if (s) {
      try {
        const raw = await (s as any).requestPairingCode(phone);
        const code = String(raw || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
        if (code.length < 4) throw new Error("WhatsApp did not return a pairing code. Try again.");
        // WhatsApp's own UI shows the code in two blocks of four.
        return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4, 8)}` : code;
      } catch (err: any) {
        throw new Error(String(err?.message || err) || "Could not request a pairing code");
      }
    }
    if (!sock && !startPromise && state === "IDLE" && lastError) {
      throw new Error(lastError ? `Could not start WhatsApp: ${lastError}` : "Pairing code is not available yet");
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Pairing code is not available yet — check the internet connection and try again");
}

/** Socket for interactive actions — throws actionable guidance when the
 *  session is not paired/connected yet. */
export function requireConnectedSocket(): WASocket {
  if (state === "CONNECTED" && sock) return sock;
  if (state === "QR_REQUIRED") throw new Error("WhatsApp is not paired yet. Open the WhatsApp page and scan the QR code, then try again.");
  throw new Error("WhatsApp is not connected yet. Open the WhatsApp page, connect and scan the QR code, then try again.");
}

// ---------------------------------------------------------------------------
// Phone → JID resolution, with a cache. EVERY send used to ask the WhatsApp
// servers "is this number registered?" (`onWhatsApp`) — a full round trip of
// roughly 0.5–2 s, repeated for the SAME family on every receipt and every
// reminder. A positive answer is cached for 12 h (numbers do not move between
// accounts often); a "not on WhatsApp" answer only for 2 min so a number that
// was just corrected/registered is retried quickly. The cache is keyed on the
// digits the app stores, so editing a family's number never serves a stale JID.
// ---------------------------------------------------------------------------
const JID_HIT_TTL_MS = 12 * 60 * 60 * 1000;
const JID_MISS_TTL_MS = 2 * 60 * 1000;
const jidCache = new Map<string, { jid: string | null; at: number }>();

/** Resolve a phone number to a WhatsApp JID, verifying it is registered.
 *  10-digit local numbers are tried with the +91 (India) country code FIRST —
 *  that is what the mahallu records hold, and probing the bare 10 digits first
 *  guaranteed one wasted round trip on every single send. */
export async function resolveJid(phone: string): Promise<string> {
  const s = requireConnectedSocket();
  const digits = String(phone || "").replace(/\D/g, "");
  const notRegistered = () => new Error("This number is not registered on WhatsApp");
  if (!digits) throw notRegistered();
  const cached = jidCache.get(digits);
  if (cached && Date.now() - cached.at < (cached.jid ? JID_HIT_TTL_MS : JID_MISS_TTL_MS)) {
    if (cached.jid) return cached.jid;
    throw notRegistered();
  }
  const candidates = digits.length === 10 ? [`91${digits}`, digits] : [digits];
  for (const candidate of candidates) {
    try {
      const results = await s.onWhatsApp(candidate);
      const hit = (results || []).find((r: any) => r?.exists && r?.jid);
      if (hit) {
        const jid = String(hit.jid);
        jidCache.set(digits, { jid, at: Date.now() });
        return jid;
      }
    } catch { /* try the next candidate form */ }
  }
  jidCache.set(digits, { jid: null, at: Date.now() });
  throw notRegistered();
}

/** Send a plain text message over the paired session. */
export async function engineSendText(jid: string, text: string): Promise<{ id: string }> {
  const s = requireConnectedSocket();
  const result: any = await s.sendMessage(jid, { text });
  return { id: String(result?.key?.id || "") };
}

/** Send a PDF document (e.g. an A6 receipt) with a text caption. */
export async function engineSendDocument(jid: string, pdf: Buffer, fileName: string, caption: string): Promise<{ id: string }> {
  const s = requireConnectedSocket();
  const result: any = await s.sendMessage(jid, {
    document: pdf,
    fileName,
    mimetype: "application/pdf",
    caption,
  });
  return { id: String(result?.key?.id || "") };
}

/** Delete leftover data from the retired WAHA gateway (sessions/files dirs). */
export function clearLegacyWahaData(): void {
  const base = userDataDir();
  if (!base) return;
  for (const name of ["sessions", "files"]) {
    try { fs.rmSync(path.join(base, "whatsapp", name), { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

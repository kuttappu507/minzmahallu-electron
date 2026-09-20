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
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestWaWebVersion,
  DisconnectReason,
  Browsers,
  proto,
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

/** A paired session's credentials exist AND the pairing completed on disk.
 * Leftovers from an ABORTED pairing (creds.json written before the QR was
 * scanned) are wiped so the next start doesn't run a doomed handshake that
 * the server answers with 401 — the "logged out after close" class. */
export function hasPersistedSession(): boolean {
  const dir = authDir();
  if (!dir) return false;
  const credsPath = path.join(dir, "creds.json");
  // MISSING live file: a previous exit may have been killed mid-write with no
  // chance to run the recovery path. The verified backup MUST be tried before
  // answering "no session" — otherwise the app asks for a fresh QR even
  // though the phone still lists the device (user report: pairing lost after
  // closing, "still"). Previously only the UNREADABLE-file branch restored.
  if (!fs.existsSync(credsPath)) {
    return restoreBackupCreds();
  }
  const creds = readCredsFile(credsPath);
  if (isPairedCreds(creds)) return true;
  if (creds === null) {
    // Live creds.json is UNREADABLE (truncated by a hard exit, antivirus
    // lock, …). The phone still lists the device, so restore the last
    // verified backup — the keys in it are what the server knows.
    return restoreBackupCreds();
  }
  // Parses, but the pairing never completed. If a VERIFIED backup exists,
  // prefer it over wiping — the pairing may still be alive on the phone.
  if (restoreBackupCreds()) return true;
  // Leftovers from an aborted pairing are retired so the next Connect shows a
  // fresh QR instead of a doomed handshake — but ONLY when no socket is live:
  // mid-pairing creds are expected to be incomplete for a while.
  if (!sock && !startPromise) resetAuth("quarantine", "pairing never completed");
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

async function fetchWaWebVersion(): Promise<[number, number, number] | undefined> {
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
  const { state: authState, saveCreds } = await useMultiFileAuthState(dir);
  // Keep a handle on the LIVE creds object: Baileys merges every
  // `creds.update` into it (Socket/socket.js: `Object.assign(creds, update)`),
  // so writing it back later persists whatever the socket learned meanwhile.
  liveCreds = authState.creds as any;
  const version = await fetchWaWebVersion();

  sock = makeWASocket({
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
  });
  const queuedSaveCreds = () => {
    credsSaveQueue = credsSaveQueue
      .then(() => saveCreds())
      .then(() => backupCreds(dir))
      .catch(() => { /* verification loop in flushAuthWrites is the safety net */ });
    return credsSaveQueue;
  };
  sock.ev.on("creds.update", queuedSaveCreds);
  credsSaver = queuedSaveCreds;
  sock.ev.on("connection.update", (update) => void onConnectionUpdate(update));
  // Delivery / read receipts for messages WE sent (privacy lock source).
  // `messages.update` carries { key: { id }, update: { status } } — statuses
  // below DELIVERY_ACK (PENDING/SERVER_ACK) are ignored: "the server took
  // it" is NOT "the recipient got it".
  sock.ev.on("messages.update", (updates: any[]) => {
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
    return;
  }

  if (connection === "close") {
    const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
    const reason = String((lastDisconnect?.error as any)?.message || "");
    // These three mean the stored session itself is rejected — reconnecting
    // with the same credentials loops forever, so they are handled like a
    // logout instead of being retried in the backoff ladder.
    const sessionRejected = statusCode === DisconnectReason.loggedOut
      || statusCode === DisconnectReason.badSession
      || statusCode === DisconnectReason.multideviceMismatch;
    if (sessionRejected) {
      // One-shot second chance: try the verified backup ONCE before retiring
      // the session — a mid-write kill can surface as loggedOut while the
      // phone still lists the device. If the retry also fails, it is dead.
      if (!loggedOutRetryUsed && restoreBackupCreds()) {
        loggedOutRetryUsed = true;
        sock = null;
        setState("RECONNECTING", "Retrying with the backed-up WhatsApp session…");
        scheduleReconnect();
        return;
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
    setState("RECONNECTING", reason);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (intentionalStop || startPromise) return;
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
 *  Single-flight: concurrent callers share one attempt. */
export async function startEngine(): Promise<void> {
  if (sock || startPromise) return startPromise ?? Promise.resolve();
  intentionalStop = false;
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
 *  pointless QR handshakes for unpaired machines) and within the backoff. */
export function maybeStartEngine(): void {
  if (sock || startPromise || intentionalStop) return;
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

/** Tear the session down. WITHOUT `logout` the paired device STAYS linked on
 *  the phone (clean WebSocket close) — the close/quit path. With
 * `logout: true` the device is unlinked on the phone AND credentials are
 * wiped — only for an explicit "Unlink phone" action. */
export async function stopEngine(opts: { logout?: boolean } = {}): Promise<void> {
  intentionalStop = true;
  clearReconnectTimer();
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
  if (!sock && !startPromise) await startEngine().catch(() => { /* surfaced below */ });
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
  if (!sock && !startPromise) await startEngine().catch(() => { /* surfaced below */ });
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

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
function authDir(): string | null {
  const base = userDataDir();
  return base ? path.join(base, "whatsapp", "auth") : null;
}
function setState(next: EngineState, error = "") {
  state = next;
  stateSince = Date.now();
  if (error !== undefined && error !== "") lastError = error;
  else if (error === "") lastError = "";
}

/** Restore creds.json from the verified backup (creds.json.bak). Returns
 *  true when a complete, registered backup was copied over the live file. */
function restoreBackupCreds(): boolean {
  const dir = authDir();
  if (!dir) return false;
  const bak = path.join(dir, "creds.json.bak");
  if (!fs.existsSync(bak)) return false;
  try {
    const raw = fs.readFileSync(bak, "utf-8");
    const creds = JSON.parse(raw);
    if (creds?.registered === true) {
      fs.writeFileSync(path.join(dir, "creds.json"), raw);
      console.log("[whatsapp] Restored WhatsApp session from creds.json.bak");
      return true;
    }
  } catch { /* unusable backup */ }
  return false;
}

/** A paired session's credentials exist AND registration completed on disk.
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
  try {
    const creds = JSON.parse(fs.readFileSync(credsPath, "utf-8"));
    if (creds?.registered === true) return true;
    // Live file parses but is NOT registered. If a VERIFIED backup exists,
    // prefer it over wiping — the pairing may still be alive on the phone.
    if (restoreBackupCreds()) return true;
    // Only wipe when no socket is live — mid-pairing creds are expected to
    // be unregistered for a while and must not be destroyed.
    if (!sock && !startPromise) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
    return false;
  } catch {
    // Live creds.json is UNREADABLE (truncated by a hard exit, antivirus
    // lock, …). The phone still lists the device, so restore the last
    // verified backup — the keys in it are what the server knows.
    return restoreBackupCreds();
  }
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

async function connectInternal(): Promise<void> {
  const dir = authDir();
  if (!dir) throw new Error("WhatsApp engine is only available inside the app.");
  fs.mkdirSync(dir, { recursive: true });
  clearReconnectTimer();
  const { state: authState, saveCreds } = await useMultiFileAuthState(dir);
  // Live WA Web version: required for a successful handshake. The remote fetch
  // can hang when a proxy/firewall slows the endpoint — bound it to 8s so the
  // socket still opens with Baileys' bundled version instead of hanging (user
  // report: pairing stuck forever on "Starting").
  let version: [number, number, number] | undefined;
  try {
    const fetched = await Promise.race([
      fetchLatestWaWebVersion(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    version = fetched?.version || undefined;
  } catch { /* offline or blocked — Baileys falls back to its bundled version */ }

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
    return;
  }

  if (connection === "close") {
    const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
    const reason = String((lastDisconnect?.error as any)?.message || "");
    if (statusCode === DisconnectReason.loggedOut) {
      // One-shot second chance: try the verified backup ONCE before wiping —
      // a mid-write kill can surface as loggedOut while the phone still
      // lists the device. If the retry also 401s, the pairing is truly dead.
      if (!loggedOutRetryUsed && restoreBackupCreds()) {
        loggedOutRetryUsed = true;
        sock = null;
        setState("RECONNECTING", "Retrying with the backed-up WhatsApp session…");
        scheduleReconnect();
        return;
      }
      // The phone unlinked this device — credentials are dead. Wipe them so
      // the next Connect shows a fresh QR instead of a doomed handshake.
      resetAuth();
      sock = null;
      setState("IDLE", "WhatsApp session was unlinked from the phone. Pair again by scanning the QR code.");
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

function resetAuth() {
  const dir = authDir();
  if (!dir) return;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
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
    const parsed = JSON.parse(raw); // only back up a COMPLETE file
    if (parsed && parsed.registered === true) {
      fs.writeFileSync(path.join(dir, "creds.json.bak"), raw);
    }
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
 * 2. VERIFY the persisted creds actually parse and say `registered: true`;
 *    if the file is mid-write/unreadable, wait briefly for the write to land.
 * Without this, quitting right after a key rotation could leave a truncated
 * creds.json behind and the pairing would be lost by the next start. */
export async function flushAuthWrites(maxMs = 5000): Promise<void> {
  const deadline = Date.now() + maxMs;
  try {
    if (credsSaver) {
      await Promise.race([
        credsSaver(),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    }
  } catch { /* best effort — verification below is the real safety net */ }
  const dir = authDir();
  if (!dir) return;
  while (Date.now() < deadline) {
    try {
      const raw = fs.readFileSync(path.join(dir, "creds.json"), "utf-8");
      const creds = JSON.parse(raw);
      if (creds && creds.registered === true) {
        // Final verified backup — the next start can always restore a
        // complete pairing even if the very last write was cut off.
        backupCreds(dir);
        return; // pairing is safely on disk
      }
    } catch { /* mid-write or truncated — wait and re-read */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
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
  if (opts.logout) resetAuth();
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

/** Resolve a phone number to a WhatsApp JID, verifying it is registered.
 *  10-digit local numbers are retried with the +91 (India) country code. */
export async function resolveJid(phone: string): Promise<string> {
  const s = requireConnectedSocket();
  const digits = String(phone || "").replace(/\D/g, "");
  const candidates = digits.length ? [digits] : [];
  if (digits.length === 10) candidates.push(`91${digits}`);
  for (const candidate of candidates) {
    try {
      const results = await s.onWhatsApp(candidate);
      const hit = (results || []).find((r: any) => r?.exists && r?.jid);
      if (hit) return String(hit.jid);
    } catch { /* try the next candidate form */ }
  }
  throw new Error("This number is not registered on WhatsApp");
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

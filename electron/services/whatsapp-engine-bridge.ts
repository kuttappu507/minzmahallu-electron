// WhatsApp engine bridge (v2.6.12) — the seam that moves the WHOLE Baileys
// engine off the Electron main process.
//
// WHY THIS EXISTS (user report: "after login, when whatsapp is checking and
// pairing automatically the whole window freeze"):
//   The engine used to run in-process in the Electron main process. A pairing
//   / reconnect burst is genuinely heavy work — the noise-protocol handshake
//   is pure-JS curve25519 crypto, the socket decodes protobuf nonstop, a
//   (re)connect triggers app-state-sync batches, and every session key lands
//   via a synchronous temp-file+rename write. All of that ran on the MAIN
//   process event loop, so every ipcMain.handle (opening a page, typing into
//   a form, a dashboard query) queued behind the burst and the WHOLE WINDOW
//   froze for seconds at exactly the "WhatsApp is checking / pairing" moment.
//
// HOW IT IS FIXED:
//   The engine module is untouched (same state machine, same tests) but it is
//   now LOADED inside a Node worker thread. This module is the only thing the
//   rest of the main process talks to:
//     - main-side:  the same function surface the engine module used to
//       export, implemented over a tiny request/response protocol. Sync reads
//       (engineState / isDelivered / requireConnectedSocket) are served from
//       a cache kept fresh by engine state events — signatures unchanged, so
//       whatsapp.service.ts needed no logic changes.
//     - worker-side (createEngineWorkerSide): dispatches calls to the real
//       engine and streams state + delivery events back.
//   The Baileys import itself moved into the worker, so the main process
//   never pays it at boot either — the heavy chain loads BEHIND the splash in
//   the worker while the splash renderer paints undisturbed.
//
// In plain Node (vitest) there is no Electron main process and no built
// worker file; the bridge then falls back to calling the engine module
// directly in-process ("direct" backend), which keeps every existing service
// test working unchanged.

import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

// ---------------------------------------------------------------------------
// Wire protocol (structured-clone friendly — no functions, no class instances)
// ---------------------------------------------------------------------------
type InitMsg = { kind: "init"; id: number; authDir: string | null; userData: string | null };
type ReqMsg = { kind: "req"; id: number; fn: string; args: any[] };
type ResMsg = { kind: "res"; id: number; ok: boolean; result?: any; error?: string };
type EvtMsg =
  | { kind: "evt"; evt: "state"; snap: EngineSnapshot }
  | { kind: "evt"; evt: "delivery"; msgId: string; status: number };
type WireMsg = InitMsg | ReqMsg | ResMsg | EvtMsg;

export type EngineSnapshot = {
  state: string;
  connected: boolean;
  hasSession: boolean;
  number: string;
  name: string;
  qrReady: boolean;
  lastError: string;
  since: number;
};

/** Functions the worker-side dispatcher accepts. Everything else is refused —
 *  the worker is a pure engine executor, never a generic eval surface.
 *  clearLegacyWahaData is handled INSIDE the dispatcher (see below): the
 *  engine's own copy resolves the userData folder through the electron
 *  module, which does not exist in a worker thread. */
const WORKER_FNS = new Set([
  "startEngine", "maybeStartEngine", "stopEngine", "currentQr",
  "requestPairingCode", "resolveJid", "engineSendText", "engineSendDocument",
  "flushAuthWrites", "drainAuthWrites", "snapshotAuthNow", "refreshState",
  "hasPersistedSession", "clearLegacyWahaData",
]);

/** Generous per-call caps. The engine's own waits are all bounded (version
 *  fetch 8 s, QR 25 s, pairing code 20 s, logout 6 s, quit flush 3 s…), so
 *  these only catch a WEDGED worker — they must never fire in normal use. */
const RPC_CAPS: Record<string, number> = {
  startEngine: 60_000,
  maybeStartEngine: 60_000,
  stopEngine: 15_000,
  currentQr: 40_000,
  requestPairingCode: 45_000,
  resolveJid: 30_000,
  engineSendText: 120_000,   // PDF uploads on a slow uplink can take a while
  engineSendDocument: 120_000,
  flushAuthWrites: 15_000,
  drainAuthWrites: 10_000,
  snapshotAuthNow: 15_000,
  refreshState: 10_000,
  hasPersistedSession: 10_000,
};
const DEFAULT_RPC_CAP_MS = 45_000;

// ---------------------------------------------------------------------------
// WORKER SIDE — runs inside the engine worker. One instance per worker.
// ---------------------------------------------------------------------------

/** Build the message handler for the engine worker. `post` sends raw wire
 *  messages back to the main process. Exposed separately so the protocol is
 *  testable end-to-end in plain Node (both sides in one process). */
export function createEngineWorkerSide(
  post: (msg: WireMsg) => void,
  onMessage: (handler: (msg: any) => void) => void
): void {
  // The engine module loads lazily INSIDE the worker: importing this bridge
  // must stay side-effect free, and Baileys must never load anywhere but here.
  const engineP = import("./whatsapp-engine.service.js");
  let authDir: string | null = null;
  let userData: string | null = null;

  void engineP.then((eng) => {
    // Delivery confirmations stream to the main process, which keeps its own
    // synchronous map for isDelivered/waitForDelivery and the receipt-lock
    // hook (whatsapp.service.init). Only DELIVERED+ statuses are emitted by
    // the engine's listener, which is all the main-process side ever needs.
    eng.onDelivery((msgId) => {
      try { post({ kind: "evt", evt: "delivery", msgId, status: 3 }); } catch { /* main gone */ }
    });
    // Every engine state transition pushes a fresh snapshot — that is what
    // keeps the main-process cache honest without polling.
    eng.onEngineStateChange(() => {
      try { post({ kind: "evt", evt: "state", snap: eng.engineState() }); } catch { /* main gone */ }
    });
  }).catch(() => { /* reported per-call below */ });

  const reply = (id: number, ok: boolean, result?: any, error?: string) => {
    try { post({ kind: "res", id, ok, ...(ok ? { result } : { error }) } as ResMsg); } catch { /* main gone */ }
  };

  onMessage((raw: any) => {
    void (async () => {
      const msg = raw as WireMsg;
      if (!msg || typeof msg !== "object") return;
      if (msg.kind === "init") {
        authDir = (msg as InitMsg).authDir ?? null;
        userData = (msg as InitMsg).userData ?? null;
        try {
          const eng = await engineP;
          if (authDir) eng.setAuthDir(authDir);
          reply((msg as InitMsg).id, true, true);
          // Initial snapshot so the main-process cache is truthful from the
          // first status poll (hasPersistedSession may heal the folder — that
          // side-effecting work belongs HERE, off the main process).
          post({ kind: "evt", evt: "state", snap: eng.engineState() });
        } catch (err: any) {
          reply((msg as InitMsg).id, false, undefined, String(err?.message || err));
        }
        return;
      }
      if (msg.kind !== "req") return;
      const req = msg as ReqMsg;
      if (!WORKER_FNS.has(req.fn)) {
        reply(req.id, false, undefined, `Unknown WhatsApp engine call: ${String(req.fn)}`);
        return;
      }
      try {
        const eng = await engineP;
        // The whitelist above is the security boundary; the dynamic dispatch
        // here just avoids rest-parameter type gymnastics for optional args.
        const anyEng = eng as any;
        if (req.fn === "clearLegacyWahaData") {
          // The engine's own copy resolves userData through the electron
          // module — unavailable in a worker thread — so the dispatcher does
          // it from the path handed over in the init message.
          if (userData) {
            for (const name of ["sessions", "files"]) {
              try { fs.rmSync(path.join(userData, "whatsapp", name), { recursive: true, force: true }); } catch { /* best effort */ }
            }
          }
          reply(req.id, true, undefined);
          return;
        }
        const result = await anyEng[req.fn](...req.args);
        reply(req.id, true, result);
      } catch (err: any) {
        reply(req.id, false, undefined, String(err?.message || err));
      }
    })();
  });
}

// ---------------------------------------------------------------------------
// MAIN SIDE — the exported engine surface, backend-agnostic.
// ---------------------------------------------------------------------------

function electronUserData(): string | null {
  try {
    const req = createRequire(import.meta.url);
    const electron = req("electron");
    const app = electron?.app;
    return app?.getPath?.("userData") || null;
  } catch { return null; }
}

// ---- Delivery tracking (main-process mirror of the engine's tracker) ----
// The receipt privacy lock flips in the MAIN process (the service layer owns
// the database), so delivery confirmations are mirrored here the moment the
// worker reports them. isDelivered/waitForDelivery stay synchronous exactly
// as before — whatsapp.service.ts cannot tell the difference.
const DELIVERED = 3; // proto.WebMessageInfo.Status.DELIVERY_ACK
const deliveryStatus = new Map<string, number>();
const deliveryListeners = new Set<(msgId: string) => void>();

function noteDelivery(msgId: string, status: number): void {
  if (!msgId || !Number.isFinite(status) || status < DELIVERED) return;
  const prev = deliveryStatus.get(msgId) || 0;
  if (status <= prev) return;
  deliveryStatus.set(msgId, status);
  if (deliveryStatus.size > 5000) {
    const excess = deliveryStatus.size - 5000;
    let dropped = 0;
    for (const key of deliveryStatus.keys()) {
      deliveryStatus.delete(key);
      if (++dropped >= excess) break;
    }
  }
  for (const cb of deliveryListeners) {
    try { cb(msgId); } catch { /* listener errors never break the bridge */ }
  }
}

/** Test seam — simulate a delivery confirmation landing from the engine. */
export function __noteDeliveryForTests(msgId: string, status = DELIVERED): void {
  noteDelivery(msgId, status);
}

// ---- Snapshot cache (engineState() / requireConnectedSocket() are sync) ----
let cachedSnap: EngineSnapshot = {
  state: "IDLE", connected: false, hasSession: false,
  number: "", name: "", qrReady: false, lastError: "", since: Date.now(),
};

function requireConnectedFromCache(): void {
  if (cachedSnap.state === "CONNECTED" && cachedSnap.connected) return;
  if (cachedSnap.state === "QR_REQUIRED") {
    throw new Error("WhatsApp is not paired yet. Open the WhatsApp page and scan the QR code, then try again.");
  }
  throw new Error("WhatsApp is not connected yet. Open the WhatsApp page, connect and scan the QR code, then try again.");
}

// ---------------------------------------------------------------------------
// Backends
// ---------------------------------------------------------------------------

interface EngineBackend {
  start(voluntary?: boolean): Promise<void>;
  maybeStart(): Promise<void>;
  stop(opts?: { logout?: boolean }): Promise<void>;
  qr(waitMs?: number): Promise<string>;
  pairingCode(phone: string, waitMs?: number): Promise<string>;
  resolveJid(phone: string): Promise<string>;
  sendText(jid: string, text: string): Promise<{ id: string }>;
  sendDocument(jid: string, pdf: Buffer, fileName: string, caption: string): Promise<{ id: string }>;
  flushAuth(maxMs?: number): Promise<boolean>;
  drainWrites(timeoutMs?: number): Promise<void>;
  snapshotNow(): Promise<boolean>;
  refreshState(): Promise<void>;
  hasSession(): Promise<boolean>;
  clearLegacy(): Promise<void>;
}

type EngineModule = typeof import("./whatsapp-engine.service.js");
let directEnginePromise: Promise<EngineModule> | null = null;

/** Direct backend — the engine module called in-process. Used outside the
 *  Electron main process (vitest) and as a fallback if the worker cannot be
 *  spawned (a broken install must degrade to the old behaviour, never to a
 *  dead WhatsApp page). */
async function directBackend(): Promise<EngineBackend> {
  if (!directEnginePromise) {
    directEnginePromise = import("./whatsapp-engine.service.js").then((eng) => {
      eng.onDelivery((msgId) => noteDelivery(msgId, DELIVERED));
      eng.onEngineStateChange(() => { cachedSnap = eng.engineState(); });
      return eng;
    });
  }
  const eng = await directEnginePromise;
  cachedSnap = eng.engineState();
  return {
    start: (v) => eng.startEngine(v),
    maybeStart: () => eng.maybeStartEngine(),
    stop: (o) => eng.stopEngine(o),
    qr: (w) => eng.currentQr(w),
    pairingCode: (p, w) => eng.requestPairingCode(p, w),
    resolveJid: (p) => eng.resolveJid(p),
    sendText: (j, t) => eng.engineSendText(j, t),
    sendDocument: (j, pdf, f, c) => eng.engineSendDocument(j, pdf, f, c),
    flushAuth: (m) => eng.flushAuthWrites(m),
    drainWrites: (t) => eng.drainAuthWrites(t),
    snapshotNow: () => Promise.resolve(eng.snapshotAuthNow()),
    refreshState: async () => { cachedSnap = eng.engineState(); },
    hasSession: () => Promise.resolve(eng.hasPersistedSession()),
    clearLegacy: () => Promise.resolve(eng.clearLegacyWahaData()),
  };
}

// ---- Worker backend ----
type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };
const pendingCalls = new Map<number, Pending>();
let workerRef: import("node:worker_threads").Worker | null = null;
let workerReadyP: Promise<void> | null = null;
let workerSeq = 1;
// Test transport (vitest): the protocol is exercised END-TO-END in plain
// Node by replacing the Worker spawn with a function that forwards wire
// messages to a real in-process createEngineWorkerSide dispatcher.
let fakeWorkerPost: ((msg: any) => void) | null = null;
let fakeWorkerReady = false;

/** Wire the bridge to a fake worker for tests — every request goes through
 *  the REAL pending/caps machinery, straight into the receiver you provide. */
export function __attachFakeWorkerForTests(sendToWorker: (msg: any) => void): void {
  fakeWorkerPost = sendToWorker;
  fakeWorkerReady = true;
}
export function __detachFakeWorkerForTests(): void {
  fakeWorkerPost = null;
  fakeWorkerReady = false;
}
/** Test receiver — the main side of the protocol (resolves pending calls,
 *  updates the snapshot cache and the delivery mirror). */
export function __bridgeReceiveForTests(msg: any): void {
  handleWireMessage(msg);
}

function postToWorker(msg: any): void {
  if (fakeWorkerPost) { fakeWorkerPost(msg); return; }
  const worker = workerRef;
  if (!worker) throw new Error("the WhatsApp engine worker is not running");
  worker.postMessage(msg);
}

function rejectAllPending(message: string): void {
  for (const [id, p] of pendingCalls) {
    clearTimeout(p.timer);
    pendingCalls.delete(id);
    p.reject(new Error(message));
  }
}

function handleWireMessage(msg: any): void {
  if (!msg || typeof msg !== "object") return;
  if (msg.kind === "res") {
    const p = pendingCalls.get(msg.id);
    if (!p) return;
    clearTimeout(p.timer);
    pendingCalls.delete(msg.id);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(String(msg.error || "WhatsApp engine call failed")));
    return;
  }
  if (msg.kind === "evt") {
    if (msg.evt === "state" && msg.snap) cachedSnap = msg.snap as EngineSnapshot;
    else if (msg.evt === "delivery") noteDelivery(String(msg.msgId || ""), Number(msg.status || DELIVERED));
  }
}

async function ensureWorker(): Promise<void> {
  if (fakeWorkerReady) return;
  if (workerReadyP) return workerReadyP;
  workerReadyP = (async () => {
    const { Worker } = await import("node:worker_threads");
    const worker = new Worker(new URL("./whatsapp-engine.worker.js", import.meta.url));
    workerRef = worker;
    worker.on("message", handleWireMessage);
    const crashed = new Promise<never>((_, reject) => {
      worker.once("exit", () => reject(new Error("the WhatsApp engine stopped unexpectedly")));
      worker.once("error", (err) => reject(new Error(`the WhatsApp engine failed: ${String((err as any)?.message || err)}`)));
    });
    crashed.catch(() => {
      // The worker died: drop every pending call and forget BOTH the worker
      // and the resolved backend, so the next bridge call respawns a fresh
      // worker (or falls back to in-process if spawning keeps failing). The
      // fresh worker pins the same folders and re-logins from the persisted
      // session — the same recovery path as after an app restart.
      workerRef = null;
      workerReadyP = null;
      resolvedBackend = null;
      rejectAllPending("the WhatsApp engine stopped unexpectedly and is restarting");
    });
    // Handshake: hand over the real folders, then wait for the ack. The
    // worker pins the auth dir itself (it has no electron module) and pushes
    // its first snapshot on init.
    const authDir = electronUserData() ? path.join(electronUserData()!, "whatsapp", "auth") : null;
    const initId = workerSeq++;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingCalls.delete(initId);
        reject(new Error("the WhatsApp engine did not start in time"));
      }, 30_000);
      pendingCalls.set(initId, {
        resolve: () => { clearTimeout(timer); resolve(); },
        reject: (e) => { clearTimeout(timer); reject(e); },
        timer,
      });
      try {
        postToWorker({ kind: "init", id: initId, authDir, userData: electronUserData() } satisfies InitMsg);
      } catch (err: any) {
        clearTimeout(timer);
        pendingCalls.delete(initId);
        reject(new Error(`could not start the WhatsApp engine worker: ${String(err?.message || err)}`));
      }
    });
  })();
  // Never leave a broken ready-promise cached: a failed spawn must fall
  // through to the direct backend on the next call, not poison everything.
  workerReadyP.catch(() => { workerReadyP = null; workerRef = null; });
  return workerReadyP;
}

async function workerCall<T>(fn: string, ...args: any[]): Promise<T> {
  await ensureWorker();
  const id = workerSeq++;
  const capMs = RPC_CAPS[fn] || DEFAULT_RPC_CAP_MS;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCalls.delete(id);
      reject(new Error(`the WhatsApp engine took too long for ${fn} — try again`));
    }, capMs);
    pendingCalls.set(id, { resolve, reject, timer });
    try {
      postToWorker({ kind: "req", id, fn, args } satisfies ReqMsg);
    } catch (err: any) {
      clearTimeout(timer);
      pendingCalls.delete(id);
      reject(new Error(String(err?.message || err)));
    }
  });
}

function workerBackend(): EngineBackend {
  return {
    start: (v) => workerCall("startEngine", v),
    maybeStart: () => workerCall("maybeStartEngine"),
    stop: (o) => workerCall("stopEngine", o),
    qr: (w) => workerCall("currentQr", w),
    pairingCode: (p, w) => workerCall("requestPairingCode", p, w),
    resolveJid: (p) => workerCall("resolveJid", p),
    sendText: (j, t) => workerCall("engineSendText", j, t),
    sendDocument: (j, pdf, f, c) => workerCall("engineSendDocument", j, pdf, f, c),
    flushAuth: (m) => workerCall("flushAuthWrites", m),
    drainWrites: (t) => workerCall("drainAuthWrites", t),
    snapshotNow: () => workerCall("snapshotAuthNow"),
    refreshState: () => workerCall("refreshState").then(() => undefined),
    hasSession: () => workerCall("hasPersistedSession"),
    clearLegacy: () => workerCall("clearLegacyWahaData").then(() => undefined),
  };
}

// ---- Backend selection ----
export type EngineBackendMode = "worker" | "direct" | "auto";
let backendMode: EngineBackendMode =
  (process.env.MMS_WA_ENGINE as EngineBackendMode) || "auto";
let backendOverride: EngineBackend | null = null;   // test seam — full object
let resolvedBackend: EngineBackend | null = null;

export function setEngineBackendForTests(mode: EngineBackendMode | EngineBackend | null): void {
  backendOverride = null;
  if (mode === null) backendMode = (process.env.MMS_WA_ENGINE as EngineBackendMode) || "auto";
  else if (mode === "worker" || mode === "direct" || mode === "auto") backendMode = mode;
  else backendOverride = mode as EngineBackend;
  resolvedBackend = null;
  directEnginePromise = null;
}

async function backend(): Promise<EngineBackend> {
  if (backendOverride) return backendOverride;
  if (resolvedBackend) return resolvedBackend;
  const mode = backendMode === "auto"
    ? ((process as any).type === "browser" ? "worker" : "direct")
    : backendMode;
  if (mode === "worker") {
    try {
      const wb = workerBackend();
      await ensureWorker(); // fail FAST here so the fallback below can engage
      resolvedBackend = wb;
      return wb;
    } catch (err: any) {
      console.warn("[whatsapp] engine worker unavailable — running the engine in-process this session:", (err as Error)?.message || err);
      resolvedBackend = await directBackend();
      return resolvedBackend;
    }
  }
  resolvedBackend = await directBackend();
  return resolvedBackend;
}

// ---------------------------------------------------------------------------
// Exported surface — the exact names whatsapp.service.ts / whatsapp-ipc.ts
// imported from the engine module before the worker split.
// ---------------------------------------------------------------------------

export async function startEngine(voluntary = false): Promise<void> {
  return (await backend()).start(voluntary);
}

export async function maybeStartEngine(): Promise<void> {
  return (await backend()).maybeStart();
}

export async function stopEngine(opts: { logout?: boolean } = {}): Promise<void> {
  return (await backend()).stop(opts);
}

export async function currentQr(waitMs = 25000): Promise<string> {
  return (await backend()).qr(waitMs);
}

export async function requestPairingCode(phone: string, waitMs = 20000): Promise<string> {
  return (await backend()).pairingCode(phone, waitMs);
}

export async function resolveJid(phone: string): Promise<string> {
  return (await backend()).resolveJid(phone);
}

export async function engineSendText(jid: string, text: string): Promise<{ id: string }> {
  return (await backend()).sendText(jid, text);
}

export async function engineSendDocument(jid: string, pdf: Buffer, fileName: string, caption: string): Promise<{ id: string }> {
  return (await backend()).sendDocument(jid, pdf, fileName, caption);
}

export async function flushAuthWrites(maxMs = 3000): Promise<boolean> {
  return (await backend()).flushAuth(maxMs);
}

export async function drainAuthWrites(timeoutMs = 2500): Promise<void> {
  return (await backend()).drainWrites(timeoutMs);
}

export async function snapshotAuthNow(): Promise<boolean> {
  return (await backend()).snapshotNow();
}

export async function clearLegacyWahaData(): Promise<void> {
  return (await backend()).clearLegacy();
}

/** Synchronous engine snapshot — served from the cache the engine's state
 *  events keep fresh. The service layer reads this on every status poll; it
 *  must stay sync (that is why the worker pushes snapshots instead of the
 *  main process polling for them). */
export function engineState(): EngineSnapshot {
  return cachedSnap;
}

/** Synchronous session gate with the engine's exact user-facing guidance.
 *  The socket itself lives in the worker — the main process only needs the
 *  connected/QR state to refuse sends with actionable messages. */
export function requireConnectedSocket(): void {
  requireConnectedFromCache();
}

export function isDelivered(msgId: string): boolean {
  return !!msgId && (deliveryStatus.get(msgId) || 0) >= DELIVERED;
}

/** Resolve once the mirrored delivery tracker confirms `msgId`. */
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

export function onDelivery(cb: (msgId: string) => void): () => void {
  deliveryListeners.add(cb);
  return () => { deliveryListeners.delete(cb); };
}

/** <userData>/whatsapp — resolved in the MAIN process (the send throttle and
 *  its persisted counters live here, not in the worker). */
export function whatsappStoreDir(): string | null {
  const base = electronUserData();
  return base ? path.join(base, "whatsapp") : null;
}

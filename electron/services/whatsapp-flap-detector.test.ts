/*
 * Connection state machine — the "after restart it connects and disconnects
 * over and over" regression suite.
 *
 * Two root causes are pinned here, both with fake sockets and faked timers:
 *
 *  1. STALE-SOCKET CONTAMINATION. Baileys emits connection.update from its
 *     internal async flows, so a SUPERSEDED socket's late close used to land
 *     on the module state AFTER the replacement socket had been created —
 *     nulling the live socket and firing a phantom reconnect, which the next
 *     late event undid, forever. Events from any socket that is no longer the
 *     live one are now ignored.
 *
 *  2. FLAPPING WITHOUT A STOP CONDITION. A session the server drops within
 *     seconds of every open (stream errors, a conflicting second client on
 *     the same pairing, app-state-sync mismatches) was reconnected with a
 *     30 s-capped backoff forever — the user watched connect → disconnect →
 *     connect endlessly. Five consecutive short-lived sessions now hold the
 *     engine in a stable, explained state; a manual Connect retries.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  startEngine, stopEngine, maybeStartEngine, engineState, hasPersistedSession,
  setAuthDirForTests, setEngineDepsForTests,
} from "./whatsapp-engine.service.js";

// What Baileys writes after a QR pairing (see the persistence suite).
const QR_PAIRED_CREDS = {
  registrationId: 123,
  advSecretKey: "adv-secret",
  account: { details: "CAE", accountSignatureKey: "sig", accountSignature: "sig2", deviceSignature: "dev" },
  me: { id: "919876543210:12@s.whatsapp.net", name: "Mahallu Office" },
  signalIdentities: [{ identifier: { name: "919876500000:0@lid", deviceId: 0 }, identifierKey: "key" }],
  platform: "android",
  registered: true,
};

let root = "";
let dir = "";
let sockets: FakeSock[] = [];

type FakeSock = {
  ev: { on: (type: string, handler: (payload: any) => void) => void };
  user: { id: string; name: string };
  end: () => Promise<void>;
  logout: () => Promise<void>;
  emit: (type: string, payload: any) => void;
};

function makeFakeSocket(): FakeSock {
  const handlers: Record<string, Array<(payload: any) => void>> = {};
  return {
    ev: { on: (type, handler) => { (handlers[type] ||= []).push(handler); } },
    user: { id: "919876543210:12@s.whatsapp.net", name: "Mahallu Office" },
    end: async () => {},
    logout: async () => {},
    emit: (type, payload) => { for (const h of handlers[type] || []) h(payload); },
  };
}

/** A generic server-side close that is NOT a session rejection
 *  (480 timedOut — the kind a real network hiccup produces). */
function streamClose(sock: FakeSock): void {
  sock.emit("connection.update", {
    connection: "close",
    lastDisconnect: { error: { output: { statusCode: 408 }, message: "Connection Timed Out" } },
  });
}

function openNow(sock: FakeSock): void {
  sock.emit("connection.update", { connection: "open" });
}

/** Fire one open→close cycle and ride the reconnect ladder to the live socket. */
async function flapOnce(advanceMs: number): Promise<FakeSock> {
  const live = sockets[sockets.length - 1];
  openNow(live);
  streamClose(live);
  await vi.advanceTimersByTimeAsync(advanceMs + 50);
  return sockets[sockets.length - 1];
}

beforeEach(() => {
  vi.useFakeTimers();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "mms-wa-flap-"));
  dir = path.join(root, "auth");
  fs.mkdirSync(dir, { recursive: true });
  setAuthDirForTests(dir);
  sockets = [];
  setEngineDepsForTests({
    socketFactory: () => { const s = makeFakeSocket(); sockets.push(s); return s as any; },
    waVersion: [2, 3000, 101],
  });
});

afterEach(async () => {
  try { await stopEngine(); } catch { /* best effort */ }
  setEngineDepsForTests();
  setAuthDirForTests(undefined);
  vi.useRealTimers();
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("stale-socket guard — a superseded socket cannot move the state machine", () => {
  it("a late close from the old socket does not phantom-disconnect the live one", async () => {
    await startEngine(true);
    const a = sockets[0];
    openNow(a);
    expect(engineState().state).toBe("CONNECTED");

    // Drop the first socket; the ladder rebuilds with a new one.
    streamClose(a);
    await vi.advanceTimersByTimeAsync(1100);
    expect(sockets.length).toBe(2);
    const b = sockets[1];
    openNow(b);
    expect(engineState().state).toBe("CONNECTED");

    // NOW the dead socket's late close arrives. Before the guard this nulled
    // socket B's state and fired a phantom reconnect.
    streamClose(a);
    streamClose(a);

    expect(engineState().state).toBe("CONNECTED");
    expect(engineState().connected).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets.length).toBe(2); // no phantom reconnect was scheduled
  });
});

describe("flap detector — short-lived sessions stop the reconnect loop", () => {
  it("holds after five within-seconds drops, ignores the status-poll nudge, retries on manual Connect", async () => {
    fs.writeFileSync(path.join(dir, "creds.json"), JSON.stringify(QR_PAIRED_CREDS));
    await startEngine(true);

    // 1s, 2s, 4s, 8s ladders between the flaps (login drops are instant).
    await flapOnce(1_000);
    await flapOnce(2_000);
    await flapOnce(4_000);
    await flapOnce(8_000);
    const fifth = sockets[sockets.length - 1];
    openNow(fifth);
    streamClose(fifth);

    // The loop is held with an explained, stable state instead of flashing.
    expect(engineState().state).toBe("IDLE");
    expect(engineState().lastError).toMatch(/keeps dropping the connection/);
    const socketsAtHalt = sockets.length;

    // No automatic retry fires, however long we wait; the status poll's
    // auto-start respects the halt as well.
    await vi.advanceTimersByTimeAsync(120_000);
    maybeStartEngine();
    expect(sockets.length).toBe(socketsAtHalt);

    // A deliberate Connect is the retry — the halt is not a dead end.
    await startEngine(true);
    expect(sockets.length).toBe(socketsAtHalt + 1);
    openNow(sockets[sockets.length - 1]);
    expect(engineState().state).toBe("CONNECTED");
  });

  it("a healthy long session clears the tally (ordinary network drops keep auto-healing)", async () => {
    fs.writeFileSync(path.join(dir, "creds.json"), JSON.stringify(QR_PAIRED_CREDS));
    await startEngine(true);
    const first = sockets[0];
    openNow(first);
    // Stay connected for two minutes (well past the 90 s heal window)…
    await vi.advanceTimersByTimeAsync(120_000);
    // …then drop. This counts as an ordinary network drop, NOT a flap.
    streamClose(first);
    expect(engineState().state).toBe("RECONNECTING");
    await vi.advanceTimersByTimeAsync(1_100);
    expect(sockets.length).toBe(2); // auto-reconnect fired immediately
  });
});

describe("never-opens loop guard — a stale pairing is retired, not looped", () => {
  it("retires the session after 4 server closes without a single open", async () => {
    fs.writeFileSync(path.join(dir, "creds.json"), JSON.stringify(QR_PAIRED_CREDS));
    fs.writeFileSync(path.join(dir, "pre-key-1.json"), JSON.stringify({ keyId: 1 }));
    expect(hasPersistedSession()).toBe(true);
    await startEngine(true);

    // 4 attempts, 4 closes, never an open (1s, 2s, 4s ladders between).
    for (const delay of [0, 1_000, 2_000, 4_000]) {
      if (delay) await vi.advanceTimersByTimeAsync(delay + 50);
      streamClose(sockets[sockets.length - 1]);
    }

    expect(engineState().state).toBe("IDLE");
    expect(engineState().lastError).toMatch(/could not re-establish the saved session/);
    // The pairing is retired (recoverable in auth-retired-*), not looped.
    expect(hasPersistedSession()).toBe(false);
    expect(fs.readdirSync(root).some((n) => n.startsWith("auth-retired-"))).toBe(true);
    // And no further automatic attempts pile up.
    const atEnd = sockets.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sockets.length).toBe(atEnd);
  });
});

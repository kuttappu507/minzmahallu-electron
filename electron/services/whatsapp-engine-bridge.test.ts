/*
 * WhatsApp engine bridge (v2.6.12) — the seam that took the whole Baileys
 * engine off the Electron main process.
 *
 * Covered here:
 *   1. The main-process snapshot cache keeps engineState() synchronous with
 *      the same shape the service layer has always consumed.
 *   2. requireConnectedSocket() (now cache-based) keeps its exact actionable
 *      guidance errors — send gates never leak protocol noise.
 *   3. The mirrored delivery tracker drives isDelivered/waitForDelivery with
 *      the same once-per-id semantics the engine's own tracker has.
 *   4. THE PROTOCOL: a full request/response round trip against the REAL
 *      worker-side dispatcher and the REAL engine module, over an in-memory
 *      port pair — the exact wire contract the worker thread speaks in the
 *      packaged app (init handshake → folder pinning → state events →
 *      replies, including the verified flush path).
 */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  engineState, requireConnectedSocket, isDelivered, waitForDelivery, onDelivery,
  whatsappStoreDir, maybeStartEngine, stopEngine, flushAuthWrites,
  __noteDeliveryForTests, setEngineBackendForTests,
  __attachFakeWorkerForTests, __detachFakeWorkerForTests, __bridgeReceiveForTests,
  createEngineWorkerSide,
} from "./whatsapp-engine-bridge.js";
import { setAuthDirForTests } from "./whatsapp-engine.service.js";

// Isolated per-run temp base. NOTE: under vitest the bridge's
// whatsappStoreDir() returns null (the electron module is invisible to
// createRequire) — deriving a folder from it would land in process.cwd(),
// so the tests own their temp tree explicitly.
const testBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "mms-bridge-test-"));

function stubAuthDir(): string {
  return path.join(testBaseDir, "whatsapp", "auth");
}

function writePairedCreds(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  // `registered: true` is the marker the engine trusts (see isPairedCreds).
  fs.writeFileSync(path.join(dir, "creds.json"), JSON.stringify({ registered: true, me: "919999000001@s.whatsapp.net" }), "utf-8");
}

afterEach(() => {
  __detachFakeWorkerForTests();
  setEngineBackendForTests(null);
  setAuthDirForTests(undefined);
  try { fs.rmSync(testBaseDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("engine bridge — main-process sync surface", () => {
  it("engineState() keeps its synchronous shape outside Electron (direct backend)", () => {
    setEngineBackendForTests("direct");
    const snap = engineState();
    for (const key of ["state", "connected", "hasSession", "number", "name", "qrReady", "lastError", "since"]) {
      expect(key in snap).toBe(true);
    }
    expect(typeof snap.connected).toBe("boolean");
    expect(snap.state).toBe("IDLE");
  });

  it("requireConnectedSocket() throws the same actionable guidance as the engine", () => {
    setEngineBackendForTests("direct");
    // IDLE cache (nothing connected): the "open the page, connect and scan"
    // message — NOT a protocol error.
    expect(() => requireConnectedSocket()).toThrow(
      "WhatsApp is not connected yet. Open the WhatsApp page, connect and scan the QR code, then try again."
    );
  });

  it("isDelivered/waitForDelivery mirror the engine's once-per-id semantics", async () => {
    setEngineBackendForTests("direct");
    expect(isDelivered("")).toBe(false);
    expect(isDelivered("MSG-A")).toBe(false);
    __noteDeliveryForTests("MSG-A");
    expect(isDelivered("MSG-A")).toBe(true);
    // idempotent — a lower/duplicate status never re-fires listeners
    __noteDeliveryForTests("MSG-A");
    // a wait started BEFORE the ack resolves through the listener…
    const p = waitForDelivery("MSG-B", 2_000);
    __noteDeliveryForTests("MSG-B");
    await expect(p).resolves.toBe(true);
    // …and a wait for an ack that never lands times out with false.
    await expect(waitForDelivery("MSG-NEVER", 20)).resolves.toBe(false);
    // unsubscribe works
    const off = onDelivery(() => { throw new Error("should not fire after off()"); });
    off();
    __noteDeliveryForTests("MSG-C");
  });
});

describe("engine bridge — worker protocol (real dispatcher, real engine, fake port)", () => {
  it("runs the full init handshake and routes calls through the wire contract", async () => {
    setEngineBackendForTests("worker");
    // The "worker": the REAL dispatcher, posting straight back into the
    // bridge's real main-side receiver. No thread — the protocol is what
    // is under test.
    createEngineWorkerSide(
      (msg) => __bridgeReceiveForTests(msg),
      (handler) => { (globalThis as any).__bridgeTestWorkerHandler = handler; }
    );
    __attachFakeWorkerForTests((msg) => (globalThis as any).__bridgeTestWorkerHandler(msg));

    // First use = spawn + init handshake + first state snapshot event.
    // The folder is pinned through the engine's own seam (under vitest the
    // electron stub is invisible to createRequire, so the init message
    // carries null and must NOT clobber the pin). Unpaired here — no socket
    // can ever start; pure state machine, no network.
    setAuthDirForTests(stubAuthDir());
    await expect(stopEngine()).resolves.toBeUndefined();
    const snap = engineState();
    expect(snap.state).toBe("IDLE");
    expect(typeof snap.hasSession).toBe("boolean");

    // A second call travels the same wire (single-flight spawn already done).
    await expect(stopEngine()).resolves.toBeUndefined();

    // The verified flush path runs against the pinned folder: plant a
    // COMPLETED pairing there and the worker reports it as safely on disk
    // (pure disk work — exactly what the quit path awaits).
    writePairedCreds(stubAuthDir());
    await expect(flushAuthWrites(500)).resolves.toBe(true);
  });

  it("falls back to the direct backend when the worker cannot be spawned", async () => {
    setEngineBackendForTests("worker");
    // No fake worker attached and no built worker file exists under vitest —
    // the spawn fails and the bridge MUST degrade to in-process execution
    // (a broken install loses nothing) instead of dead-ending WhatsApp.
    setAuthDirForTests(os.tmpdir());
    await expect(maybeStartEngine()).resolves.toBeUndefined();
    expect(engineState().state).toBe("IDLE");
  });
});

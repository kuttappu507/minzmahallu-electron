import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { getDB } from "../db/connection.js";

const require = createRequire(import.meta.url);
// Electron's `app`/`utilityProcess` are provided by the runtime, not by the
// npm package, so they are resolved lazily. Inside Electron this returns the
// real module; in plain Node (tests/smoke) it is never called because the
// runtime is not available and isWahaInstalled() short-circuits.
function electron() {
  return require("electron") as typeof import("electron");
}

const PORT = 30455;
const SESSION = "mahallu";
// How long a failed start attempt blocks further automatic restarts. Without
// this, the 6-second status polling from the UI would relaunch a crashing
// service forever.
const RESTART_BACKOFF_MS = 60_000;

export type WahaState = "NOT_INSTALLED" | "STARTING" | "RUNNING" | "STOPPED" | "CRASHED";

let child: import("electron").UtilityProcess | null = null;
let state: WahaState = "STOPPED";
let lastError = "";
let stateSince = Date.now();
let lastStartAttempt = 0;
let startPromise: Promise<void> | null = null;

function app() {
  return electron().app;
}
function runtimeRoot() {
  return app().isPackaged
    ? path.join(process.resourcesPath, "resources", "waha")
    : path.join(app().getAppPath(), "resources", "waha");
}
function entrypoint() {
  return path.join(runtimeRoot(), "dist", "main.js");
}
function sessionRoot() {
  return path.join(app().getPath("userData"), "whatsapp", "sessions");
}
function filesRoot() {
  return path.join(app().getPath("userData"), "whatsapp", "files");
}
function apiKey() {
  return String((getDB().prepare("SELECT api_key FROM whatsapp_settings WHERE id=1").get() as any)?.api_key || "");
}

function setState(next: WahaState, error = "") {
  state = next;
  stateSince = Date.now();
  if (error !== undefined) lastError = error;
}

/** Is the bundled WAHA runtime present on disk? (No Electron APIs are called
 *  when Electron itself cannot be loaded — plain-Node test runs report false.) */
export function isWahaInstalled(): boolean {
  let e: ReturnType<typeof electron> | null = null;
  try { e = electron(); } catch { return false; }
  if (!e) return false;
  try {
    const root = e.app.isPackaged
      ? path.join(process.resourcesPath, "resources", "waha")
      : path.join(e.app.getAppPath(), "resources", "waha");
    return fs.existsSync(path.join(root, "dist", "main.js"));
  } catch {
    return false;
  }
}

/** Backwards-compatible alias — the old name implied the service answers, but
 *  this only checks that the runtime files exist. */
export const isWahaAvailable = isWahaInstalled;

export function wahaProcessState() {
  return { running: state === "RUNNING", pid: child?.pid ?? null, error: lastError };
}

/** Full runtime snapshot for the UI: installation, process state, last error. */
export function wahaState() {
  const installed = isWahaInstalled();
  return {
    installed,
    state: installed ? state : ("NOT_INSTALLED" as WahaState),
    running: installed && state === "RUNNING",
    starting: installed && state === "STARTING",
    pid: child?.pid ?? null,
    lastError: installed ? lastError : "WhatsApp messaging service is not installed in this build",
    since: stateSince,
  };
}

/** WAHA protects /health with the API key too (401 without it), so the probe
 *  must authenticate — otherwise a healthy service never passes. */
export async function isWahaHealthy(timeoutMs = 2500): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/health`, {
      headers: { Accept: "application/json", "X-Api-Key": apiKey() },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isWahaHealthy(1500)) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("WhatsApp messaging service did not become ready in time");
}

/** Start the bundled service. Single-flight: concurrent callers share one
 *  attempt. Resolves only once /health answers. */
export async function startWaha(): Promise<void> {
  if (!isWahaInstalled()) {
    lastError = "WhatsApp messaging service is not installed in this build";
    state = "NOT_INSTALLED";
    throw new Error(lastError);
  }
  // Already healthy (this instance or another app instance on the same port).
  if (await isWahaHealthy(1500)) {
    setState("RUNNING", "");
    return;
  }
  if (startPromise) return startPromise;

  lastStartAttempt = Date.now();
  setState("STARTING", "");
  startPromise = (async () => {
    // Replace any leftover/hung process from a previous attempt.
    try { child?.kill(); } catch { /* already gone */ }
    child = null;
    fs.mkdirSync(sessionRoot(), { recursive: true });
    fs.mkdirSync(filesRoot(), { recursive: true });
    const { utilityProcess } = electron();
    child = utilityProcess.fork(entrypoint(), [], {
      serviceName: "Mahallu Manager WhatsApp Service",
      cwd: runtimeRoot(),
      stdio: "pipe",
      env: {
        ...process.env,
        WHATSAPP_API_PORT: String(PORT),
        WHATSAPP_API_HOSTNAME: "127.0.0.1",
        WHATSAPP_DEFAULT_ENGINE: "NOWEB",
        WHATSAPP_START_SESSION: SESSION,
        WAHA_NOWEB_WA_VERSION: "auto-web",
        WAHA_LOCAL_STORE_BASE_DIR: sessionRoot(),
        WHATSAPP_FILES_FOLDER: filesRoot(),
        WHATSAPP_DOWNLOAD_MEDIA: "false",
        WAHA_PRINT_QR: "false",
        WAHA_LOG_LEVEL: "error",
        WAHA_HTTP_LOG_LEVEL: "error",
        WAHA_DASHBOARD_ENABLED: "false",
        WHATSAPP_SWAGGER_ENABLED: "false",
        WAHA_API_KEY: apiKey(),
      },
    });
    child.stdout?.on("data", (data) => console.log(`[WAHA] ${String(data).trimEnd()}`));
    child.stderr?.on("data", (data) => console.warn(`[WAHA] ${String(data).trimEnd()}`));
    child.on("exit", (code) => {
      console.warn(`[WAHA] exited with code ${code ?? "unknown"}`);
      child = null;
      if (state === "RUNNING" || state === "STARTING") {
        setState("CRASHED", state === "STARTING"
          ? `WhatsApp service stopped during startup (exit code ${code ?? "unknown"})`
          : `WhatsApp service stopped unexpectedly (exit code ${code ?? "unknown"})`);
      } else {
        state = "STOPPED";
      }
    });
    child.on("error", (err: any) => {
      child = null;
      setState("CRASHED", String(err?.message || err));
      console.warn("[WAHA] process error", err);
    });
    try {
      await waitForHealth();
      setState("RUNNING", "");
    } finally {
      startPromise = null;
    }
  })();
  return startPromise;
}

/** Fire-and-forget auto-(re)start used by status polling: respects the
 *  backoff window so a crashing service is not relaunched on every poll. */
export function maybeStartWaha(): void {
  if (!isWahaInstalled()) return;
  if (state === "RUNNING" || state === "STARTING" || startPromise) return;
  if (Date.now() - lastStartAttempt < RESTART_BACKOFF_MS) return;
  void startWaha().catch(() => { /* state/lastError already recorded */ });
}

/**
 * Ensure the local messaging service answers /health. Used by interactive
 * actions (Connect, Send) which are allowed to wait for the service.
 * Returns a snapshot; never throws for a merely-slow service.
 */
export async function ensureWahaRunning(waitMs = 0): Promise<{ healthy: boolean; state: WahaState; lastError: string }> {
  if (!isWahaInstalled()) return { healthy: false, state: "NOT_INSTALLED", lastError: "WhatsApp messaging service is not installed in this build" };
  if (await isWahaHealthy()) {
    if (state !== "RUNNING") setState("RUNNING", "");
    return { healthy: true, state: "RUNNING", lastError: "" };
  }
  if (!startPromise && Date.now() - lastStartAttempt >= RESTART_BACKOFF_MS) {
    void startWaha().catch(() => { /* recorded in state */ });
  }
  if (startPromise && waitMs > 0) {
    await Promise.race([startPromise.catch(() => { /* recorded */ }), new Promise((resolve) => setTimeout(resolve, waitMs))]);
    if (await isWahaHealthy()) return { healthy: true, state: "RUNNING", lastError: "" };
  }
  return { healthy: false, state, lastError };
}

export async function stopWaha() {
  if (!child?.pid) return;
  try { child.kill(); } catch {}
  child = null;
  state = "STOPPED";
}
export function getWahaPort() {
  return PORT;
}

import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { getDB } from "../db/connection.js";

const require = createRequire(import.meta.url);
// Electron's `app`/`utilityProcess` are provided by the runtime, not by the
// npm package, so they are resolved lazily. Inside Electron this returns the
// real module; in plain Node (tests/smoke) it is never called because the
// runtime is not available and isWahaAvailable() short-circuits.
function electron() {
  return require("electron") as typeof import("electron");
}

const PORT = 30455;
const SESSION = "mahallu";
let child: import("electron").UtilityProcess | null = null;
let lastError = "";

function runtimeRoot() {
  return app().isPackaged
    ? path.join(process.resourcesPath, "resources", "waha")
    : path.join(app().getAppPath(), "resources", "waha");
}
function app() {
  return electron().app;
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

export function isWahaAvailable() {
  // Electron's runtime APIs are required to locate the bundled service. If
  // Electron itself cannot be loaded (dev-only checks, broken install), the
  // service is simply reported as unavailable instead of throwing.
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
export function wahaProcessState() {
  return { running: !!child?.pid, pid: child?.pid ?? null, error: lastError };
}

export async function startWaha() {
  if (child?.pid) return;
  if (!isWahaAvailable()) {
    lastError = "Bundled WhatsApp service is not installed";
    throw new Error(lastError);
  }
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
  });
  child.on("error", (err: any) => {
    lastError = String(err?.message || err);
    console.warn("[WAHA] process error", err);
    child = null;
  });
  await waitForHealth();
}

async function waitForHealth(timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      // WAHA protects /health with the API key too (401 without it), so the
      // probe must authenticate — otherwise a healthy service never passes.
      const response = await fetch(`http://127.0.0.1:${PORT}/health`, {
        headers: { Accept: "application/json", "X-Api-Key": apiKey() },
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) return;
    } catch {
      // not ready yet — retry
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("WhatsApp service did not become ready");
}

export async function stopWaha() {
  if (!child?.pid) return;
  try { child.kill(); } catch {}
  child = null;
}
export function getWahaPort() {
  return PORT;
}

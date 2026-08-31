import { app, utilityProcess, UtilityProcess } from "electron";
import path from "node:path";
import fs from "node:fs";

const PORT = 30455;
let child: UtilityProcess | null = null;
let lastError = "";

function runtimeRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, "waha");
  return path.join(app.getAppPath(), "resources", "waha");
}

function entrypoint() {
  return path.join(runtimeRoot(), "dist", "main.js");
}

function sessionRoot() {
  return path.join(app.getPath("userData"), "whatsapp", "sessions");
}

function filesRoot() {
  return path.join(app.getPath("userData"), "whatsapp", "files");
}

export function isWahaAvailable() {
  return fs.existsSync(entrypoint());
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
  const apiKey = require("./whatsapp.service.js").__getInternalApiKey?.() || "";
  child = utilityProcess.fork(entrypoint(), [], {
    serviceName: "Mahallu Manager WhatsApp Service",
    cwd: runtimeRoot(),
    stdio: "pipe",
    env: {
      ...process.env,
      WHATSAPP_API_PORT: String(PORT),
      WHATSAPP_API_HOSTNAME: "127.0.0.1",
      WHATSAPP_DEFAULT_ENGINE: "NOWEB",
      WAHA_NOWEB_WA_VERSION: "auto-web",
      WAHA_LOCAL_STORE_BASE_DIR: sessionRoot(),
      WHATSAPP_FILES_FOLDER: filesRoot(),
      WHATSAPP_DOWNLOAD_MEDIA: "false",
      WAHA_PRINT_QR: "false",
      WAHA_LOG_LEVEL: "error",
      WAHA_HTTP_LOG_LEVEL: "error",
      WAHA_DASHBOARD_ENABLED: "false",
      WHATSAPP_SWAGGER_ENABLED: "false",
      WAHA_API_KEY: apiKey,
    },
  });
  child.stdout?.on("data", (data) => console.log(`[WAHA] ${String(data).trimEnd()}`));
  child.stderr?.on("data", (data) => console.warn(`[WAHA] ${String(data).trimEnd()}`));
  child.on("exit", (code) => { console.warn(`[WAHA] exited with code ${code ?? "unknown"}`); child = null; });
  child.on("error", (err) => { lastError = err.message; console.warn("[WAHA] process error", err); child = null; });
  await waitForHealth();
}

async function waitForHealth(timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error("WhatsApp service did not become ready");
}

export async function stopWaha() {
  if (!child?.pid) return;
  try { child.kill(); } catch {}
  child = null;
}

export function getWahaPort() { return PORT; }

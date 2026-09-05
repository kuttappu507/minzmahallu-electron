// Screenshot the Splash screen mid-boot (theme-green card) for visual check.
// Modeled on scripts/shot-dashboard.mjs — CDP attach, capture at ~1.2s.
// Usage: DISPLAY must point at an Xvfb; node scripts/shot-splash.mjs [out.png]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "mms-shot-home-"));
const DEBUG_PORT = 9347;
const OUT = process.argv[2] || "/home/z/my-project/download/splash-green.png";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForApp() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const pages = await res.json();
      const page = pages.find((p) => p.type === "page" && /index\.html|MMS/i.test(p.title + p.url));
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error("app window never exposed a CDP page");
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); delete pending.msg; pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const ready = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  return { ready, send, close: () => ws.close() };
}

const electron = spawn("npx", ["electron", ".", "--disable-gpu", `--remote-debugging-port=${DEBUG_PORT}`], {
  cwd: ROOT,
  env: { ...process.env, HOME, XDG_CONFIG_HOME: path.join(HOME, ".config"), DISPLAY: process.env.DISPLAY, NODE_ENV: "", ELECTRON_ENABLE_LOGGING: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
electron.stderr.on("data", (d) => process.stderr.write(`[app-err] ${d}`));

try {
  const wsUrl = await waitForApp();
  const conn = cdp(wsUrl);
  await conn.ready;
  console.log("[shot] attached to renderer");

  // wait for the splash element to appear, then capture mid-boot
  let seen = false;
  for (let i = 0; i < 20 && !seen; i++) {
    const r = await conn.send("Runtime.evaluate", { expression: "!!document.querySelector('.splash-card')", returnByValue: true });
    seen = r.result?.value === true;
    if (!seen) await sleep(250);
  }
  await sleep(1100); // mid boot-steps (progress ~55%)
  const shot = await conn.send("Page.captureScreenshot", { format: "png" });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("[shot] saved:", OUT, fs.statSync(OUT).size, "bytes");
  conn.close();
} finally {
  try { electron.kill("SIGTERM"); } catch {}
  await sleep(1200);
  try { electron.kill("SIGKILL"); } catch {}
  process.exit(0);
}

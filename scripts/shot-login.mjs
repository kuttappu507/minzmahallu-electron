// Screenshot the LOGIN screen to verify the new white logo on the green hero
// (logo sits in .login-logo-box, and the small mobile row uses .login-logo-box-sm).
// Usage: DISPLAY must point at an Xvfb; node scripts/shot-login.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "mms-shot-home-"));
const DEBUG_PORT = 9361;
const OUT = "/home/z/my-project/download/login-new-logo.png";
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("CDP timeout: " + method)); }, 20000);
    pending.set(id, (msg) => { clearTimeout(timer); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const ready = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    return r.result?.value;
  };
  return { ready, send, evaluate, close: () => ws.close() };
}

const electron = spawn("npx", ["electron", ".", `--remote-debugging-port=${DEBUG_PORT}`, "--disable-gpu"], {
  cwd: ROOT,
  env: { ...process.env, HOME, XDG_CONFIG_HOME: path.join(HOME, ".config"), DISPLAY: process.env.DISPLAY, NODE_ENV: "", ELECTRON_ENABLE_LOGGING: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
electron.stderr.on("data", (d) => process.stderr.write(`[app-err] ${d}`));
const watchdog = setTimeout(() => { console.error("[shot] WATCHDOG fired"); try { electron.kill("SIGKILL"); } catch {} process.exit(1); }, 90000);

try {
  const wsUrl = await waitForApp();
  const conn = cdp(wsUrl);
  await conn.ready;
  console.log("[shot] attached");
  // wait for the login form to mount
  let mounted = false;
  for (let i = 0; i < 20 && !mounted; i++) {
    mounted = await conn.evaluate("!!document.querySelector('.login-logo-box img, .login-wrap img')");
    if (!mounted) await sleep(500);
  }
  const probe = await conn.evaluate(`(() => {
    const imgs = [...document.querySelectorAll('.login-wrap img')];
    return imgs.map(i => ({ src: i.getAttribute('src'), w: i.clientWidth, h: i.clientHeight }));
  })()`);
  console.log("[shot] login images:", JSON.stringify(probe));
  await sleep(1200); // settle animations
  const shot = await conn.send("Page.captureScreenshot", { format: "png" });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("[shot] saved:", OUT, fs.statSync(OUT).size, "bytes");
  conn.close();
  clearTimeout(watchdog);
} catch (err) {
  console.error("[shot] FAILED:", err?.message || err);
  process.exitCode = 1;
} finally {
  try { electron.kill("SIGTERM"); } catch {}
  await sleep(1200);
  try { electron.kill("SIGKILL"); } catch {}
  process.exit(process.exitCode || 0);
}

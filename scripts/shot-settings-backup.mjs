// Screenshot the Settings -> Backup section showing the new mirror-folder row.
// Usage: DISPLAY must point at an Xvfb; node scripts/shot-settings-backup.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "mms-shot-home-"));
const DEBUG_PORT = 9377;
const OUT = "/home/z/my-project/download/settings-mirror-row.png";
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("CDP timeout: " + method)); }, 25000);
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
const watchdog = setTimeout(() => { console.error("[shot] WATCHDOG fired"); try { electron.kill("SIGKILL"); } catch {} process.exit(1); }, 120000);

try {
  const wsUrl = await waitForApp();
  const conn = cdp(wsUrl);
  await conn.ready;
  console.log("[shot] attached");
  let booted = false;
  for (let i = 0; i < 20 && !booted; i++) {
    booted = await conn.evaluate("!!(window.mms && window.mms.auth)");
    if (!booted) await sleep(500);
  }
  let form = "";
  for (let i = 0; i < 15 && form !== "SUBMITTED"; i++) {
    form = await conn.evaluate(`(() => {
      const setVal = (el, v) => {
        const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
        desc.set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const user = document.querySelector('input[autocomplete="username"], form input:not([type="password"])');
      const pass = document.querySelector('input[autocomplete="current-password"]');
      if (!user || !pass) return "MISSING_INPUTS";
      setVal(user, "admin"); setVal(pass, "Admin@2026");
      document.querySelector('form button[type="submit"]').click();
      return "SUBMITTED";
    })()`);
    if (form !== "SUBMITTED") await sleep(800);
  }
  await sleep(2500);
  await conn.evaluate("window.location.hash = '#/settings'");
  await sleep(2500);
  const probe = await conn.evaluate(`(() => {
    const inputs = [...document.querySelectorAll('input')];
    const mirror = inputs.find(i => (i.placeholder || '').length > 0 || true);
    const card = [...document.querySelectorAll('.card')].find(c => /Backup mirror folder|ബാക്കപ്പ് മിറർ/.test(c.textContent || ''));
    if (card) card.scrollIntoView({ block: 'center' });
    return { hasMirrorText: !!document.body.innerText.match(/Backup mirror folder|ബാക്കപ്പ് മിറർ/),
             hasBrowseBtn: [...document.querySelectorAll('button')].some(b => /Browse/.test(b.textContent || '')) };
  })()`);
  console.log("[shot] mirror row present:", JSON.stringify(probe));
  await sleep(1000);
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

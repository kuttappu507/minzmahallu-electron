// Screenshot the Dashboard page (stat cards) for visual verification.
// Modeled on scripts/smoke-electron.mjs — CDP attach, login, capture.
// Usage: DISPLAY must point at an Xvfb; node scripts/shot-dashboard.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "mms-shot-home-"));
const DEBUG_PORT = 9345;
const OUT = process.argv[2] || "/home/z/my-project/download/dashboard-stat-cards.png";
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

const electron = spawn("npx", ["electron", ".", `--remote-debugging-port=${DEBUG_PORT}`], {
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

  // wait for the bridge, then login and let the dashboard render
  let booted = false;
  for (let i = 0; i < 20 && !booted; i++) {
    const r = await conn.send("Runtime.evaluate", { expression: "!!(window.mms && window.mms.auth)", returnByValue: true });
    booted = r.result?.value === true;
    if (!booted) await sleep(500);
  }
  // Drive the REAL login form (React-controlled inputs need the native setter
  // trick so onChange fires; direct window.mms.auth.login() would bypass React
  // state and the UI would stay on the login screen).
  const fillForm = await conn.send("Runtime.evaluate", {
    awaitPromise: true, returnByValue: true,
    expression: `(() => {
      const setVal = (el, v) => {
        const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
        desc.set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const user = document.querySelector('input[autocomplete="username"], form input:not([type="password"])');
      const pass = document.querySelector('input[autocomplete="current-password"]');
      if (!user || !pass) return "MISSING_INPUTS";
      setVal(user, "admin");
      setVal(pass, "Admin@2026");
      const btn = document.querySelector('form button[type="submit"]');
      if (!btn) return "MISSING_BUTTON";
      btn.click();
      return "SUBMITTED";
    })()`,
  });
  console.log("[shot] form:", fillForm.result?.value);
  await sleep(5000); // dashboard data + animations

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

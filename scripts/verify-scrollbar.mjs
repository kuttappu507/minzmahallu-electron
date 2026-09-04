// Measure the ACTUAL rendered sidebar scrollbar thickness: force the nav to
// overflow (temporary style), then compare .navscroll offsetWidth vs
// clientWidth — the difference IS the scrollbar width.
// Usage: DISPLAY must point at an Xvfb; node scripts/verify-scrollbar.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "mms-sb-home-"));
const DEBUG_PORT = 9352;
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
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const ready = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  return { ready, send, close: () => ws.close() };
}
async function evaluate(conn, expression) {
  const r = await conn.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("renderer exception: " + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result?.value;
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

  let booted = false;
  for (let i = 0; i < 20 && !booted; i++) {
    booted = await evaluate(conn, `!!(window.mms && window.mms.auth)`);
    if (!booted) await sleep(500);
  }
  await evaluate(conn, `(() => {
    const setVal = (el, v) => {
      const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
      desc.set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const user = document.querySelector('input[autocomplete="username"], form input:not([type="password"])');
    const pass = document.querySelector('input[autocomplete="current-password"]');
    setVal(user, "admin"); setVal(pass, "Admin@2026");
    document.querySelector('form button[type="submit"]').click();
    return "submitted";
  })()`);
  await sleep(4000);

  const sb = await evaluate(conn, `(() => {
    const nav = document.querySelector('.navscroll');
    if (!nav) return { error: "NO_NAVSCROLL" };
    // Force overflow so the scrollbar is actually laid out
    const style = document.createElement('style');
    style.textContent = '.navscroll .navit{height:90px !important; line-height:90px !important}';
    document.head.appendChild(style);
    void nav.offsetHeight;
    const expanded = {
      overflowing: nav.scrollHeight > nav.clientHeight,
      scrollbarWidth: nav.offsetWidth - nav.clientWidth,
    };
    // collapse the sidebar (same measurement in the min state)
    return { expanded, navFound: true };
  })()`);
  console.log("[scrollbar] expanded state:", JSON.stringify(sb));

  // collapsed state: click the flap, re-measure
  const collapsed = await evaluate(conn, `(async () => {
    const flap = document.querySelector('.flap');
    if (!flap) return { note: 'NO_FLAP' };
    flap.click();
    await new Promise(r => setTimeout(r, 900));
    const nav = document.querySelector('.navscroll');
    const style = document.createElement('style');
    style.textContent = '.navscroll .navit{height:90px !important; line-height:90px !important}';
    document.head.appendChild(style);
    void nav.offsetHeight;
    return {
      sidebarMin: !!document.querySelector('.sidebar.min'),
      overflowing: nav.scrollHeight > nav.clientHeight,
      scrollbarWidth: nav.offsetWidth - nav.clientWidth,
    };
  })()`);
  console.log("[scrollbar] collapsed state:", JSON.stringify(collapsed));

  // crop screenshot of the sidebar region for visual proof
  const shot = await conn.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 260, height: 900, scale: 2 } });
  fs.writeFileSync("/home/z/my-project/download/sidebar-scrollbar.png", Buffer.from(shot.data, "base64"));
  console.log("[scrollbar] sidebar crop saved");

  conn.close();
} finally {
  try { electron.kill("SIGTERM"); } catch {}
  await sleep(1200);
  try { electron.kill("SIGKILL"); } catch {}
  process.exit(0);
}

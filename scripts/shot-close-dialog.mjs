// Screenshot the Close-confirmation dialog: login -> dashboard -> trigger the
// close (exactly like the topbar X) -> capture -> "Keep open" -> capture again
// (app must still be alive). Usage: DISPLAY must point at an Xvfb.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "mms-shot-home-"));
const DEBUG_PORT = 9351;
const OUT1 = process.argv[2] || "/home/z/my-project/download/close-dialog.png";
const OUT2 = process.argv[3] || "/home/z/my-project/download/close-dialog-cancelled.png";
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

  let booted = false;
  for (let i = 0; i < 20 && !booted; i++) {
    const r = await conn.send("Runtime.evaluate", { expression: "!!(window.mms && window.mms.auth)", returnByValue: true });
    booted = r.result?.value === true;
    if (!booted) await sleep(500);
  }
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

  // Trigger the close EXACTLY like the topbar X button does.
  const trigger = await conn.send("Runtime.evaluate", {
    awaitPromise: true, returnByValue: true,
    expression: `window.mms.win.close()`,
  });
  console.log("[shot] win.close() invoked");
  await sleep(1200); // dialog animation

  const shot1 = await conn.send("Page.captureScreenshot", { format: "png" });
  fs.mkdirSync(path.dirname(OUT1), { recursive: true });
  fs.writeFileSync(OUT1, Buffer.from(shot1.data, "base64"));
  console.log("[shot] saved:", OUT1, fs.statSync(OUT1).size, "bytes");

  // Dialog present?
  const dlg = await conn.send("Runtime.evaluate", { expression: "!!document.querySelector('.modal [class*=close_confirm], .modal'), text: document.body.innerText.includes('Close')", returnByValue: true });
  console.log("[shot] dialog state:", JSON.stringify(dlg.result?.value));

  // Click "Keep open" (secondary button = first in .dlg-actions).
  const keep = await conn.send("Runtime.evaluate", {
    awaitPromise: true, returnByValue: true,
    expression: `(() => {
      const modal = document.querySelector('.modal');
      if (!modal) return "NO_MODAL";
      const btn = modal.querySelector('.dlg-actions button');
      if (!btn) return "NO_BUTTON";
      btn.click();
      return "CLICKED:" + btn.textContent.trim();
    })()`,
  });
  console.log("[shot] keep-open:", keep.result?.value);
  await sleep(700);

  const alive = await conn.send("Runtime.evaluate", { expression: "!!document.querySelector('.app-shell')", returnByValue: true });
  console.log("[shot] app still alive after cancel:", alive.result?.value === true ? "YES" : "NO");

  const shot2 = await conn.send("Page.captureScreenshot", { format: "png" });
  fs.mkdirSync(path.dirname(OUT2), { recursive: true });
  fs.writeFileSync(OUT2, Buffer.from(shot2.data, "base64"));
  console.log("[shot] saved:", OUT2, fs.statSync(OUT2).size, "bytes");
  conn.close();
} finally {
  try { electron.kill("SIGTERM"); } catch {}
  await sleep(1200);
  try { electron.kill("SIGKILL"); } catch {}
  process.exit(0);
}

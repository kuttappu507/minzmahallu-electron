// Screenshot the Token Events page: (1) the table with a past event's
// Delete button locked and a future event's enabled, (2) the new themed
// delete-event dialog with its reason field.
// Modeled on scripts/shot-dashboard.mjs — CDP attach, login, capture.
// Usage: DISPLAY must point at an Xvfb; node scripts/shot-token-events.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "mms-shot-tok-"));
const DEBUG_PORT = 9349;
const OUT1 = process.argv[2] || "/home/z/my-project/download/token-events-locked.png";
const OUT2 = process.argv[3] || "/home/z/my-project/download/token-events-delete-dialog.png";
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
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); delete pending.get(msg.id); delete pending.set; pending.delete(msg.id); }
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
  await sleep(4000);

  // Seed one past + one future + one today event through the bridge, then
  // open the Token Events page (#/tokens on the HashRouter).
  const seed = await conn.send("Runtime.evaluate", {
    awaitPromise: true, returnByValue: true,
    expression: `(async () => {
      const iso = (d) => { const t = new Date(Date.now() + d * 86400000); return t.toISOString().slice(0, 10); };
      const mk = (name, date) => window.mms.tokens.createEvent({ eventName: name, eventType: "eid", eventDate: date, eventTime: "10:00", venue: "Mahallu Hall", description: "" });
      await mk("Past Eid Kit Event", iso(-14));
      await mk("Today Distribution", iso(0));
      await mk("Future Eid Kit Event", iso(9));
      window.location.hash = "#/tokens";
      return "SEEDED";
    })()`,
  });
  console.log("[shot] seed:", seed.result?.value);
  await sleep(3500);

  // Verify + capture the table state.
  const state = await conn.send("Runtime.evaluate", {
    awaitPromise: true, returnByValue: true,
    expression: `(() => {
      const rows = Array.from(document.querySelectorAll("tbody tr"));
      const find = (name) => rows.find((r) => r.textContent.includes(name));
      const delBtn = (name) => { const row = find(name); if (!row) return null; return Array.from(row.querySelectorAll("button")).find((b) => (b.title || "").toLowerCase() === "delete"); };
      return {
        pastDisabled: delBtn("Past Eid Kit Event")?.disabled,
        todayDisabled: delBtn("Today Distribution")?.disabled,
        futureDisabled: delBtn("Future Eid Kit Event")?.disabled,
      };
    })()`,
  });
  console.log("[shot] delete-button state:", JSON.stringify(state.result?.value));

  const shot1 = await conn.send("Page.captureScreenshot", { format: "png" });
  fs.mkdirSync(path.dirname(OUT1), { recursive: true });
  fs.writeFileSync(OUT1, Buffer.from(shot1.data, "base64"));
  console.log("[shot] saved:", OUT1, fs.statSync(OUT1).size, "bytes");

  // Open the delete dialog on the FUTURE event and capture it.
  const openDlg = await conn.send("Runtime.evaluate", {
    awaitPromise: true, returnByValue: true,
    expression: `(() => {
      const rows = Array.from(document.querySelectorAll("tbody tr"));
      const row = rows.find((r) => r.textContent.includes("Future Eid Kit Event"));
      const btn = Array.from(row.querySelectorAll("button")).find((b) => (b.title || "").toLowerCase() === "delete");
      btn.click();
      return "CLICKED";
    })()`,
  });
  console.log("[shot] dialog:", openDlg.result?.value);
  await sleep(900);
  const shot2 = await conn.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(OUT2, Buffer.from(shot2.data, "base64"));
  console.log("[shot] saved:", OUT2, fs.statSync(OUT2).size, "bytes");
  conn.close();
} finally {
  try { electron.kill("SIGTERM"); } catch {}
  await sleep(1200);
  try { electron.kill("SIGKILL"); } catch {}
  process.exit(0);
}

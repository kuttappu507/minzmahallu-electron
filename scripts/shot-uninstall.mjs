// Drive the UNINSTALL-VERIFICATION window end to end (functional test):
//   1. Boot the app once with a shared HOME so the demo DB is created.
//   2. Kill it, relaunch with --verify-uninstall (what NSIS customUnInit does).
//   3. Screenshot the password gate.
//   4. Submit a WRONG password -> expect on-screen error.
//   5. Relaunch, submit the CORRECT admin password (Admin@2026).
//   6. Assert the process exits with code 0; also assert a cancelled run
//      (window closed via Escape/CANCEL) exits with code 1.
// Usage: DISPLAY must point at an Xvfb.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "mms-uninstall-home-"));
const DEBUG_PORT = 9353;
const OUT1 = process.argv[2] || "/home/z/my-project/download/uninstall-gate.png";
const OUT2 = process.argv[3] || "/home/z/my-project/download/uninstall-wrong-password.png";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForApp() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const pages = await res.json();
      const page = pages.find((p) => p.type === "page" && /index\.html|MMS|uninstall/i.test(p.title + p.url));
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(400);
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

function launch(args) {
  const electron = spawn("npx", ["electron", ".", "--disable-gpu", ...args], {
    cwd: ROOT,
    env: { ...process.env, HOME, XDG_CONFIG_HOME: path.join(HOME, ".config"), DISPLAY: process.env.DISPLAY, NODE_ENV: "", ELECTRON_ENABLE_LOGGING: "" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // new process group so we can kill npx AND the electron child
  });
  electron.stderr.on("data", (d) => process.stderr.write(`[app-err] ${d}`));
  return electron;
}
function killAll(child) {
  try { process.kill(-child.pid, "SIGKILL"); } catch {}
  try { child.kill("SIGKILL"); } catch {}
}

const exitCode = (child) => new Promise((resolve) => {
  child.on("exit", (code, signal) => resolve({ code, signal }));
});

async function driveGateRun({ password, wantExit, shots, cancelOnError = false }) {
  const electron = launch([`--remote-debugging-port=${DEBUG_PORT}`, "--verify-uninstall"]);
  const done = exitCode(electron);
  const wsUrl = await waitForApp();
  const conn = cdp(wsUrl);
  await conn.ready;
  console.log("[gate] attached to verify window");
  // Wait for the password form.
  let ready = false;
  for (let i = 0; i < 25 && !ready; i++) {
    const r = await conn.send("Runtime.evaluate", { expression: "!!document.querySelector('.uc-form input[type=password]')", returnByValue: true });
    ready = r.result?.value === true;
    if (!ready) await sleep(400);
  }
  if (!ready) { console.error("[gate] FATAL: password form never appeared"); }
  await sleep(600);
  if (shots.shotAsk) {
    const s = await conn.send("Page.captureScreenshot", { format: "png" });
    fs.mkdirSync(path.dirname(shots.shotAsk), { recursive: true });
    fs.writeFileSync(shots.shotAsk, Buffer.from(s.data, "base64"));
    console.log("[gate] saved:", shots.shotAsk, fs.statSync(shots.shotAsk).size, "bytes");
  }
  const fill = await conn.send("Runtime.evaluate", {
    awaitPromise: true, returnByValue: true,
    expression: `(() => {
      const input = document.querySelector('.uc-form input[type=password]');
      if (!input) return "NO_INPUT";
      const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value');
      desc.set.call(input, ${JSON.stringify(password)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const form = input.closest('form');
      const btn = form && form.querySelector('button[type=submit]');
      if (!btn) return "NO_SUBMIT";
      btn.click();
      return "SUBMITTED";
    })()`,
  });
  console.log("[gate] submitted:", fill.result?.value);
  await sleep(900);
  if (shots.shotAfter) {
    const s = await conn.send("Page.captureScreenshot", { format: "png" });
    fs.mkdirSync(path.dirname(shots.shotAfter), { recursive: true });
    fs.writeFileSync(shots.shotAfter, Buffer.from(s.data, "base64"));
    console.log("[gate] saved:", shots.shotAfter, fs.statSync(shots.shotAfter).size, "bytes");
  }
  const errShown = await conn.send("Runtime.evaluate", { expression: "!!document.querySelector('.uc-error')", returnByValue: true });
  console.log("[gate] error shown (wrong password):", errShown.result?.value === true);
  if (cancelOnError) {
    // Cancel the gate so this run terminates with the "declined" exit code.
    // Fire-and-forget: the renderer exits immediately, so the evaluate
    // response may never arrive (a pending promise would hang the script).
    console.log("[gate] cancelling (fire-and-forget click)…");
    conn.send("Runtime.evaluate", {
      awaitPromise: true, returnByValue: true,
      expression: `(() => { const btns = [...document.querySelectorAll('.uc-actions button')]; const b = btns[0]; if (b) { b.click(); return "CLICKED"; } return "NO_BTN"; })()`,
    }).catch(() => {});
  }
  conn.close();
  const res = await done;
  console.log(`[gate] exit code: ${res.code} (signal ${res.signal})`);
  return res.code;
}

// ===== 1) create the demo DB in the shared HOME =====
{
  const boot = launch([`--remote-debugging-port=${DEBUG_PORT}`]);
  await waitForApp();
  console.log("[boot] app up; waiting for DB to be created…");
  await sleep(7000);
  killAll(boot);
  await sleep(2000);
}
const dbFile = path.join(HOME, ".config", "mms", "mms.db");
console.log("[boot] DB exists:", fs.existsSync(dbFile));

// ===== 2) wrong password -> shows error; cancelling then exits 1 =====
const wrong = await driveGateRun({ password: "WrongPass#9", wantExit: 1, shots: { shotAsk: OUT1, shotAfter: OUT2 }, cancelOnError: true });
console.log(wrong === 1 ? "GATE OK: declined -> exit 1" : "GATE FAIL: expected 1 after cancel");

// ===== 3) correct password -> exit 0 =====
const ok = await driveGateRun({ password: "Admin@2026", wantExit: 0, shots: {} });
console.log(ok === 0 ? "GATE OK: verified -> exit 0" : "GATE FAIL: expected 0");
process.exit(ok === 0 ? 0 : 1);

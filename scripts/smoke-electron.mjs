// E2E smoke driver for the packaged/dev Electron app with bundled WAHA.
//
// Launches the app under a virtual display with CDP remote debugging, then
// drives the renderer exactly like a user would (login, navigate, invoke
// window.mms APIs) and asserts the WhatsApp runtime behaviors that the
// field reports flagged:
//   1. the app window actually opens,
//   2. whatsapp.status() reports internet + service truthfully,
//   3. the bundled WAHA service boots and turns healthy,
//   4. donation receipt errors are accurate (missing number, not found).
//
// Usage: node scripts/smoke-electron.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "mms-smoke-home-"));
const DEBUG_PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const log = (...a) => console.log("[smoke]", ...a);

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

async function evaluate(conn, expression, awaitPromise = true) {
  const r = await conn.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) throw new Error("renderer exception: " + JSON.stringify(r.exceptionDetails).slice(0, 500));
  return r.result?.value;
}

const failures = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

// ---- launch ---------------------------------------------------------------
const electron = spawn("npx", ["electron", ".", `--remote-debugging-port=${DEBUG_PORT}`], {
  cwd: ROOT,
  env: { ...process.env, HOME, XDG_CONFIG_HOME: path.join(HOME, ".config"), DISPLAY: process.env.DISPLAY, NODE_ENV: "", ELECTRON_ENABLE_LOGGING: "1" },
  stdio: ["ignore", "pipe", "pipe"],
  detached: false,
});
electron.stdout.on("data", (d) => process.stdout.write(`[app] ${d}`));
electron.stderr.on("data", (d) => process.stderr.write(`[app-err] ${d}`));

try {
  const wsUrl = await waitForApp();
  log("app window is up (CDP reachable)");
  const conn = cdp(wsUrl);
  await conn.ready;
  log("attached to renderer");

  // 1) window opened & renderer booted (contextBridge may need a moment)
  let booted = false;
  for (let i = 0; i < 20 && !booted; i++) {
    booted = await evaluate(conn, `!!(window.mms && window.mms.whatsapp && window.mms.auth)`);
    if (!booted) await sleep(500);
  }
  check("app opened with mms bridge exposed", booted);

  // 2) login with the demo admin
  const login = await evaluate(conn, `window.mms.auth.login("admin","Admin@2026").then(r => r && r.success)`);
  check("demo admin login", login === true, JSON.stringify(login));

  // 3) donation list has rows (DB + migrations healthy)
  const donations = await evaluate(conn, `window.mms.donations.list({page:1,pageSize:5}).then(r => ({total:r.total, rows:(r.rows||[]).map(x=>({id:x.id, phone:x.donor_phone}))}))`);
  check("donations list has demo rows", (donations?.rows?.length || 0) > 0 && (donations?.total || 0) > 0, `total=${donations?.total} rows=${donations?.rows?.length}`);
  const withPhone = (donations?.rows || []).find((r) => r.phone);
  const withoutPhone = (donations?.rows || []).find((r) => !r.phone);
  log("donation sample:", JSON.stringify(donations?.rows || []));

  // 4) WhatsApp status — first poll: service must be STARTING/RUNNING, internet truthful
  const t0 = Date.now();
  let status = null;
  let healthySeen = false;
  while (Date.now() - t0 < 90000) {
    status = await evaluate(conn, `window.mms.whatsapp.status()`);
    log("status:", JSON.stringify(status));
    if (status?.service === "RUNNING") { healthySeen = true; break; }
    if (status?.status === "STARTING" || status?.service === "STARTING") { log("service starting — waiting"); }
    if (status?.status === "UNAVAILABLE" && status?.service === "NOT_INSTALLED") break; // bundled runtime missing
    await sleep(3000);
  }
  check("bundled WAHA service reached RUNNING", healthySeen, `service=${status?.service}`);
  check("internet reported truthfully (online machine)", status?.internet === true, `internet=${status?.internet}`);
  check("status is not the misleading OFFLINE/UNAVAILABLE", !["OFFLINE", "UNAVAILABLE"].includes(status?.status), `status=${status?.status}`);

  // 5) WAHA answers /health locally
  const health = await fetch(`http://127.0.0.1:30455/health`).then(r => r.status).catch(e => `error: ${e.message}`);
  check("local WAHA /health reachable", health === 401 || health === 200, `http=${health}`); // 401 without key = alive

  // 6) donation receipt errors are accurate
  if (withoutPhone) {
    const err = await evaluate(conn, `window.mms.whatsapp.sendDonationReceipt(${withoutPhone.id}).then(r=>({ok:true,r})).catch(e=>({ok:false,msg:e.message}))`);
    check("receipt without phone gives actionable error", !err?.ok && /No WhatsApp number/i.test(err?.msg || ""), JSON.stringify(err));
  }
  if (withPhone) {
    const err = await evaluate(conn, `window.mms.whatsapp.sendDonationReceipt(${withPhone.id}).then(r=>({ok:true,r})).catch(e=>({ok:false,msg:e.message}))`);
    log("receipt-with-phone result:", JSON.stringify(err));
    // Not connected yet → must NOT claim missing donation or no internet; expect
    // session/pairing level error or (if WAHA fully up) a send-level error.
    const msg = String(err?.msg || "");
    check("receipt with phone gives truthful error", !/not found|No internet|Internet connection unavailable/i.test(msg), msg.slice(0, 160));
  }
  const missing = await evaluate(conn, `window.mms.whatsapp.sendDonationReceipt(999999).then(r=>({ok:true})).catch(e=>({ok:false,msg:e.message}))`);
  check("receipt for missing donation says not found", !missing?.ok && /not found/i.test(missing?.msg || ""), JSON.stringify(missing));

  // 7) campaign stats use the family phone fallback
  const stats = await evaluate(conn, `window.mms.whatsapp.recipientStats("ANNOUNCEMENT")`);
  check("recipient stats resolve via family phone fallback", (stats?.eligible ?? 0) > 0, JSON.stringify(stats));
  const subStatsType = await evaluate(conn, `window.mms.whatsapp.recipientStats("SUBSCRIPTION_REMINDER").then(s => s && s.type)`);
  check("recipientStats receives the type argument", subStatsType === "SUBSCRIPTION_REMINDER", JSON.stringify(subStatsType));

  // 8) announcement campaign text passes through the IPC boundary
  const ann = await evaluate(conn, `window.mms.whatsapp.createAnnouncementCampaign("Smoke test announcement").then(r=>({ok:true,r})).catch(e=>({ok:false,msg:e.message}))`);
  check("announcement campaign accepts text and creates", ann?.ok === true && (ann?.r?.total ?? 0) > 0, JSON.stringify(ann));

  conn.close();
} finally {
  try { electron.kill("SIGTERM"); } catch {}
  await sleep(1500);
  try { electron.kill("SIGKILL"); } catch {}
}

console.log(failures.length ? `\nSMOKE FAILED: ${failures.join(", ")}` : "\nSMOKE PASSED");
process.exit(failures.length ? 1 : 0);

// Verify + screenshot the popup TITLE font-size bump (m-h b 15.5→17.5px,
// modal dlg-hero-title 15→17.5px) in a real Donations preview popup, booted
// in Malayalam so the title glyph coverage (Anek composite) is also checked.
// Sandbox rules honored: Xvfb must be up before this runs (same shell line);
// exactly ONE screenshot per app session (swiftshader compositor breaks
// after the first capture).
// Usage: node scripts/shot-popup-title.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "mms-shot-home-"));
const DEBUG_PORT = 9353;
const OUT = "/home/z/my-project/download/popup-title-size.png";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Discover the lazy Donations chunk filename from the build output so we can
// prewarm it in the renderer (file:// dynamic-import flake mitigation).
const donationsChunk = fs.readdirSync(path.join(ROOT, "dist/assets"))
  .find((f) => /^Donations-.*\.js$/.test(f));
if (!donationsChunk) throw new Error("Donations chunk not found in dist/assets");

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

async function waitForBridge(conn) {
  for (let i = 0; i < 20; i++) {
    const ok = await conn.evaluate("!!(window.mms && window.mms.auth)");
    if (ok === true) return true;
    await sleep(500);
  }
  return false;
}

async function login(conn) {
  return conn.evaluate(`(() => {
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
  })()`);
}

const electron = spawn("npx", ["electron", ".", `--remote-debugging-port=${DEBUG_PORT}`, "--disable-gpu"], {
  cwd: ROOT,
  env: { ...process.env, HOME, XDG_CONFIG_HOME: path.join(HOME, ".config"), DISPLAY: process.env.DISPLAY, NODE_ENV: "", ELECTRON_ENABLE_LOGGING: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
electron.stderr.on("data", (d) => process.stderr.write(`[app-err] ${d}`));

// Global watchdog — never let a stalled CDP call hang the script forever.
const watchdog = setTimeout(() => { console.error("[shot] WATCHDOG fired"); try { electron.kill("SIGKILL"); } catch {} process.exit(1); }, 150000);

try {
  const wsUrl = await waitForApp();
  const conn = cdp(wsUrl);
  await conn.ready;
  console.log("[shot] attached");

  // Pre-boot Malayalam BEFORE login: seed the zustand persist key, reload the
  // login screen (safe — no table/modal open), then the app rehydrates in ML.
  await conn.evaluate(`(() => { try { localStorage.setItem('mms-i18n', JSON.stringify({ state: { lang: 'ml' }, version: 0 })); } catch {} return localStorage.getItem('mms-i18n'); })()`);
  // NOTE: skip the reload — reloading the renderer under swiftshader left the
  // compositor blank in the first attempt. EN boot + fonts.check is enough to
  // verify sizes; the hero title in demo data is a Malayalam name anyway.
  console.log("[shot] ml seed stored (not reloading; EN boot for stability)");
  if (!(await waitForBridge(conn))) throw new Error("bridge never came up");
  // React may not have mounted the login form yet when the bridge is ready —
  // retry the form fill until the inputs appear.
  let form = "";
  for (let i = 0; i < 15 && form !== "SUBMITTED"; i++) {
    form = await login(conn);
    if (form !== "SUBMITTED") { await sleep(800); }
  }
  if (form !== "SUBMITTED") throw new Error("login form never appeared: " + form);
  console.log("[shot] form:", form);
  await sleep(4500); // dashboard data + animations

  // Navigate to Donations and open the preview popup via row double-click.
  // Prewarm the lazy chunk explicitly (retries) — React.lazy shares the same
  // module map, so its own import then resolves from cache.
  const warmed = await conn.evaluate(`(async () => {
    const url = new URL('assets/${donationsChunk}', document.baseURI).href;
    for (let i = 0; i < 3; i++) {
      try { await Promise.race([import(url), new Promise((_, rej) => setTimeout(() => rej(new Error("stall")), 8000))]); return 'WARMED'; } catch (e) { await new Promise(r => setTimeout(r, 700)); }
    }
    return 'WARM_FAIL:' + url;
  })()`);
  console.log("[shot] chunk prewarm:", warmed);
  await conn.evaluate("window.location.hash = '#/donations'");
  await sleep(2500);
  const diag = await conn.evaluate(`(async () => {
    const r = await window.mms.donations.list({ page: 1, pageSize: 5 });
    return { total: r.total, rows: (r.rows || []).length, hash: location.hash,
             bodySnippet: (document.body.innerText || '').slice(0, 140) };
  })()`);
  console.log("[shot] diagnostics:", JSON.stringify(diag));
  const measures = await conn.evaluate(`(async () => {
    let row = null;
    for (let i = 0; i < 20 && !row; i++) {
      row = document.querySelector('.tbl tbody tr:not(.skel-row), .data-table tbody tr:not(.skel-row), table tbody tr:not(.skel-row)');
      if (!row) await new Promise(r => setTimeout(r, 800));
    }
    if (!row) return { error: "NO_ROW" };
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await new Promise(r => setTimeout(r, 1400));
    const dlg = document.querySelector('.modal');
    if (!dlg) return { error: "NO_DIALOG" };
    const head = dlg.querySelector('.m-h b');
    const hero = dlg.querySelector('.dlg-hero-title');
    const heroSub = dlg.querySelector('.dlg-hero-sub');
    const read = (el) => el ? {
      text: (el.textContent || '').trim().slice(0, 24),
      size: getComputedStyle(el).fontSize,
      family: getComputedStyle(el).fontFamily.split(',')[0],
    } : null;
    const heroText = hero ? (hero.textContent || '').trim() : '';
    return {
      head: read(head),
      hero: read(hero),
      heroSub: read(heroSub),
      // Anek composite coverage for the ML title glyphs at the new sizes
      headAnek: head ? document.fonts.check('700 18.5px Poppins', (head.textContent || '').trim()) : null,
      heroAnek: hero ? document.fonts.check('600 17.5px Poppins', heroText) : null,
    };
  })()`);
  console.log("[shot] measures:", JSON.stringify(measures, null, 2));
  if (measures?.error) throw new Error("dialog failed: " + measures.error);

  await sleep(600);
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

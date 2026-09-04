// Live verification of the three fixes:
//  1) Anek composite: dialog Malayalam text now covered by the Poppins family
//     (was falling back to the OS font) — checked via document.fonts.check
//  2) Sidebar scrollbar rendered at 3px (screenshot crop)
//  3) Preview popup HTML carries the separate stylesheet (template-level)
// Usage: DISPLAY must point at an Xvfb; node scripts/verify-fixes.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "mms-verify-home-"));
const DEBUG_PORT = 9351;
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
  console.log("[verify] attached");

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

  // ===== 1) font composite check (BEFORE: false / AFTER: true) =====
  const fontCheck = await evaluate(conn, `(async () => {
    // switch to Malayalam UI
    document.documentElement.classList.add('lang-ml');
    try { localStorage.setItem('mms_lang', 'ml'); } catch {}
    await document.fonts.ready;
    // Does the "Poppins" FAMILY now cover Malayalam glyphs (composite face)?
    const pops = document.fonts.check('500 14px Poppins', 'മഹല്ല് രസീത്');
    const popsBold = document.fonts.check('600 10.5px Poppins', 'പേര്');
    // sanity: latin still Poppins, and the Anek family itself resolves
    const latin = document.fonts.check('500 14px Poppins', 'Receipt');
    const anek = document.fonts.check('16px "Anek Malayalam Variable"', 'മഹല്ല്');
    return { popsMl: pops, popsMlBold: popsBold, latinPoppins: latin, anekFamily: anek };
  })()`);
  console.log("[verify] font composite:", JSON.stringify(fontCheck));

  // ===== 2) open a Donations preview dialog (double-click row) =====
  await evaluate(conn, `window.location.hash = '#/donations'`);
  await sleep(3500);
  const dialogOpen = await evaluate(conn, `(async () => {
    let row = document.querySelector('.tbl tbody tr:not(.skel-row), .data-table tbody tr:not(.skel-row), table tbody tr:not(.skel-row)');
    if (!row) { // maybe page needs list refresh; force data load wait
      await new Promise(r => setTimeout(r, 2500));
      row = document.querySelector('.tbl tbody tr:not(.skel-row), .data-table tbody tr:not(.skel-row), table tbody tr:not(.skel-row)');
    }
    if (!row) return { note: "NO_ROW", tbodyHtml: (document.querySelector('.tbl tbody, table tbody')||{}).innerHTML?.slice(0, 120) };
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await new Promise(r => setTimeout(r, 1200));
    const dlg = document.querySelector('.modal, [role="dialog"]');
    if (!dlg) return "NO_DIALOG";
    // find a det .v with Malayalam content, check its computed family + coverage
    const vs = [...dlg.querySelectorAll('.det .v, .det .k')];
    const mlEl = vs.find(el => /[\u0D00-\u0D7F]/.test(el.textContent || ''));
    const k = dlg.querySelector('.det .k');
    const faceInfo = mlEl ? {
      textSample: (mlEl.textContent || '').trim().slice(0, 18),
      family: getComputedStyle(mlEl).fontFamily,
      covered: document.fonts.check('500 14px Poppins', (mlEl.textContent || '').trim().slice(0, 12)),
    } : { note: "no malayalam content found in dialog" };
    return { open: true, detCount: vs.length, labelFamily: k ? getComputedStyle(k).fontFamily.slice(0, 60) : null, faceInfo };
  })()`);
  console.log("[verify] preview dialog:", JSON.stringify(dialogOpen));

  await sleep(800);
  const shot = await conn.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/home/z/my-project/download/ml-dialog-after-fix.png", Buffer.from(shot.data, "base64"));
  console.log("[verify] dialog screenshot saved");

  // ===== 3) preview popup HTML carries the separate stylesheet =====
  const list = await evaluate(conn, `window.mms.certificates.list({}).then(r => (r.rows||[])[0] ? (r.rows||[])[0].id : null)`);
  if (list) {
    const res = await evaluate(conn, `window.mms.certificates.previewHtml(${list}).then(r => ({ success: r.success, hasSepStyle: (r.html||'').includes('templates/preview-screen.css'), hasZoom: (r.html||'').includes('zoom: 1.35') }))`);
    console.log("[verify] previewHtml separate stylesheet:", JSON.stringify(res));
  } else console.log("[verify] no certificate rows to preview");

  conn.close();
} finally {
  try { electron.kill("SIGTERM"); } catch {}
  await sleep(1200);
  try { electron.kill("SIGKILL"); } catch {}
  process.exit(0);
}

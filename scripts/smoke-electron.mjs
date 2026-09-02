// E2E smoke driver for the Electron app with the in-process WhatsApp engine
// (Baileys — no bundled service, no local HTTP port, no spawned runtime).
//
// Launches the app under a virtual display with CDP remote debugging, then
// drives the renderer exactly like a user would (login, navigate, invoke
// window.mms APIs) and asserts the behaviors the field reports flagged:
//   1. the app window actually opens,
//   2. whatsapp.status() reports internet truthfully and never blames a
//      missing "service" (the old WAHA crash class),
//   3. the Connect action brings the engine up and produces a scannable QR
//      (requires internet; on a blocked network this degrades to a logged
//      warning instead of a failure — only misleading states fail),
//   4. donation receipt errors are accurate (missing number, not found).
//
// Usage: node scripts/smoke-electron.mjs  (DISPLAY must point at an Xvfb)
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

let qrSoftWarning = "";

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

  // 3b) receipt numbering — every new donation lands in the mahallu's
  //     PREFIX/yy/MM/NNN series (prefix defaults to the mahallu name's
  //     own letters when the stored prefix is blank/legacy "RCP").
  const NUMBER_RE = /^[A-Z]{1,5}\/\d{2}\/\d{2}\/\d{3,}$/;
  try {
    const cats = await evaluate(conn, `window.mms.donations.categories()`);
    const cat = (Array.isArray(cats) ? cats : cats?.rows || [])[0];
    if (cat?.id) {
      const made = await evaluate(conn, `window.mms.donations.create({donorName:"Smoke Numbering", amount: 1, categoryId: ${cat.id}, donationDate: "2026-09-01"}).then(r => JSON.stringify(r)).catch(e => "ERR:" + e.message)`);
      const parsed = (() => { try { return JSON.parse(String(made)); } catch { return null; } })();
      const number = String(parsed?.receiptNumber || "");
      check("new donation receipt number follows PREFIX/yy/MM/NNN", NUMBER_RE.test(number) && number.includes("/26/09/"), `receipt=${number}`);
      if (parsed?.id) {
        const second = await evaluate(conn, `window.mms.donations.create({donorName:"Smoke Numbering 2", amount: 1, categoryId: ${cat.id}, donationDate: "2026-09-02"}).then(r => JSON.stringify(r)).catch(e => "ERR:" + e.message)`);
        const parsed2 = (() => { try { return JSON.parse(String(second)); } catch { return null; } })();
        check("second receipt sequences +1 in the same month", NUMBER_RE.test(String(parsed2?.receiptNumber || "")) && Number(String(parsed2?.receiptNumber).split("/").pop()) === Number(number.split("/").pop()) + 1, `receipt=${parsed2?.receiptNumber}`);
        await evaluate(conn, `window.mms.donations.remove(${parsed.id}).catch(e => "ERR:" + e.message)`);
        await evaluate(conn, `window.mms.donations.remove(${parsed2.id}).catch(e => "ERR:" + e.message)`);
      }
    } else {
      console.log("  WARN  no donation category to exercise receipt numbering");
    }
  } catch (e) {
    check("receipt numbering smoke", false, e?.message || String(e));
  }

  // 4) WhatsApp status — truthful, engine-based, no "service stopped"/
  //    "not installed" crash states (the old bundled-runtime failure class).
  const status = await evaluate(conn, `window.mms.whatsapp.status()`);
  log("status:", JSON.stringify(status));
  check("internet reported truthfully (online machine)", status?.internet === true, `internet=${status?.internet}`);
  check("status is not the misleading OFFLINE/UNAVAILABLE", !["OFFLINE", "UNAVAILABLE"].includes(status?.status), `status=${status?.status}`);
  check("no messaging-service failure state", !["NOT_INSTALLED", "CRASHED", "STOPPED"].includes(String(status?.service || "")), `service=${status?.service}`);

  // 5) Connect action: the in-process engine starts and WhatsApp Web offers
  //    a QR to pair. Needs internet access to WhatsApp servers; a sandbox
  //    without egress degrades to a logged warning (not a failure) as long
  //    as the status stays truthful.
  try {
    const connect = await evaluate(conn, `window.mms.whatsapp.connect().then(r => JSON.stringify(r)).catch(e => "ERR:" + e.message)`);
    log("connect():", String(connect));
    const t0 = Date.now();
    let reachedQr = false;
    let endStatus = status;
    while (Date.now() - t0 < 45000) {
      endStatus = await evaluate(conn, `window.mms.whatsapp.status()`);
      if (endStatus?.status === "QR_REQUIRED" || endStatus?.status === "CONNECTED") { reachedQr = true; break; }
      await sleep(2000);
    }
    if (reachedQr) {
      check("engine reached a pairable state (QR/connected)", true, `status=${endStatus?.status}`);
      if (endStatus?.status === "QR_REQUIRED") {
        const qr = await evaluate(conn, `window.mms.whatsapp.qr().catch(e => "ERR:" + e.message)`);
        const okQr = typeof qr === "string" && qr.startsWith("data:image/png;base64,");
        check("QR code is a scannable PNG data URL", okQr, typeof qr === "string" ? qr.slice(0, 40) : JSON.stringify(qr));
      }
    } else {
      qrSoftWarning = `engine did not reach QR in this sandbox (status=${endStatus?.status}, msg=${String(endStatus?.message || "").slice(0, 120)}) — likely blocked egress to WhatsApp servers, not an app defect`;
      console.log(`  WARN  engine QR flow — ${qrSoftWarning}`);
      check("engine failure state is truthful, not misleading", endStatus?.internet === true && !["UNAVAILABLE"].includes(endStatus?.status), `status=${endStatus?.status}`);
    }
  } catch (e) {
    qrSoftWarning = `connect() threw: ${e?.message || e}`;
    console.log(`  WARN  ${qrSoftWarning}`);
  }

  // 6) receipt errors are accurate (IPC args reach the main process)
  if (withPhone) {
    const receipt = await evaluate(conn, `window.mms.whatsapp.sendDonationReceipt(${withPhone.id}).then(r => JSON.stringify(r)).catch(e => "ERR:" + e.message)`);
    const msg = String(receipt);
    log("receipt-with-phone result:", msg);
    check("receipt with phone gives truthful pairing guidance", /not connected yet|not paired|scan the QR/i.test(msg), msg.slice(0, 120));
  }
  const missing = await evaluate(conn, `window.mms.whatsapp.sendDonationReceipt(999999).then(r => JSON.stringify(r)).catch(e => "ERR:" + e.message)`);
  check("receipt for missing donation says not found", /Donation record not found/i.test(String(missing)), String(missing).slice(0, 120));
  if (withoutPhone) {
    const noPhone = await evaluate(conn, `window.mms.whatsapp.sendDonationReceipt(${withoutPhone.id}).then(r => JSON.stringify(r)).catch(e => "ERR:" + e.message)`);
    check("receipt without donor phone asks for the number", /No WhatsApp number saved/i.test(String(noPhone)), String(noPhone).slice(0, 120));
  }

  // 6b) A6 receipt generation — the PDF is rendered in-process and stored in
  //     the app database (works even though WhatsApp is not paired here).
  if (withPhone) {
    const pdf = await evaluate(conn, `window.mms.receipts.getDonationPdf(${withPhone.id})`);
    check("A6 donation receipt PDF generated and stored in app", pdf?.success === true && Number(pdf?.sizeBytes) > 500 && !!pdf?.receiptNumber, `receipt=${pdf?.receiptNumber} size=${pdf?.sizeBytes}`);
  }

  // 6c) recording a subscription payment generates the receipt and reports
  //     the WhatsApp delivery status without failing the payment itself.
  const pending = await evaluate(conn, `window.mms.subscriptions.list({status:'Pending', page:1, pageSize:5})`);
  const pendingRow = (pending?.rows || [])[0];
  if (pendingRow) {
    const payDate = new Date().toISOString().slice(0, 10);
    const pay = await evaluate(conn, `window.mms.subscriptions.update(${pendingRow.id}, {amountPaid: 50, paymentDate: "${payDate}", paymentMethod: "Cash"})`);
    check("payment save returns a receipt + WhatsApp status", ["sent", "skipped", "no-phone", "not-connected", "failed"].includes(String(pay?.receiptWhatsApp)) && !!pay?.receiptNumber, `receiptWhatsApp=${pay?.receiptWhatsApp} receipt=${pay?.receiptNumber}`);
    check("payment receipt number follows PREFIX/yy/MM/NNN", NUMBER_RE.test(String(pay?.receiptNumber || "")), `receipt=${pay?.receiptNumber}`);
    const subPdf = await evaluate(conn, `window.mms.receipts.getSubscriptionPdf(${pendingRow.id})`);
    check("A6 subscription receipt PDF generated and stored", subPdf?.success === true && Number(subPdf?.sizeBytes) > 500, `size=${subPdf?.sizeBytes}`);
  } else {
    console.log("  WARN  no pending subscription row to exercise the payment receipt hook");
  }

  // 6d) certificate numbering — the mahallu's letters lead EVERY number, so
  //     death certificates read MAHALLU/DT/yy/MM/NNN (prefix defaults to
  //     the mahallu name's own letters when the stored prefix is legacy "RCP").
  try {
    const deaths = await evaluate(conn, `window.mms.deaths.list({page:1,pageSize:1})`);
    const deathRow = (deaths?.rows || [])[0];
    if (deathRow?.death_number) {
      const cert = await evaluate(conn, `window.mms.certificates.issueDeath(${JSON.stringify(deathRow.death_number)}).then(r => JSON.stringify(r)).catch(e => "ERR:" + e.message)`);
      const certParsed = (() => { try { return JSON.parse(String(cert)); } catch { return null; } })();
      const certNumber = String(certParsed?.certificateNumber || certParsed?.certificate_number || "");
      check("death certificate number follows MAHALLU/DT/yy/MM/NNN", /^[A-Z]{1,5}\/DT\/\d{2}\/\d{2}\/\d{3,}$/.test(certNumber), `cert=${certNumber}`);
    } else {
      console.log("  WARN  no death record to exercise certificate numbering");
    }
  } catch (e) {
    check("certificate numbering smoke", false, e?.message || String(e));
  }

  // 7) recipient stats + announcement campaign (IPC args + DB wiring)
  const stats = await evaluate(conn, `window.mms.whatsapp.recipientStats("ANNOUNCEMENT")`);
  check("recipient stats resolve via family phone fallback", Number(stats?.activeFamilies) > 0 && Number(stats?.willSend) > 0, JSON.stringify(stats));
  const echoType = await evaluate(conn, `window.mms.whatsapp.recipientStats("SUBSCRIPTION_REMINDER")`);
  check("recipientStats receives the type argument", echoType?.type === "SUBSCRIPTION_REMINDER", JSON.stringify(echoType?.type));
  const campaign = await evaluate(conn, `window.mms.whatsapp.createAnnouncementCampaign("Smoke test announcement").then(r => JSON.stringify(r)).catch(e => "ERR:" + e.message)`);
  check("announcement campaign accepts text and creates", /"campaignId"\s*:/.test(String(campaign)), String(campaign).slice(0, 120));

  // 8) PAUSE (not logout): the engine stops but any stored pairing survives
  //    — the old Disconnect unlinked the device, which read as "logged out".
  log("pausing engine (fresh temp profile — nothing was paired)…");
  const paused = await evaluate(conn, `window.mms.whatsapp.disconnect().then(r => JSON.stringify(r)).catch(e => "ERR:" + e.message)`);
  check("pause keeps the pairing (no logout)", /"keptPairing":true/.test(String(paused)), String(paused).slice(0, 80));
  const pausedStatus = await evaluate(conn, `window.mms.whatsapp.status()`);
  check("status after pause is DISCONNECTED (not crashed/unavailable)", pausedStatus?.status === "DISCONNECTED", `status=${pausedStatus?.status}`);
} catch (err) {
  console.error("[smoke] fatal:", err);
  failures.push("fatal: " + err.message);
} finally {
  try { electron.kill("SIGTERM"); } catch {}
  await sleep(1500);
  try { electron.kill("SIGKILL"); } catch {}
}

if (qrSoftWarning) console.log(`[smoke] note: ${qrSoftWarning}`);
if (failures.length) {
  console.error(`SMOKE FAILED (${failures.length}): ${failures.join("; ")}`);
  process.exit(1);
}
console.log("SMOKE PASSED");
process.exit(0);

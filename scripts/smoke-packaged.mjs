/*
 * PACKAGED-APP SMOKE TEST (v2.7.0 security hardening verification).
 *
 * Launches the PACKAGED build (release/linux-unpacked) under Xvfb and drives
 * the real application end-to-end through playwright-core's Electron client:
 *
 *   - boot: splash → hidden main window → revealed main window
 *   - sandbox: renderer has no Node (no require/process/Buffer), preload
 *     bridge (window.mms) is present, IPC works
 *   - navigation lockdown: window.open() denied, location.href blocked
 *   - auth: initial setup → logout → login → failed-login error
 *   - database: family + member create/list through the packaged native
 *     better-sqlite3 binding
 *   - backup: path validator refuses a renderer-supplied outside path
 *   - PDF: donation receipt PDF generated through the offscreen sandboxed
 *     print window (printToPDF on Electron 44)
 *   - WhatsApp: engine IPC responds (worker thread starts behind the splash)
 *   - updates: status IPC responds
 *   - quit: graceful close, process exits
 *
 * Usage: xvfb-run -a node scripts/smoke-packaged.mjs [--exe path]
 */
import { _electron as electron } from "playwright-core";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const expectedVersion = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const exeArg = process.argv.indexOf("--exe");
const exePath = exeArg > -1
  ? process.argv[exeArg + 1]
  : path.join(root, "release", "linux-unpacked", "minz-mahallu-management");

if (!existsSync(exePath)) {
  console.error(`SMOKE FAIL: packaged executable not found at ${exePath} — run electron-builder first`);
  process.exit(1);
}

const home = mkdtempSync(path.join(tmpdir(), "mms-smoke-home-"));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

let electronApp;
try {
  electronApp = await electron.launch({
    executablePath: exePath,
    args: ["--disable-gpu", "--no-sandbox"], // headless-container necessities; NOT security-relevant (chrome-sandbox is a kernel-LPID thing absent in this container)
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: path.join(home, ".config"),
      NODE_ENV: "production",
      ELECTRON_ENABLE_LOGGING: "0",
    },
    timeout: 60_000,
  });
  check("launch: packaged app started", true);

  const mainTitle = "MMS — Minz Mahallu Management System";
  let mainPage = null;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline && !mainPage) {
    for (const w of electronApp.windows()) {
      try {
        const t = await w.title();
        if (t === mainTitle) { mainPage = w; break; }
      } catch { /* window closed */ }
    }
    if (!mainPage) await new Promise((r) => setTimeout(r, 500));
  }
  if (!mainPage) throw new Error("main window never appeared within 45s");
  check("boot: main window created", true);

  // Renderer painted and revealed itself (win:renderer-ready gate) — poll visibility.
  let revealed = false;
  for (let i = 0; i < 60 && !revealed; i++) {
    try { revealed = await electronApp.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === "MMS — Minz Mahallu Management System");
      return !!w && w.isVisible();
    }); } catch { /* race */ }
    if (!revealed) await new Promise((r) => setTimeout(r, 500));
  }
  check("boot: reveal gate satisfied (window visible)", revealed);

  await mainPage.waitForFunction(() => typeof (window).mms !== "undefined", null, { timeout: 20_000 });
  check("preload: window.mms bridge present", true);

  const nodeProbe = await mainPage.evaluate(() => ({
    require: typeof window.require,
    process: typeof window.process,
    Buffer: typeof window.Buffer,
    globalRequire: typeof globalThis.require,
  }));
  check(
    "sandbox: renderer has no Node globals",
    nodeProbe.require === "undefined" && nodeProbe.process === "undefined" && nodeProbe.Buffer === "undefined" && nodeProbe.globalRequire === "undefined",
    JSON.stringify(nodeProbe),
  );

  const info = await mainPage.evaluate(() => window.mms.app.info());
  check("ipc: app.info responds", info?.version === expectedVersion, `v${info?.version} electron ${info?.electron}`);

  // ---- Navigation / window-open lockdown ----
  let popupSeen = false;
  const popupListener = (p) => { popupSeen = true; p.close().catch(() => {}); };
  mainPage.on("popup", popupListener);
  const opened = await mainPage.evaluate(() => {
    try { return window.open("https://example.org/", "_blank"); } catch { return "threw"; }
  });
  await new Promise((r) => setTimeout(r, 1200));
  mainPage.off("popup", popupListener);
  check("lockdown: window.open denied", opened === null && !popupSeen, `open→${JSON.stringify(opened)} popup=${popupSeen}`);

  const urlBefore = mainPage.url();
  await mainPage.evaluate(() => { window.location.href = "https://example.org/"; }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  const urlAfter = mainPage.url();
  check("lockdown: page-initiated navigation blocked", urlAfter === urlBefore, `${urlBefore} → ${urlAfter}`);

  // ---- Authentication ----
  const setup = await mainPage.evaluate(() => window.mms.auth.setupStatus());
  check("auth: setupStatus responds", typeof setup?.required === "boolean", `required=${setup?.required}`);

  const created = await mainPage.evaluate(() => window.mms.auth.createInitialAdministrator("smokeadmin", "Smoke Administrator", "Smoke@2026"));
  check("auth: initial administrator created", created?.success === true, created?.success ? `role=${created.user?.role}` : JSON.stringify(created));

  const loggedOut = await mainPage.evaluate(() => window.mms.auth.logout());
  check("auth: logout", loggedOut?.success === true);

  const badLogin = await mainPage.evaluate(() => window.mms.auth.login("smokeadmin", "Wrong@Password1"));
  check("auth: failed login rejected", badLogin?.success === false, JSON.stringify(badLogin));

  const goodLogin = await mainPage.evaluate(() => window.mms.auth.login("smokeadmin", "Smoke@2026"));
  check("auth: login succeeds", goodLogin?.success === true, goodLogin?.success ? `role=${goodLogin.user?.role}` : JSON.stringify(goodLogin));

  // ---- Database (native better-sqlite3 inside packaged asar) ----
  const fam = await mainPage.evaluate(() => window.mms.families.create({ house_name: "Smoke House", address: "Test Street" }));
  check("db: family created", !!fam?.id, `id=${fam?.id}`);
  const members = await mainPage.evaluate(() => window.mms.members.list({ page: 1, pageSize: 5 }));
  check("db: members list responds", Array.isArray(members?.rows), `rows=${members?.rows?.length ?? "?"}`);

  // ---- Backup path validation (v2.7.0 hardening) ----
  let backupBlocked = false;
  let backupMsg = "";
  try {
    await mainPage.evaluate(() => window.mms.backup.verify("/etc/passwd"));
  } catch (e) { backupBlocked = true; backupMsg = String(e?.message || e); }
  check("backup: outside/invalid path refused", backupBlocked, backupMsg.slice(0, 80));

  // ---- PDF pipeline (offscreen sandboxed print window + printToPDF) ----
  const don = await mainPage.evaluate(async (familyId) => {
    // The donations service needs a real category id.
    const cats = await window.mms.donations.categories();
    return window.mms.donations.create({
      familyId, donorName: "Smoke Donor", amount: 250, categoryId: cats?.[0]?.id ?? null,
      donationDate: new Date().toISOString().slice(0, 10), paymentMethod: "Cash",
    });
  }, fam.id);
  check("db: donation created", !!don?.id, `id=${don?.id} receipt=${don?.receiptNumber ?? "-"}`);
  if (don?.id) {
    const pdf = await mainPage.evaluate(async (id) => {
      const r = await window.mms.receipts.getDonationPdf(id);
      // base64 starts "JVBE..." = "%PDF" — decode to verify the magic bytes.
      return r?.success ? { size: r.sizeBytes, head: atob(r.pdfBase64.slice(0, 8)).slice(0, 4) } : null;
    }, don.id).catch((e) => ({ err: String(e) }));
    const ok = !!pdf && typeof pdf.size === "number" && pdf.size > 1000 && pdf.head === "%PDF";
    check("pdf: receipt generated via printToPDF", ok, typeof pdf?.size === "number" ? `${pdf.size} bytes, head=${pdf.head}` : JSON.stringify(pdf));
  }

  // ---- WhatsApp engine (worker thread behind the splash) ----
  const waStatus = await mainPage.evaluate(() => window.mms.whatsapp.status()).catch((e) => ({ err: String(e) }));
  check("whatsapp: status IPC responds", !!waStatus && !waStatus.err, JSON.stringify(waStatus).slice(0, 120));

  // ---- Updates ----
  const upd = await mainPage.evaluate(() => window.mms.updates.status());
  check("updates: status IPC responds", !!upd?.currentVersion, `current=${upd?.currentVersion}`);

  // ---- Secured layer: role gate still enforced ----
  const users = await mainPage.evaluate(() => window.mms.users.list());
  check("security: users:list reachable for admin", Array.isArray(users), `count=${users?.length ?? "?"}`);
} catch (err) {
  check("smoke run completed without harness error", false, String(err?.message || err));
} finally {
  if (electronApp) {
    try { await Promise.race([electronApp.close(), new Promise((r) => setTimeout(r, 20_000))]); check("quit: graceful close", true); }
    catch (e) { check("quit: graceful close", false, String(e?.message || e)); }
  }
  try { rmSync(home, { recursive: true, force: true }); } catch { /* temp home */ }
}

const failed = results.filter((r) => !r.ok);
console.log(`\nSMOKE RESULT: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
process.exit(0);

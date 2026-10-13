/*
 * VERIFY v2.7.2 close contract (user report, third time: "Close button still
 * dead on the login window").
 *
 * Drives the PACKAGED build under Xvfb through the REAL user path — physical
 * clicks — and pins BOTH halves of the new close contract:
 *
 *   Phase 1 (logged out — the login screen):
 *     ✕ closes INSTANTLY and natively. No "Close MMS?" dialog may appear,
 *     the process must exit, and boot.log must record close:login-instant.
 *
 *   Phase 2 (logged in):
 *     ✕ asks once; the "Close MMS?" dialog appears and STAYS open past the
 *     2 s ack watchdog (dialog acked via win:dialog-shown). "Keep open"
 *     dismisses without closing; a later ✕ re-opens the dialog (never a
 *     silent force-close); "Close app" quits for real. boot.log must record
 *     close:dialog-ack and must NOT record close:no-ack-force.
 *
 * Usage: xvfb-run -a node scripts/repro-login-buttons.mjs [--exe path]
 */
import { _electron as electron } from "playwright-core";
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const exeArg = process.argv.indexOf("--exe");
const exePath = exeArg > -1
  ? process.argv[exeArg + 1]
  : path.join(root, "release", "linux-unpacked", "minz-mahallu-management");

if (!existsSync(exePath)) {
  console.error(`VERIFY FAIL: executable not found at ${exePath}`);
  process.exit(1);
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const MAIN_TITLE = "MMS — Minz Mahallu Management System";
const winState = (electronApp) => electronApp.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === "MMS \u2014 Minz Mahallu Management System");
  return w ? { exists: true, minimized: w.isMinimized(), maximized: w.isMaximized(), visible: w.isVisible() } : { exists: false };
});

/** boot.log lives at <XDG_CONFIG_HOME>/<app dir>/logs/boot.log — scan for it. */
function findBootLog(home) {
  const cfg = path.join(home, ".config");
  if (!existsSync(cfg)) return null;
  for (const d of readdirSync(cfg)) {
    const cand = path.join(cfg, d, "logs", "boot.log");
    if (existsSync(cand)) return cand;
  }
  return null;
}

async function launch(home) {
  const app = await electron.launch({
    executablePath: exePath,
    args: ["--disable-gpu", "--no-sandbox"],
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, ".config"), NODE_ENV: "production", ELECTRON_ENABLE_LOGGING: "0" },
    timeout: 60_000,
  });
  let page = null;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline && !page) {
    for (const w of app.windows()) {
      try { if ((await w.title()) === MAIN_TITLE) { page = w; break; } } catch { /* closed */ }
    }
    if (!page) await new Promise((r) => setTimeout(r, 500));
  }
  if (!page) throw new Error("main window never appeared");
  // wait for reveal
  let revealed = false;
  for (let i = 0; i < 60 && !revealed; i++) {
    try { revealed = (await winState(app)).visible; } catch { /* race */ }
    if (!revealed) await new Promise((r) => setTimeout(r, 500));
  }
  await page.waitForFunction(() => typeof (window).mms !== "undefined", null, { timeout: 20_000 });
  await page.waitForSelector(".login-win-controls .win-btn", { timeout: 20_000 });
  return { app, page, revealed };
}

async function waitExit(app, ms) {
  for (let i = 0; i < ms / 500; i++) {
    try { await app.evaluate(() => true); } catch { return true; }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const dialogVisible = (page) => page.evaluate(() => {
  const el = document.querySelector(".dlg-hero-title, [role='dialog'], .modal, [class*='dialog']");
  return el ? { found: true, text: (el.textContent || "").slice(0, 80) } : { found: false };
});

// ===========================================================================
// PHASE 1 — logged out (login screen): close must be instant and native
// ===========================================================================
const home1 = mkdtempSync(path.join(tmpdir(), "mms-v272-out-"));
let app1;
try {
  const ctx1 = await launch(home1);
  app1 = ctx1.app;
  check("1A. boot: window revealed with login controls", ctx1.revealed);

  // leave a persistent admin for phase 2's DB? No — phase 2 uses its own
  // home. Here just prove the logged-out close.

  // A confirm dialog must NOT appear — the gate is bypassed entirely.
  let dialogShownEarly = null;
  try {
    await ctx1.page.locator(".login-win-controls .win-btn").nth(2).click({ timeout: 5000 });
    await new Promise((r) => setTimeout(r, 1500));
    dialogShownEarly = await dialogVisible(ctx1.page);
  } catch (e) {
    // A click that tears the page down mid-click can throw — that IS the
    // instant close working; treat it as no-dialog.
    dialogShownEarly = { found: false, note: String(e?.message || e).slice(0, 80) };
  }
  check("1B. ✕ at login → NO confirm dialog", !dialogShownEarly.found, JSON.stringify(dialogShownEarly));

  const exited = await waitExit(app1, 10_000);
  check("1C. ✕ at login → app exits (instant native close)", exited);

  const log1 = findBootLog(home1);
  const text1 = log1 ? readFileSync(log1, "utf8") : "";
  check("1D. boot.log records close:login-instant", text1.includes("close:login-instant"), log1 ?? "no boot.log");
  check("1E. boot.log records NO gate ask (win:ask-close-confirm never sent)", !text1.includes("close:dialog-ack"));
} catch (err) {
  check("phase 1 completed", false, String(err?.message || err));
} finally {
  if (app1) { try { await Promise.race([app1.close(), new Promise((r) => setTimeout(r, 10_000))]); } catch { /* down */ } }
  try { rmSync(home1, { recursive: true, force: true }); } catch { /* temp */ }
}

// ===========================================================================
// PHASE 2 — logged in: ask once, dialog acks and stays, user decides
// ===========================================================================
const home2 = mkdtempSync(path.join(tmpdir(), "mms-v272-in-"));
let app2;
try {
  const ctx2 = await launch(home2);
  app2 = ctx2.app;
  check("2A. boot: window revealed with login controls", ctx2.revealed);

  // Create the first admin and sign in THROUGH THE BRIDGE (sets the MAIN
  // process session — exactly what the close gate consults). The UI stays
  // on the login route, which is fine: the gate and the dialog are the same
  // regardless of which route is displayed.
  const setup = await ctx2.page.evaluate(() => window.mms.auth.setupStatus());
  if (setup?.required) {
    const created = await ctx2.page.evaluate(() => window.mms.auth.createInitialAdministrator("smokeadmin", "Smoke Administrator", "Smoke@2026"));
    check("2B. initial admin created", created?.success === true, JSON.stringify(created?.success));
  }
  const login = await ctx2.page.evaluate(() => window.mms.auth.login("smokeadmin", "Smoke@2026"));
  check("2C. bridge login succeeds (main session set)", login?.success === true, JSON.stringify(login?.success));

  // ✕ → the gate asks → dialog appears (within CLOSE_ACK_MS = 2 s).
  await ctx2.page.locator(".login-win-controls .win-btn").nth(2).click({ timeout: 5000 });
  await new Promise((r) => setTimeout(r, 1200));
  let dlg = await dialogVisible(ctx2.page);
  check("2D. ✕ while logged in → confirm dialog appears", dlg.found, JSON.stringify(dlg));

  // The ack must have cancelled the watchdog: 3.2 s after the click (past
  // CLOSE_ACK_MS) the dialog is STILL open and the app is STILL alive.
  await new Promise((r) => setTimeout(r, 2000));
  dlg = await dialogVisible(ctx2.page);
  const st = await winState(app2);
  check("2E. dialog still open past the 2 s watchdog (ack worked)", dlg.found && st.exists, `dialog=${JSON.stringify(dlg.found)} win=${JSON.stringify(st)}`);

  // "Keep open" → dismissed, app stays.
  await ctx2.page.getByRole("button", { name: /keep open|തുറന്നു വയ്ക്കുക/i }).first().click({ timeout: 5000 });
  await new Promise((r) => setTimeout(r, 800));
  dlg = await dialogVisible(ctx2.page);
  const st2 = await winState(app2);
  check("2F. 'Keep open' dismisses, app stays alive", !dlg.found && st2.exists, `dialog=${JSON.stringify(dlg.found)} win=${JSON.stringify(st2)}`);

  // A later single ✕ re-opens the dialog (cancel-close cleared the mark —
  // never a silent force-close).
  await ctx2.page.locator(".login-win-controls .win-btn").nth(2).click({ timeout: 5000 });
  await new Promise((r) => setTimeout(r, 1200));
  dlg = await dialogVisible(ctx2.page);
  check("2G. later single ✕ → dialog again (no force-close)", dlg.found, JSON.stringify(dlg));

  // "Close app" → real quit. The dialog's confirm button is the LAST button
  // inside .dlg-actions (works in both en and ml UI languages).
  try {
    await ctx2.page.locator(".dlg-actions button").last().click({ timeout: 5000 });
  } catch (e) {
    console.log("confirm-click issue:", String(e?.message || e).slice(0, 120));
  }
  const exited2 = await waitExit(app2, 20_000);
  check("2H. 'Close app' → app exits", exited2);

  const log2 = findBootLog(home2);
  const text2 = log2 ? readFileSync(log2, "utf8") : "";
  check("2I. boot.log records close:dialog-ack", text2.includes("close:dialog-ack"), log2 ?? "no boot.log");
  check("2J. boot.log records NO close:no-ack-force", !text2.includes("close:no-ack-force"));
} catch (err) {
  check("phase 2 completed", false, String(err?.message || err));
} finally {
  if (app2) { try { await Promise.race([app2.close(), new Promise((r) => setTimeout(r, 10_000))]); } catch { /* down */ } }
  try { rmSync(home2, { recursive: true, force: true }); } catch { /* temp */ }
}

const failed = results.filter((r) => !r.ok);
console.log(`\nVERIFY RESULT: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
process.exit(0);

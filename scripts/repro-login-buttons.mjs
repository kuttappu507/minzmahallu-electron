/*
 * REPRO: login-window minimize/maximize/close buttons (user report v2.7.0).
 *
 * Drives the PACKAGED build under Xvfb and exercises the REAL user path:
 * physical clicks on the .login-win-controls buttons (not direct IPC
 * evaluate), then inspects the main-process window state.
 *
 * Usage: xvfb-run -a node scripts/repro-login-buttons.mjs [--exe path]
 */
import { _electron as electron } from "playwright-core";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const exeArg = process.argv.indexOf("--exe");
const exePath = exeArg > -1
  ? process.argv[exeArg + 1]
  : path.join(root, "release", "linux-unpacked", "minz-mahallu-management");

if (!existsSync(exePath)) {
  console.error(`REPRO FAIL: executable not found at ${exePath}`);
  process.exit(1);
}

const home = mkdtempSync(path.join(tmpdir(), "mms-repro-home-"));
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

let electronApp;
try {
  electronApp = await electron.launch({
    executablePath: exePath,
    args: ["--disable-gpu", "--no-sandbox"],
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, ".config"), NODE_ENV: "production", ELECTRON_ENABLE_LOGGING: "0" },
    timeout: 60_000,
  });

  let page = null;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline && !page) {
    for (const w of electronApp.windows()) {
      try { if ((await w.title()) === MAIN_TITLE) { page = w; break; } } catch { /* closed */ }
    }
    if (!page) await new Promise((r) => setTimeout(r, 500));
  }
  if (!page) throw new Error("main window never appeared");
  console.log("main window found");

  // wait for reveal
  let revealed = false;
  for (let i = 0; i < 60 && !revealed; i++) {
    try { revealed = (await winState(electronApp)).visible; } catch { /* race */ }
    if (!revealed) await new Promise((r) => setTimeout(r, 500));
  }
  check("boot: window revealed", revealed);

  await page.waitForFunction(() => typeof (window).mms !== "undefined", null, { timeout: 20_000 });
  await page.waitForSelector(".login-win-controls .win-btn", { timeout: 20_000 });
  console.log("login window controls visible");

  // --- Baseline: direct IPC path (bridge + main handlers) ---
  await page.evaluate(() => window.mms.win.minimize());
  await new Promise((r) => setTimeout(r, 400));
  let st = await winState(electronApp);
  check("A. direct IPC minimize()", st.minimized, JSON.stringify(st));
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === "MMS \u2014 Minz Mahallu Management System");
    w?.restore();
  });
  await new Promise((r) => setTimeout(r, 400));

  // --- Real user path: physical CLICK on the minimize button ---
  const btnMin = page.locator(".login-win-controls .win-btn").nth(0);
  try {
    await btnMin.click({ timeout: 5000 });
    await new Promise((r) => setTimeout(r, 600));
    st = await winState(electronApp);
    check("B. CLICK minimize button → window minimized", st.minimized, JSON.stringify(st));
  } catch (e) {
    check("B. CLICK minimize button → window minimized", false, `click failed: ${String(e?.message || e).slice(0, 120)}`);
  }
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === "MMS \u2014 Minz Mahallu Management System");
    w?.restore();
  });
  await new Promise((r) => setTimeout(r, 400));

  // --- Real user path: physical CLICK on the maximize button ---
  const btnMax = page.locator(".login-win-controls .win-btn").nth(1);
  try {
    await btnMax.click({ timeout: 5000 });
    await new Promise((r) => setTimeout(r, 600));
    st = await winState(electronApp);
    check("C. CLICK maximize button → window maximized", st.maximized, JSON.stringify(st));
    await btnMax.click({ timeout: 5000 }); // unmaximize again
    await new Promise((r) => setTimeout(r, 600));
    st = await winState(electronApp);
    check("C2. CLICK maximize again → unmaximized", !st.maximized, JSON.stringify(st));
  } catch (e) {
    check("C. CLICK maximize button → window maximized", false, `click failed: ${String(e?.message || e).slice(0, 120)}`);
  }

  // --- Real user path: physical CLICK on the close button → confirm dialog ---
  const btnClose = page.locator(".login-win-controls .win-btn").nth(2);
  try {
    await btnClose.click({ timeout: 5000 });
    await new Promise((r) => setTimeout(r, 600));
    // The gate must ask the renderer; CloseConfirmDialog shows a modal.
    const dialogVisible = await page.evaluate(() => {
      const el = document.querySelector(".dlg-hero-title, [role='dialog'], .modal, [class*='dialog']");
      return el ? { found: true, text: (el.textContent || "").slice(0, 80) } : { found: false };
    });
    st = await winState(electronApp);
    check("D. CLICK close button → confirm dialog appears", dialogVisible.found && !st.exists ? true : dialogVisible.found, `dialog=${JSON.stringify(dialogVisible)} win=${JSON.stringify(st)}`);
    await page.screenshot({ path: "/tmp/repro-close-dialog.png" }).catch(() => {});
  } catch (e) {
    check("D. CLICK close button → confirm dialog appears", false, `click failed: ${String(e?.message || e).slice(0, 120)}`);
    await page.screenshot({ path: "/tmp/repro-close-fail.png" }).catch(() => {});
  }

  // --- Confirm the close → app should exit gracefully ---
  let exited = false;
  try {
    const confirmBtn = page.locator("button", { hasText: /close app|അടയ്ക്കുക|yes/i }).first();
    // Fallback: find any button inside the dialog that is the destructive one
    const dialogs = page.locator("[role='dialog'], .modal");
    const inDialog = dialogs.locator("button").last();
    const target = (await confirmBtn.count()) ? confirmBtn : inDialog;
    await target.click({ timeout: 5000 });
  } catch (e) {
    console.log("confirm-click issue:", String(e?.message || e).slice(0, 120));
  }
  // wait for process exit (close → quit on linux)
  for (let i = 0; i < 20 && !exited; i++) {
    try { await electronApp.evaluate(() => true); } catch { exited = true; break; }
    await new Promise((r) => setTimeout(r, 500));
  }
  check("E. confirm close → app exits", exited);
} catch (err) {
  check("repro harness completed", false, String(err?.message || err));
} finally {
  if (electronApp) {
    try { await Promise.race([electronApp.close(), new Promise((r) => setTimeout(r, 15_000))]); } catch { /* may already be down */ }
  }
  try { rmSync(home, { recursive: true, force: true }); } catch { /* temp home */ }
}

const failed = results.filter((r) => !r.ok);
console.log(`\nREPRO RESULT: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
process.exit(0);

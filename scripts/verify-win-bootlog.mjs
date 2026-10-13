/*
 * Verify the v2.7.1 win-handler instrumentation: physical clicks on the
 * login-window buttons must produce win:minimize / win:maximize / win:close
 * lines in <userData>/logs/boot.log — proving click → renderer → preload →
 * IPC → main handler all fire (the minimized STATE itself cannot be checked
 * in this WM-less Xvfb container).
 */
import { _electron as electron } from "playwright-core";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const exePath = path.join(root, "release", "linux-unpacked", "minz-mahallu-management");
const home = mkdtempSync(path.join(tmpdir(), "mms-bootlog-home-"));
let electronApp;
let ok = true;
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
      try { if ((await w.title()) === "MMS — Minz Mahallu Management System") { page = w; break; } } catch { /* closed */ }
    }
    if (!page) await new Promise((r) => setTimeout(r, 500));
  }
  if (!page) throw new Error("main window never appeared");
  await page.waitForSelector(".login-win-controls .win-btn", { timeout: 20_000 });
  await new Promise((r) => setTimeout(r, 1000));

  await page.locator(".login-win-controls .win-btn").nth(0).click({ timeout: 5000 }); // minimize
  await new Promise((r) => setTimeout(r, 300));
  await page.locator(".login-win-controls .win-btn").nth(1).click({ timeout: 5000 }); // maximize
  await new Promise((r) => setTimeout(r, 300));
  await page.locator(".login-win-controls .win-btn").nth(2).click({ timeout: 5000 }); // close (dialog should appear)
  await new Promise((r) => setTimeout(r, 800));
  const dlg = await page.evaluate(() => !!document.querySelector(".dlg-hero-title"));
  console.log("close dialog appeared:", dlg);
  // dismiss via Escape equivalent: click the secondary ("Keep open") button
  try {
    const keepBtn = page.locator("[role='dialog'] button, .modal button").first();
    await keepBtn.click({ timeout: 3000 });
    await new Promise((r) => setTimeout(r, 500));
  } catch { /* best effort */ }

  // userData dir = <home>/.config/<productName or npm name> — glob for it.
  const { readdirSync } = await import("node:fs");
  const cfgDir = path.join(home, ".config");
  let logPath = "";
  for (const d of readdirSync(cfgDir)) {
    const cand = path.join(cfgDir, d, "logs", "boot.log");
    if (existsSync(cand)) { logPath = cand; break; }
  }
  if (!logPath) throw new Error("boot.log not found anywhere under .config");
  const log = readFileSync(logPath, "utf8");
  for (const step of ["win:minimize", "win:maximize", "win:close", "close:asked"]) {
    // note: close:asked only exists if added; win:* are the v2.7.1 markers
    const has = log.includes(`] ${step}`);
    console.log(`${has ? "PASS" : (step.startsWith("win:") ? "FAIL" : "info")}  boot.log contains "${step}"`);
    if (step.startsWith("win:") && !has) ok = false;
  }
  const bootDone = log.includes("boot:complete");
  console.log(`${bootDone ? "PASS" : "FAIL"}  boot.log contains "boot:complete" with duration`);
  if (!bootDone) ok = false;
  console.log("\n--- boot.log tail ---");
  console.log(log.trim().split("\n").slice(-12).join("\n"));
} catch (err) {
  ok = false;
  console.error("HARNESS ERROR:", String(err?.message || err));
} finally {
  if (electronApp) { try { await Promise.race([electronApp.close(), new Promise((r) => setTimeout(r, 15_000))]); } catch { /* down */ } }
  try { rmSync(home, { recursive: true, force: true }); } catch { /* temp home */ }
}
process.exit(ok ? 0 : 1);

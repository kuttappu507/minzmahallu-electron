/*
 * e2e-clear-data.mjs — client-side (Playwright Electron) E2E of "Clear All Data".
 *
 * Companion to scripts/qa-clear-data-e2e.mjs (deep data-level verification:
 * receipt sequences, closed-DB sqlite checks). THIS suite focuses on the
 * SECURITY GATES and app usability: it deliberately attacks the wipe with an
 * empty reason and a wrong password before executing it for real.
 *
 * Drives the REAL app UI end to end under xvfb:
 *   1. Fresh data folder (isolated XDG_CONFIG_HOME) → first-run setup → admin created via UI
 *   2. Seeds records through the UI: family, member, donation, subscription, income
 *   3. Settings → Danger Zone → SecureActionDialog:
 *        a. empty reason rejected
 *        b. wrong admin password rejected (data survives)
 *        c. correct reason + password → wipe
 *   4. Post-wipe: app reloads to Login → same credentials still work →
 *      every module shows "No records found" → audit trail has the genesis
 *      CLEAR_ALL_DATA entry → app is fully usable again (new family created).
 *
 * Run:  xvfb-run -a -s "-screen 0 1920x1080x24" node scripts/e2e-clear-data.mjs
 */

import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

// playwright lives in the global npm root in this environment
const require2 = createRequire(import.meta.url);
const PW_CANDIDATES = [
  "/home/z/.npm-global/lib/node_modules/playwright",
  "playwright",
];
let _electron;
for (const c of PW_CANDIDATES) {
  try { _electron = require2(c)._electron; break; } catch { /* next */ }
}
if (!_electron) { console.error("FATAL: playwright module not found"); process.exit(2); }

const ADMIN_USER = "admin";
const ADMIN_PASS = "Admin#2026";
const ART = "/home/z/my-project/.e2e-artifacts";
fs.mkdirSync(ART, { recursive: true });

const RESULTS = [];
const ok = (step, msg = "") => { RESULTS.push(["PASS", step]); console.log(`  ✔ PASS ${step}${msg ? " — " + msg : ""}`); };
const fail = (step, msg = "") => { RESULTS.push(["FAIL", step]); console.log(`  ✘ FAIL ${step}${msg ? " — " + msg : ""}`); };

async function shot(win, name) {
  try { await win.screenshot({ path: path.join(ART, `${name}.png`) }); } catch { /* ignore */ }
}

async function clickNav(win, href) {
  try {
    await win.locator(`a[href="#${href}"]`).first().click({ timeout: 6000 });
  } catch {
    // Sidebar items deep below the fold sit in a smooth-scroll area and can
    // stay "unstable" for the click retry loop — fall back to hash routing.
    await win.evaluate((h) => { window.location.hash = h; }, `#${href}`);
  }
  await win.waitForTimeout(300); // allow the lazy route chunk to mount
}

const modal = (win) => win.locator(".modal-root.open .modal");

async function createFamily(win, house, phone) {
  await clickNav(win, "/families");
  await win.locator('button:has-text("Add Family")').first().click();
  const m = modal(win);
  await m.waitFor({ state: "visible", timeout: 10000 });
  await m.locator("input").nth(0).fill(house);   // House Name
  await m.locator("input").nth(4).fill(phone);   // Phone (0 house,1 number,2 ward,3 area,4 phone)
  await m.locator('button:has-text("Save")').last().click();
  await win.getByText(house, { exact: true }).first().waitFor({ timeout: 10000 });
}

async function login(win, user, pass) {
  await win.waitForSelector(".login-form", { timeout: 60000 });
  await win.locator("input.login-submit").nth(0).fill(user);
  await win.locator("input.login-submit").nth(1).fill(pass);
  await win.locator('button:has-text("Login")').first().click();
  await win.locator('a[href="#/families"]').first().waitFor({ timeout: 30000 }); // dashboard reachable
}

const today = new Date().toISOString().slice(0, 10);

async function main() {
  // Isolated data folder: main.ts sets userData = appData/mms, and on Linux
  // appData resolves from XDG_CONFIG_HOME → DB lives in our temp dir only.
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "mms-e2e-"));
  const xdg = path.join(runDir, "config");
  fs.mkdirSync(xdg, { recursive: true });

  console.log(`[e2e] launch electron (data folder: ${xdg}/mms)`);
  const app = await _electron.launch({
    args: [".", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    executablePath: path.join(REPO, "node_modules", "electron", "dist", "electron"),
    cwd: REPO,
    env: { ...process.env, XDG_CONFIG_HOME: xdg, ELECTRON_ENABLE_LOGGING: "1" },
    timeout: 90000,
  });
  const win = await app.firstWindow();
  await win.waitForLoadState("domcontentloaded");

  try {
    // ---------------------------------------------------------------- 1. setup
    console.log("[e2e] step 1: first-run administrator setup");
    await win.waitForSelector(".login-form", { timeout: 60000 });
    await shot(win, "01-setup");
    await win.locator("input.login-submit").nth(0).fill("E2E Administrator");
    await win.locator("input.login-submit").nth(1).fill(ADMIN_USER);
    await win.locator("input.login-submit").nth(2).fill(ADMIN_PASS);
    await win.locator("input.login-submit").nth(3).fill(ADMIN_PASS);
    await win.locator('button:has-text("Create Administrator Account")').first().click();
    await win.locator('a[href="#/families"]').first().waitFor({ timeout: 30000 });
    ok("Setup: administrator account created via UI");

    // ------------------------------------------------------------- 2. seed data
    console.log("[e2e] step 2: seeding records through the UI");

    await createFamily(win, "Test House", "9876543210");
    ok("Seed: family 'Test House' created");

    await clickNav(win, "/members");
    await win.locator('button:has-text("Add Member")').first().click();
    let m = modal(win);
    await m.waitFor({ state: "visible", timeout: 10000 });
    const famOpt = m.locator("select").first().locator("option", { hasText: "Test House" }).first();
    await m.locator("select").first().selectOption(await famOpt.getAttribute("value"));
    await m.locator("input").first().fill("Muhammed Ali"); // Name (first input in dialog)
    await m.locator('button:has-text("Save")').last().click();
    await win.getByText("Muhammed Ali").first().waitFor({ timeout: 10000 });
    ok("Seed: member 'Muhammed Ali' created in Test House");

    await clickNav(win, "/donations");
    await win.locator('button:has-text("Add Donation")').first().click();
    m = modal(win);
    await m.waitFor({ state: "visible", timeout: 10000 });
    await m.locator('input:not([type])').nth(0).fill("Abdu Rahman"); // Donor name (first untyped input)
    await m.locator("select").first().selectOption({ label: "General Donation" });
    await m.locator('input[type="number"]').first().fill("500");
    await m.locator('input[type="date"]').first().fill(today);
    await m.locator('button:has-text("Save")').last().click();
    await win.getByText("Abdu Rahman").first().waitFor({ timeout: 10000 });
    ok("Seed: donation of ₹500 from 'Abdu Rahman' recorded");

    await clickNav(win, "/subscriptions");
    await win.locator('button:has-text("New subscription")').first().click();
    m = modal(win);
    await m.waitFor({ state: "visible", timeout: 10000 });
    const subOpt = m.locator("select").first().locator("option", { hasText: "Test House" }).first();
    await m.locator("select").first().selectOption(await subOpt.getAttribute("value"));
    await m.locator('input[type="number"]').first().fill("300"); // Monthly due
    await m.locator('button:has-text("Save")').last().click();
    await win.getByText("Test House").first().waitFor({ timeout: 15000 });
    ok("Seed: monthly subscription account (₹300) for Test House");

    await clickNav(win, "/accounting");
    await win.locator('button:has-text("Add Income")').first().click();
    m = modal(win);
    await m.waitFor({ state: "visible", timeout: 10000 });
    await m.locator('input[type="number"]').first().fill("250");
    const catInput = m.locator('input:not([type])').first();
    await catInput.fill("Shop Rent");
    await catInput.press("Escape"); // close the category autocomplete dropdown
    await m.locator('button:has-text("Save")').last().click();
    await win.getByText("Shop Rent").first().waitFor({ timeout: 10000 });
    ok("Seed: income transaction (₹250, Shop Rent) recorded");

    // ------------------------------------------------ 3. pre-wipe sanity: audit
    console.log("[e2e] step 3: pre-wipe audit sanity");
    await clickNav(win, "/audit");
    await win.locator("table tbody tr").first().waitFor({ timeout: 15000 });
    ok("Pre-wipe: audit log records activity");

    // ------------------------------------------------------- 4. the wipe itself
    console.log("[e2e] step 4: Settings → Danger Zone → Clear All Data");
    await clickNav(win, "/settings");
    await win.getByText("Danger Zone").first().waitFor({ timeout: 15000 });
    await win.locator('button:has-text("Clear All Data…")').first().click();
    m = modal(win);
    await m.waitFor({ state: "visible", timeout: 10000 });
    await shot(win, "02-secure-dialog");

    // 4a. empty reason must be rejected
    await m.locator('button:has-text("Erase everything")').click();
    await win.getByText("A reason is required", { exact: false }).first().waitFor({ timeout: 8000 });
    ok("Gate 1: empty reason rejected");
    await shot(win, "03-reason-required");

    // 4b. wrong password must be rejected — and data must survive
    await m.locator("textarea").first().fill("E2E: factory reset for production");
    await m.locator('input[type="password"]').fill("WrongPass#999");
    await m.locator('button:has-text("Erase everything")').click();
    await win.getByText(/password/i, { exact: false }).first().waitFor({ timeout: 8000 });
    ok("Gate 2: wrong administrator password rejected");
    await shot(win, "04-wrong-password");

    // data must still be there after the failed attempt
    await clickNav(win, "/families");
    await win.getByText("Test House", { exact: true }).first().waitFor({ timeout: 10000 });
    ok("Integrity: data intact after failed wipe attempts");

    // 4c. correct reason + password
    await clickNav(win, "/settings");
    await win.getByText("Danger Zone").first().waitFor({ timeout: 15000 });
    await win.locator('button:has-text("Clear All Data…")').first().click();
    m = modal(win);
    await m.waitFor({ state: "visible", timeout: 10000 });
    await m.locator("textarea").first().fill("E2E: factory reset for production");
    await m.locator('input[type="password"]').fill(ADMIN_PASS);
    await m.locator('button:has-text("Erase everything")').click();
    await win.getByText("All data cleared", { exact: false }).first().waitFor({ timeout: 20000 });
    ok("Wipe executed with reason + admin password");
    await shot(win, "05-cleared");

    // ------------------------------------------------------------ 5. post-wipe
    console.log("[e2e] step 5: post-wipe verification");
    await login(win, ADMIN_USER, ADMIN_PASS); // reload lands on Login; same credentials work
    ok("Post-wipe: login with same credentials still works (users kept)");

    const modules = [
      ["/families", "Families"],
      ["/members", "Members"],
      ["/donations", "Donations"],
      ["/subscriptions", "Subscriptions"],
      ["/accounting", "Accounting"],
    ];
    for (const [href, name] of modules) {
      await clickNav(win, href);
      await win.getByText("No records found").first().waitFor({ timeout: 15000 });
      ok(`Post-wipe: ${name} shows empty state`);
    }
    await shot(win, "06-empty-families");

    await clickNav(win, "/audit");
    await win.getByText(/ALL RECORDS ERASED|CLEAR_ALL_DATA/).first().waitFor({ timeout: 15000 });
    ok("Post-wipe: audit trail restarted with the CLEAR_ALL_DATA genesis entry");
    await shot(win, "07-audit-genesis");

    // app fully usable again — create a fresh family
    await createFamily(win, "Post-Wipe House", "9876500000");
    ok("Post-wipe: app fully usable — new family created and listed");

    // ------------------------------------------------------------- DB location
    const dbFile = path.join(xdg, "mms", "mms.db");
    if (fs.existsSync(dbFile) && fs.statSync(dbFile).size > 0) {
      ok("Post-wipe: database file present and non-empty in the app data folder");
    } else {
      fail("Post-wipe: database file missing/empty?!");
    }
  } catch (err) {
    fail("UNEXPECTED ERROR", String(err?.message || err).slice(0, 300));
    try { await shot(win, "99-failure"); } catch {}
  } finally {
    await app.close().catch(() => {});
  }

  // ------------------------------------------------------------------ summary
  const passed = RESULTS.filter(r => r[0] === "PASS").length;
  const failed = RESULTS.filter(r => r[0] === "FAIL").length;
  console.log("\n================ E2E SUMMARY ================");
  for (const [s, step] of RESULTS) console.log(` ${s === "PASS" ? "✔" : "✘"} ${step}`);
  console.log("=============================================");
  console.log(` ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error("FATAL:", e); process.exit(2); });

/*
 * e2e-production-clean.mjs — client-side acceptance test for the
 * production-clean build of MMS Electron.
 *
 * Launches the REAL app (dist-electron/main.js + dist renderer) with a
 * completely fresh user-data profile and verifies, through the UI only:
 *
 *   1. First run shows the Initial Setup screen (no seeded users, no
 *      shipped/demo credentials anywhere).
 *   2. The Administrator account can be created through the setup form.
 *   3. Every core data module (Families, Members, Donations, Subscriptions,
 *      Accounting) shows its EMPTY state — no demo/seed rows anywhere.
 *   4. Settings no longer contains the Danger Zone / "Clear All Data"
 *      button (removed for production).
 *   5. CRUD still works from a clean install: a family can be added
 *      through the dialog and appears in the table.
 *   6. Closing the app shows the "Close MMS?" dialogue carrying the
 *      feedback line "send your feedback to minzmahallu@proton.me",
 *      and "Close app" really quits the application.
 *
 * Run:  node scripts/e2e-production-clean.mjs
 * Needs: playwright (global install is resolved by absolute path),
 *        xvfb-run when there is no display server.
 */
import { _electron } from "file:///home/z/.npm-global/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE = process.env.E2E_PROFILE || "/home/z/my-project/.cache/mms-e2e-profile";
const FEEDBACK_TEXT = "send your feedback to minzmahallu@proton.me";
const ADMIN = { fullName: "E2E Administrator", username: "e2eadmin", password: "Prod@2026" };

let failures = 0;
const ok = (msg) => console.log(`  PASS  ${msg}`);
const fail = (msg) => { failures += 1; console.error(`  FAIL  ${msg}`); };
async function check(name, fn) {
  try { await fn(); ok(name); }
  catch (e) { fail(`${name} — ${e instanceof Error ? e.message.split("\n")[0] : e}`); }
}

/* Fresh profile: wipe any previous run's userData (DB + localStorage). */
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(PROFILE, { recursive: true });

console.log("Launching MMS (electron) with a fresh profile…");
const electronApp = await _electron.launch({
  cwd: ROOT,
  args: ["."],
  executablePath: path.join(ROOT, "node_modules", "electron", "dist", "electron"),
  env: { ...process.env, XDG_CONFIG_HOME: PROFILE },
  timeout: 60_000,
});
const page = await electronApp.firstWindow();
page.setDefaultTimeout(30_000);

/* 1 — first run must offer Initial Setup (users table is empty). */
await check("first run shows the Initial Setup screen (no seeded accounts)", async () => {
  await page.getByText("Initial Setup").waitFor({ state: "visible", timeout: 30_000 });
});

/* 2 — create the administrator through the setup form.
 *    (Labels are not htmlFor-associated with the inputs, so address
 *     the four .login-form inputs positionally: name, username,
 *     password, confirm.) */
await check("administrator account created through the setup form", async () => {
  const inputs = page.locator(".login-form input.inp");
  await inputs.nth(0).fill(ADMIN.fullName);
  await inputs.nth(1).fill(ADMIN.username);
  await inputs.nth(2).fill(ADMIN.password);
  await inputs.nth(3).fill(ADMIN.password);
  await page.getByRole("button", { name: "Create Administrator Account" }).click();
  await page.locator(".win-controls").waitFor({ state: "visible", timeout: 30_000 });
});

/* 3 — every core module must show its empty state (no demo data). */
for (const [route, name] of [
  ["#/families", "Families"],
  ["#/members", "Members"],
  ["#/donations", "Donations"],
  ["#/subscriptions", "Subscriptions"],
  ["#/accounting", "Accounting"],
]) {
  await check(`${name} module shows an empty table (no demo data)`, async () => {
    await page.evaluate((h) => { window.location.hash = h; }, route);
    await page.locator(".empty-state").first().waitFor({ state: "visible", timeout: 20_000 });
  });
}

/* 4 — Settings must NOT contain the Danger Zone / Clear All Data button. */
await check("Settings has no Danger Zone / Clear All Data button", async () => {
  await page.evaluate(() => { window.location.hash = "#/settings"; });
  await page.getByText("Appearance").first().waitFor({ state: "visible", timeout: 20_000 });
  const danger = await page.getByText("Danger Zone").count();
  const clear = await page.getByText("Clear All Data").count();
  if (danger !== 0 || clear !== 0) throw new Error(`Danger Zone x${danger}, Clear All Data x${clear}`);
});

/* 5 — CRUD works from a clean install: add a family via the dialog. */
await check("family can be added via the Add Family dialog (CRUD works)", async () => {
  await page.evaluate(() => { window.location.hash = "#/families"; });
  await page.getByRole("button", { name: "Add Family" }).first().click();
  const dialog = page.locator(".modal-root.open .modal").first();
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  /* Dialog inputs, positionally: house name, house number, ward, area,
   * phone (required), alt phone, pincode, then the WhatsApp head number. */
  const fields = dialog.locator("input");
  await fields.nth(0).fill("E2E Test House");
  await fields.nth(4).fill("9876543210");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("E2E Test House").first().waitFor({ state: "visible", timeout: 15_000 });
});

/* 6 — closing dialogue: feedback line + real quit. */
await check("close dialogue shows the feedback text and quits the app", async () => {
  await page.locator(".win-btn.win-close").click();
  await page.getByText("Do you want to close the application?").waitFor({ state: "visible", timeout: 10_000 });
  const feedback = await page.getByText(FEEDBACK_TEXT).count();
  if (feedback === 0) throw new Error(`feedback line "${FEEDBACK_TEXT}" not visible`);
  const exited = new Promise((resolve) => electronApp.process().once("exit", resolve));
  /* The click confirms close and the app quits immediately — Playwright
   * may report the page/context as closed while the click lands. Tolerate. */
  await page.getByRole("button", { name: "Close app" }).click({ timeout: 10_000 }).catch(() => {});
  const code = await Promise.race([
    exited.then(() => "exited"),
    new Promise((r) => setTimeout(() => r("timeout"), 20_000)),
  ]);
  if (code !== "exited") throw new Error("app process did not exit after Close app");
});

/* Artifacts on failure: keep the page rendered for diagnosis. */
if (failures > 0) {
  const shot = path.join(PROFILE, "..", "mms-e2e-failure.png");
  try { await page.screenshot({ path: shot, fullPage: true }); console.error(`Failure screenshot: ${shot}`); } catch {}
}

await electronApp.close().catch(() => {});
console.log(failures === 0 ? "\nALL CLIENT-SIDE CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

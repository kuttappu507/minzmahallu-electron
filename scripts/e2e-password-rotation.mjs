/*
 * e2e-password-rotation.mjs — client-side E2E for the V035 forced password
 * rotation screen (the screen users reach when the app itself says the
 * EXISTING password is a publicly-known common password).
 *
 * Covers the reported bug end-to-end through the REAL Electron app:
 *   R1  Login as a flagged account -> rotation screen appears (en + ml)
 *   R2  Weak new password      -> clean localized rule message (NOT Electron's
 *                                 raw "Error invoking remote method…" wrapper)
 *   R3  Complexity violation   -> clean localized message (en + ml)
 *   R4  Confirm mismatch       -> mismatch message
 *   R5  Strong password        -> rotation succeeds, dashboard reached
 *   R6  Old (common) password  -> rejected on the next login
 *   R7  New password logs in   -> straight to dashboard, no second rotation
 *
 * Seeding: the script creates two staff users through the REAL Users UI, then
 * (app closed) flips their password_hash to the publicly-committed "admin123"
 * hash and sets must_change_pwd=1 directly in SQLite (node:sqlite) — exactly
 * the state migration V035 flags accounts into.
 *
 * Run:  DISPLAY=:99 node scripts/e2e-password-rotation.mjs
 */

import { _electron } from "file:///home/z/.npm-global/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE = "/home/z/my-project/.cache/mms-e2e-rotation-profile";
const EXPORTS = "/home/z/my-project/.cache/mms-e2e-rotation-exports";
const ADMIN = { fullName: "E2E Administrator", username: "e2eadmin", password: "Prod@2026" };
const STAFF_PWD = "Staff@2026";
// After seeding, the flagged accounts' ACTUAL password is the common one the
// hash represents ("admin123") — that is the whole premise of the rotation
// gate: the existing password IS the publicly-known password.
const COMMON_PWD = "admin123";
// Old demo placeholder ("admin123") whose hash was publicly committed — the
// hash auth.service.ts treats as a common password (SEEDED_ADMIN_HASHES).
const COMMON_HASH = "pbkdf2_sha256$200000$c2FsdC1mb3ItbW1zLWFkbWluLXVzZXI=$dJvtGdhlhx7H/9KuwAZs4U/j/DjiiDA88txKk9SnqTU=";

const EN = {
  rotateTitle: "Update your password",
  rotateSub: "publicly-known default password",
  short: "Password must be at least 8 characters.",
  weak: "Password must include uppercase, lowercase, a number and a special character.",
  mismatch: "Passwords do not match.",
  saved: "Password updated. Welcome!",
  invalidCredentials: "Invalid username or password",
};
const ML = {
  rotateTitle: "പാസ്‌വേഡ് അപ്ഡേറ്റ് ചെയ്യുക",
  short: "പാസ്‌വേഡിന് കുറഞ്ഞത് 8 അക്ഷരങ്ങൾ വേണം.",
  weak: "പാസ്‌വേഡിൽ വലിയക്ഷരം, ചെറിയക്ഷരം, സംഖ്യ, പ്രത്യേക ചിഹ്നം എന്നിവ ഉൾപ്പെടുത്തണം.",
};

let page, electronApp;
let passed = 0, failed = 0;
const failures = [];
function check(name) { passed++; console.log(`  PASS  ${name}`); }
function fail(name, err) {
  failed++;
  const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
  failures.push({ name, msg });
  console.error(`  FAIL  ${name}\n        ${msg}`);
  try { page?.screenshot({ path: `${EXPORTS}/fail-${String(failed).padStart(2, "0")}.png` }); } catch {}
}
async function step(name, fn) { try { await fn(); check(name); } catch (e) { fail(name, e); } }

/* ---------- helpers ---------- */
const inputs = () => page.locator(".login-form input.inp");
const errorBox = () => page.locator(".login-error");
async function errorText(timeout = 8_000) {
  await errorBox().waitFor({ state: "visible", timeout });
  return (await errorBox().innerText()).trim();
}
async function assertNoRawIpcError() {
  const body = await page.locator("body").innerText();
  if (/Error invoking remote method/i.test(body)) throw new Error('raw "Error invoking remote method" wrapper leaked into the UI');
}
async function login(user, pwd) {
  await inputs().nth(0).fill(user);
  await inputs().nth(1).fill(pwd);
  // Button label is localized ("Login" / "ലോഗിൻ") — match both.
  await page.getByRole("button", { name: /^(Login|ലോഗിൻ)$/ }).click();
}
async function logout() {
  await page.locator("button.avbtn").click();
  await page.locator(".menuit-btn.danger").click();
  await page.getByText(/Welcome back\.|വീണ്ടും സ്വാഗതം/).waitFor({ state: "visible", timeout: 10_000 });
}

async function launch({ lang } = {}) {
  electronApp = await _electron.launch({
    cwd: ROOT,
    args: [".", "--disable-dev-shm-usage", "--disable-gpu"],
    executablePath: path.join(ROOT, "node_modules", "electron", "dist", "electron"),
    env: { ...process.env, XDG_CONFIG_HOME: PROFILE },
    timeout: 60_000,
  });
  page = await electronApp.firstWindow();
  page.setDefaultTimeout(20_000);
  if (lang) {
    // Seed the zustand-persist i18n store BEFORE app scripts run: register the
    // init script, then reload so the store hydrates from seeded localStorage.
    await page.addInitScript((l) => {
      localStorage.setItem("mms-i18n", JSON.stringify({ state: { lang: l }, version: 0 }));
    }, lang);
    await page.reload();
  }
  await page.waitForLoadState("domcontentloaded");
}
async function closeApp() { try { await electronApp.close(); } catch {} }

/** Flag both staff accounts into the V035 rotation state (app must be closed). */
function seedRotationState() {
  const db = new DatabaseSync(path.join(PROFILE, "mms", "mms.db"));
  const r = db.prepare(
    "UPDATE users SET password_hash = ?, must_change_pwd = 1 WHERE username IN ('e2estaff','e2estaff2')"
  ).run(COMMON_HASH);
  db.close();
  if (Number(r.changes) !== 2) throw new Error(`expected to flag 2 users, flagged ${r.changes}`);
}

/* ================= RUN ================= */
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.rmSync(EXPORTS, { recursive: true, force: true });
fs.mkdirSync(PROFILE, { recursive: true });
fs.mkdirSync(EXPORTS, { recursive: true });

console.log("Phase A — English · setup, seed staff users, flag accounts, drive rotation screen");
await launch();
await step("R1a setup: first Administrator created through the real setup screen", async () => {
  await page.getByText("Initial Setup").waitFor({ state: "visible", timeout: 20_000 });
  const setupInputs = inputs();
  await setupInputs.nth(0).fill(ADMIN.fullName);
  await setupInputs.nth(1).fill(ADMIN.username);
  await setupInputs.nth(2).fill(ADMIN.password);
  await setupInputs.nth(3).fill(ADMIN.password);
  await page.getByRole("button", { name: "Create Administrator Account" }).click();
  await page.locator(".stat").first().waitFor({ state: "visible", timeout: 20_000 });
});
await step("R1b two staff users created through the real Users UI", async () => {
  await page.evaluate(() => { window.location.hash = "#/users"; });
  await page.getByRole("button", { name: "Add User" }).waitFor({ state: "visible", timeout: 15_000 });
  for (const [u, n] of [["e2estaff", "E2E Staff"], ["e2estaff2", "E2E Staff Two"]]) {
    await page.getByRole("button", { name: "Add User" }).click();
    const d = page.locator(".modal-root.open .modal").last();
    await d.waitFor({ state: "visible", timeout: 8_000 });
    await d.locator("input.inp").nth(0).fill(u);
    await d.locator("input.inp").nth(1).fill(n);
    await d.locator("select").selectOption("Staff");
    await d.locator('input[type="password"]').fill(STAFF_PWD);
    await d.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("User added", { exact: false }).first().waitFor({ state: "visible", timeout: 8_000 }).catch(() => {});
    await page.locator(`tr:has-text("${u}")`).first().waitFor({ state: "visible", timeout: 10_000 });
  }
});
await logout();
await closeApp();
await step("R1c accounts flagged: common-password hash + must_change_pwd=1 (SQLite)", () => seedRotationState());

console.log("Phase B — English · rotation screen validation messages");
await launch();
await step("R2a login as flagged account shows the rotation screen (reason stated)", async () => {
  await login("e2estaff", COMMON_PWD);
  await page.getByText(EN.rotateTitle).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByText(EN.rotateSub, { exact: false }).waitFor({ state: "visible", timeout: 5_000 });
});
await step("R2b short new password -> clean localized message, NO raw IPC wrapper", async () => {
  await inputs().nth(0).fill("abc");
  await inputs().nth(1).fill("abc");
  await page.getByRole("button", { name: "Set new password" }).click();
  const txt = await errorText();
  if (!txt.includes(EN.short)) throw new Error(`expected "${EN.short}", got "${txt}"`);
  await assertNoRawIpcError();
});
await step("R3 complexity violation -> clean localized message, NO raw IPC wrapper", async () => {
  await inputs().nth(0).fill("alllowercase1!");
  await inputs().nth(1).fill("alllowercase1!");
  await page.getByRole("button", { name: "Set new password" }).click();
  const txt = await errorText();
  if (!txt.includes(EN.weak)) throw new Error(`expected "${EN.weak}", got "${txt}"`);
  await assertNoRawIpcError();
});
await step("R4 confirm mismatch -> mismatch message", async () => {
  await inputs().nth(0).fill("NewStrong@2026");
  await inputs().nth(1).fill("NewStrong@2027");
  await page.getByRole("button", { name: "Set new password" }).click();
  const txt = await errorText();
  if (!txt.includes(EN.mismatch)) throw new Error(`expected "${EN.mismatch}", got "${txt}"`);
});
await step("R5 strong password -> rotation succeeds, dashboard reached", async () => {
  await inputs().nth(0).fill("NewStrong@2026");
  await inputs().nth(1).fill("NewStrong@2026");
  await page.getByRole("button", { name: "Set new password" }).click();
  await page.locator(".stat").first().waitFor({ state: "visible", timeout: 20_000 });
});
await step("R6 old common password rejected on next login", async () => {
  await logout();
  await login("e2estaff", COMMON_PWD);
  const txt = await errorText();
  if (!txt.includes(EN.invalidCredentials)) throw new Error(`expected "${EN.invalidCredentials}", got "${txt}"`);
  await assertNoRawIpcError();
});
await step("R7 new password logs in straight to dashboard (no second rotation)", async () => {
  await login("e2estaff", "NewStrong@2026");
  await page.locator(".stat").first().waitFor({ state: "visible", timeout: 15_000 });
  if (await page.getByText(EN.rotateTitle).count()) throw new Error("rotation screen shown again after successful rotation");
});
await closeApp();

console.log("Phase C — Malayalam · rotation messages in ml");
await launch({ lang: "ml" });
await step("R8 login as flagged account shows the rotation screen in Malayalam", async () => {
  await login("e2estaff2", COMMON_PWD);
  await page.getByText(ML.rotateTitle).waitFor({ state: "visible", timeout: 15_000 });
});
await step("R9 short new password -> Malayalam message, NO raw IPC wrapper", async () => {
  await inputs().nth(0).fill("abc");
  await inputs().nth(1).fill("abc");
  await page.getByRole("button", { name: "പാസ്‌വേഡ് സജ്ജമാക്കുക" }).click();
  const txt = await errorText();
  if (!txt.includes(ML.short)) throw new Error(`expected "${ML.short}", got "${txt}"`);
  await assertNoRawIpcError();
});
await step("R10 complexity violation -> Malayalam message, NO raw IPC wrapper", async () => {
  await inputs().nth(0).fill("alllowercase1!");
  await inputs().nth(1).fill("alllowercase1!");
  await page.getByRole("button", { name: "പാസ്‌വേഡ് സജ്ജമാക്കുക" }).click();
  const txt = await errorText();
  if (!txt.includes(ML.weak)) throw new Error(`expected "${ML.weak}", got "${txt}"`);
  await assertNoRawIpcError();
});
await step("R11 strong password -> rotation succeeds (ml)", async () => {
  await inputs().nth(0).fill("Second@2026");
  await inputs().nth(1).fill("Second@2026");
  await page.getByRole("button", { name: "പാസ്‌വേഡ് സജ്ജമാക്കുക" }).click();
  await page.locator(".stat").first().waitFor({ state: "visible", timeout: 20_000 });
});
await closeApp();

console.log("Phase D — Topbar in-app change password (Profile dialog) validation");
// Pin EN: Phase C's ml seed persists in the profile's localStorage, and the
// Topbar labels/toasts would otherwise come back in Malayalam.
await launch({ lang: "en" });
await step("D1 login as the rotated account (no rotation gate) -> dashboard", async () => {
  await login("e2estaff", "NewStrong@2026");
  await page.locator(".stat").first().waitFor({ state: "visible", timeout: 15_000 });
});
async function openProfile() {
  await page.locator("button.avbtn").click();
  // Menu item label is t("tb_profile") = "Profile".
  await page.locator(".menuit-btn", { hasText: "Profile" }).first().click();
  const d = page.locator(".modal-root.open .modal").last();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  return d;
}
const pwdFields = () => page.locator(".modal-root.open .modal input[type='password']");
async function expectToast(pattern, timeout = 12_000) {
  await page.locator(".toast", { hasText: pattern }).first().waitFor({ state: "visible", timeout });
}
await step("D2 weak new password in Profile -> localized policy toast, NO raw wrapper", async () => {
  const d = await openProfile();
  await pwdFields().nth(0).fill("short1!");
  await pwdFields().nth(1).fill("short1!");
  await d.getByRole("button", { name: "Save Password" }).click();
  await expectToast("Password must be at least 8 characters");
  await assertNoRawIpcError();
});
await step("D3 complexity violation in Profile -> localized policy toast", async () => {
  await pwdFields().nth(0).fill("alllowercase1!");
  await pwdFields().nth(1).fill("alllowercase1!");
  await page.locator(".modal-root.open .modal").getByRole("button", { name: "Save Password" }).click();
  await expectToast("Password must include uppercase, lowercase, a number and a special character");
  await assertNoRawIpcError();
});
await step("D4 confirm mismatch in Profile -> mismatch toast", async () => {
  await pwdFields().nth(0).fill("TopSecret@99");
  await pwdFields().nth(1).fill("TopSecret@98");
  await page.locator(".modal-root.open .modal").getByRole("button", { name: "Save Password" }).click();
  await expectToast("Passwords do not match");
});
await step("D5 strong password in Profile -> success toast, dialog closes", async () => {
  await pwdFields().nth(0).fill("TopSecret@99");
  await pwdFields().nth(1).fill("TopSecret@99");
  await page.locator(".modal-root.open .modal").getByRole("button", { name: "Save Password" }).click();
  await expectToast("Password updated successfully");
  await page.locator(".modal-root.open").waitFor({ state: "hidden", timeout: 8_000 });
});
await closeApp();

console.log(`\n═══════════ SUMMARY ═══════════`);
console.log(`TOTAL: ${passed} PASS / ${failed} FAIL of ${passed + failed}`);
if (failures.length) { console.log("\nFailures:"); for (const f of failures) console.log(`  ✗ ${f.name}: ${f.msg}`); process.exitCode = 1; }
else console.log("ALL ROTATION-SCREEN CLIENT-SIDE CHECKS PASSED — no raw IPC wrapper ever reached the UI");

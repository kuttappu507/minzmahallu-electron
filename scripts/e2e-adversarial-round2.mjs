/*
 * e2e-adversarial-round2.mjs — Hostile-user sweep ROUND 2 on the REAL app.
 *
 * Round 1 (e2e-adversarial-user.mjs) replayed + generalised the user's 14
 * reports (double-submit, outside-click, toasts...). Round 2 hunts the bug
 * classes neither the user nor round 1 hit YET:
 *
 *   R01-R02  PASTE country-coded phones ("+91 98470 12345", "098470 12345")
 *            -> used to corrupt silently to "9198470123" (clampPhone10 fix)
 *   R03      Donation amount -500 -> blocked with clean localized message,
 *            dialog stays open, NO row (amount validation)
 *   R04      Donation amount 0 -> blocked, no row
 *   R05      Donation amount 2500 with pasted +91 phone -> saved exactly once
 *   R06      "Send receipt on WhatsApp" with the engine DISCONNECTED ->
 *            localized guidance toast and NEVER Electron's raw
 *            "Error invoking remote method ..." wrapper (preload sanitizer)
 *   R07      Escape key cannot discard a half-filled dialog (data-loss class)
 *   R08      Language switch en->ml->en live, no reload, no crash
 *   R09      Hostile member name (script tag + quotes + Malayalam + emoji)
 *            saves, is listed, searchable — no injection/crash
 *   R10      Accounting expense amount -100 -> blocked, dialog stays open
 *   R11      Staff salary -500 -> blocked ("cannot be negative"), dialog open
 *   R12      WhatsApp page with disconnected engine renders without crash
 *
 * Run:  npm run build && xvfb-run -a node scripts/e2e-adversarial-round2.mjs
 */

import { _electron } from "file:///home/z/.npm-global/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE = "/home/z/my-project/.cache/mms-e2e-r2-profile";
const ADMIN = { fullName: "Round2 Administrator", username: "r2admin", password: "Prod@2026" };
const MARK = (s) => `R2${Date.now() % 100000}${s}`;
const TODAY = new Date().toISOString().slice(0, 10);
const ML_SCRIPT = /[\u0D00-\u0D7F]/;

let page, electronApp;
let passed = 0, failed = 0;
const failShots = [];

function mod(name) { console.log(`\n━━━ ${name} ━━━`); }

async function check(name, fn) {
  try { await fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    console.error(`  FAIL  ${name}\n        ${msg}`);
    try {
      const n = String(failed).padStart(2, "0");
      await page.screenshot({ path: `${PROFILE}/fail-${n}.png` });
      failShots.push(`${PROFILE}/fail-${n}.png`);
    } catch {}
  }
  // ALWAYS self-clean: a failed check must never poison the next one with a
  // leftover open dialog (round-1 suite cascaded exactly this way).
  try { await closeAllDialogs(); } catch {}
}

/* ---------- helpers (same harness as round 1) ---------- */
const nav = (h) => page.evaluate((hash) => { window.location.hash = hash; }, h);
const dlg = () => page.locator(".modal-root.open .modal").last();
async function expectToast(pattern, timeout = 12_000) {
  await page.locator(".toast", { hasText: pattern }).first().waitFor({ state: "visible", timeout });
}
const row = (text) => page.locator("table tbody tr", { hasText: text }).first();
const rowCount = (text) => page.locator("table tbody tr", { hasText: text }).count();

async function openAdd(navHash, buttonText) {
  await nav(navHash);
  const btn = page.getByRole("button", { name: buttonText }).first();
  await btn.waitFor({ state: "visible", timeout: 15_000 });
  await btn.click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  return d;
}

async function assertDialogClosedThenRow(marker, timeout = 12_000) {
  await page.locator(".modal-root.open").first()
    .waitFor({ state: "detached", timeout: 8_000 })
    .catch(async () => {
      if (await page.locator(".modal-root.open").count()) {
        const txt = await dlg().innerText().catch(() => "");
        throw new Error(`dialog still open: "${txt.slice(0, 80)}"`);
      }
    });
  await row(marker).waitFor({ state: "visible", timeout });
}

async function closeAllDialogs() {
  for (let i = 0; i < 5; i++) {
    if (!(await page.locator(".modal-root.open").count())) return;
    const d = page.locator(".modal-root.open .modal").last();
    const cancel = d.getByRole("button", { name: /Cancel|Close/ }).last();
    if (await cancel.count()) await cancel.click({ timeout: 2_000 }).catch(() => {});
    else {
      const x = d.locator(".ibtn").first();
      if (await x.count()) await x.click({ timeout: 2_000 }).catch(() => {});
    }
    await page.waitForTimeout(350);
  }
}
async function closeAllDialogsRef() { return closeAllDialogs(); }

/* ---------- fresh profile + launch ---------- */
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(PROFILE, { recursive: true });

console.log("Launching MMS (electron) with a fresh profile…");
electronApp = await _electron.launch({
  cwd: ROOT,
  args: [".", "--disable-dev-shm-usage", "--disable-gpu"],
  executablePath: path.join(ROOT, "node_modules", "electron", "dist", "electron"),
  env: { ...process.env, XDG_CONFIG_HOME: PROFILE },
  timeout: 60_000,
});
page = await electronApp.firstWindow();
page.setDefaultTimeout(20_000);

/* ================= setup ================= */
mod("Setup & login");
await check("administrator created (fresh profile)", async () => {
  await page.getByText("Initial Setup").waitFor({ state: "visible", timeout: 30_000 });
  const inputs = page.locator(".login-form input.inp");
  await inputs.nth(0).fill(ADMIN.fullName);
  await inputs.nth(1).fill(ADMIN.username);
  await inputs.nth(2).fill(ADMIN.password);
  await inputs.nth(3).fill(ADMIN.password);
  await page.getByRole("button", { name: "Create Administrator Account" }).click();
  await page.locator(".win-controls").waitFor({ state: "visible", timeout: 30_000 });
});

await check("seed family created", async () => {
  const d = await openAdd("#/families", "Add Family");
  await d.locator("input").nth(0).fill("R2 Seed House");
  await d.locator("input").nth(4).fill("9876500000");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Saved successfully");
  await row("R2 Seed House").waitFor({ state: "visible", timeout: 10_000 });
});

/* ================= R01-R02 paste-safe phones ================= */
mod("R01/R02 Paste country-coded phone numbers");
await check("R01 paste '+91 98470 12345' -> 9847012345", async () => {
  const HOUSE = MARK(" Paste91 House");
  const d = await openAdd("#/families", "Add Family");
  await d.locator("input").nth(0).fill(HOUSE);
  const phone = d.locator("input").nth(4);
  await phone.fill("+91 98470 12345");
  const v = await phone.inputValue();
  if (v !== "9847012345") throw new Error(`phone corrupted: "${v}"`);
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await assertDialogClosedThenRow(HOUSE);
});

await check("R02 paste '098470 12345' into alt phone -> 9847012345", async () => {
  const HOUSE = MARK(" Paste0 House");
  const d = await openAdd("#/families", "Add Family");
  await d.locator("input").nth(0).fill(HOUSE);
  await d.locator("input").nth(4).fill("9876502222");
  const alt = d.locator("input").nth(5);
  await alt.fill("098470 12345");
  const v = await alt.inputValue();
  if (v !== "9847012345") throw new Error(`alt phone corrupted: "${v}"`);
  await d.getByRole("button", { name: "Cancel" }).click();
  await page.locator(".modal-root.open").first().waitFor({ state: "detached", timeout: 5_000 });
});

/* ================= R03-R05 donation amounts ================= */
mod("R03-R05 Donation amount abuse");
async function donationDialog(amountStr, donorName, phone) {
  const d = await openAdd("#/donations", "Add Donation");
  await d.locator("input.inp").first().fill(donorName);
  if (phone) {
    const ph = d.locator('input[placeholder="98XXXXXXXX"]');
    await ph.fill(phone);
  }
  await d.locator("select").first().selectOption({ index: 1 });
  const amt = d.locator('input[type="number"]');
  await amt.fill(amountStr);
  return d;
}

await check("R03 donation amount -500 -> blocked, dialog open, no row", async () => {
  const NAME = MARK(" NegDonor");
  const d = await donationDialog("-500", NAME, "9876503333");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast(/greater than 0|amount/i);
  if (!(await page.locator(".modal-root.open").count())) throw new Error("dialog closed on invalid amount");
  await page.waitForTimeout(1_200); // let any rogue IPC land
  if ((await rowCount(NAME)) !== 0) throw new Error("negative-amount donation was SAVED");
  await d.getByRole("button", { name: "Cancel" }).click();
});

await check("R04 donation amount 0 -> blocked, no row", async () => {
  const NAME = MARK(" ZeroDonor");
  const d = await donationDialog("0", NAME, "9876504444");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast(/greater than 0|amount|required/i);
  await page.waitForTimeout(1_200);
  if ((await rowCount(NAME)) !== 0) throw new Error("zero-amount donation was SAVED");
  await d.getByRole("button", { name: "Cancel" }).click();
});

const DONOR = MARK(" GoodDonor");
await check("R05 donation 2500 with pasted +91 phone -> saved once", async () => {
  const d = await donationDialog("2500", DONOR, "+91 98765 12345");
  const ph = d.locator('input[placeholder="98XXXXXXXX"]');
  const v = await ph.inputValue();
  if (v !== "9876512345") throw new Error(`donor phone corrupted: "${v}"`);
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await assertDialogClosedThenRow(DONOR);
  const n = await rowCount(DONOR);
  if (n !== 1) throw new Error(`expected 1 donation row, got ${n}`);
});

/* ================= R06 receipt send while disconnected ================= */
mod("R06 WhatsApp receipt send with engine DISCONNECTED");
await check("R06 clean localized toast, NEVER the raw IPC wrapper", async () => {
  await nav("#/donations");
  const btn = row(DONOR).getByTitle("Send receipt on WhatsApp");
  await btn.waitFor({ state: "visible", timeout: 10_000 });
  await btn.click();
  // immediate ack toast first, then the failure guidance
  await expectToast(/Sending receipt on WhatsApp/i, 6_000);
  await expectToast(/WhatsApp is not connected|No internet connection/i, 20_000);
  // the whole point: Electron's technical wrapper must never surface
  await page.waitForTimeout(300);
  const raw = await page.locator(".toast", { hasText: "Error invoking" }).count();
  if (raw !== 0) throw new Error(`raw IPC wrapper leaked in ${raw} toast(s)`);
});

/* ================= R07 Escape cannot discard a filled dialog ================= */
mod("R07 Escape key on a half-filled dialog");
await check("R07 Escape keeps the dialog + typed text", async () => {
  const HOUSE = MARK(" EscapeHouse");
  const d = await openAdd("#/families", "Add Family");
  await d.locator("input").nth(0).fill(HOUSE);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  if (!(await page.locator(".modal-root.open").count())) {
    throw new Error("Escape DISCARDED the half-filled dialog (data-loss class)");
  }
  const v = await d.locator("input").nth(0).inputValue();
  if (v !== HOUSE) throw new Error(`dialog survived but text lost: "${v}"`);
  await closeAllDialogs();
});

/* ================= R08 language switch ================= */
mod("R08 Language switch en<->ml");
await check("R08 en->ml live re-label, back to en, no crash", async () => {
  // NOTE: a dialog's full-screen overlay intentionally blocks the topbar, so
  // the realistic user flow is switching on a module page — verify live
  // re-labelling both ways without a reload. The module H1 is asserted, NOT
  // body text: the language-switcher button itself is always labelled "മല"
  // in both languages, so body text always contains Malayalam glyphs.
  await nav("#/members");
  await page.waitForTimeout(600);
  const h1 = page.locator(".vhead h1").first();
  await h1.waitFor({ state: "visible", timeout: 10_000 });
  if (ML_SCRIPT.test(await h1.innerText())) throw new Error("page already in Malayalam before switch");
  await page.locator(".langseg button").nth(1).click();
  await page.waitForTimeout(700);
  const mlHead = await h1.innerText();
  if (!ML_SCRIPT.test(mlHead)) throw new Error(`UI did not localize to Malayalam (h1="${mlHead}")`);
  await page.locator(".langseg button").nth(0).click();
  await page.waitForTimeout(500);
  const enHead = await h1.innerText();
  if (ML_SCRIPT.test(enHead)) throw new Error(`UI did not switch back to English (h1="${enHead}")`);
});

/* ================= R09 hostile member name ================= */
mod("R09 Hostile member name (script/quotes/Malayalam/emoji)");
await check("R09 saves, listed, searchable, intact", async () => {
  const NAME = `R2<script>"'ടെസ്റ്റ് 🕌 & <b>${Date.now() % 10000}`;
  const d = await openAdd("#/members", "Add Member");
  await d.locator("select").nth(0).selectOption({ index: 1 });
  await d.locator("input.inp").first().fill(NAME);
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Saved successfully");
  await assertDialogClosedThenRow(NAME);
  await nav("#/members");
  await page.waitForTimeout(500);
  const search = page.locator('input[placeholder*="earch" i], .card input[type="text"]').first();
  await search.waitFor({ state: "visible", timeout: 8_000 });
  await search.fill("ടെസ്റ്റ്");
  await page.waitForTimeout(1_000);
  const found = await rowCount(NAME);
  if (found !== 1) throw new Error(`hostile-name member not found via search (got ${found})`);
  await search.fill("");
});

/* ================= R10 Accounting negative expense ================= */
mod("R10 Accounting amount validation");
await check("R10 expense -100 -> blocked, dialog open", async () => {
  const d = await openAdd("#/accounting", "Add Expense");
  await d.locator('input[type="date"]').fill(TODAY);
  await d.locator('input[type="number"]').first().fill("-100");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast(/greater than 0|amount/i);
  if (!(await page.locator(".modal-root.open").count())) throw new Error("dialog closed on invalid amount");
  await d.getByRole("button", { name: "Cancel" }).click();
  await page.locator(".modal-root.open").first().waitFor({ state: "detached", timeout: 5_000 });
});

/* ================= R11 Staff negative salary ================= */
mod("R11 Staff salary validation");
await check("R11 salary -500 -> blocked, dialog open", async () => {
  const NAME = MARK(" SalaryStaff");
  const d = await openAdd("#/staff", "Add Staff");
  await d.locator("input.inp").first().fill(NAME);
  await d.locator('input[type="number"]').first().fill("-500");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast(/negative|amount/i);
  if (!(await page.locator(".modal-root.open").count())) throw new Error("dialog closed on invalid salary");
  await closeAllDialogs();
});

/* ================= R12 WhatsApp page with disconnected engine ================= */
mod("R12 WhatsApp page renders with disconnected engine");
await check("R12 no crash, connect CTA visible", async () => {
  await nav("#/whatsapp");
  await page.getByRole("button", { name: /Connect/i }).first()
    .waitFor({ state: "visible", timeout: 12_000 });
  const errors = await page.locator(".toast", { hasText: "Error invoking" }).count();
  if (errors !== 0) throw new Error("raw IPC wrapper visible on WhatsApp page");
});

/* ================= done ================= */
await closeAllDialogs();
console.log(`\n════════════════════════════════════`);
console.log(`  ROUND-2 RESULT: ${passed} passed, ${failed} failed`);
console.log(`════════════════════════════════════`);
if (failShots.length) console.log(`failures screenshotted: ${failShots.join(", ")}`);

await electronApp.close().catch(() => {});
process.exit(failed ? 1 : 0);

/*
 * e2e-adversarial-user.mjs — PROACTIVE hostile-user sweep on the REAL app.
 *
 * Motivation: the user found 14 bugs in 15 minutes of real usage while all
 * our gates were green. Class analysis of those bugs: double-submit, silent
 * dialogs, stale lists, clipped ml UI, wrong toasts — none of which are
 * caught by unit tests, type checks or happy-path E2E. This sweep ACTS like
 * a fast, careless, hostile user:
 *
 *   A01-A10  Save clicked TWICE (same-frame dispatch) in ALL 10 form modules
 *            -> exactly ONE row must exist per marker (double-submit guard)
 *   A11      Donation triple-click regression (the original user report)
 *   A12      Empty form + Save -> validation error, dialog STAYS open
 *   A13      Outside-click cannot close Add dialogs (3 modules spot-check)
 *   A14      Cancel -> reopen: form must NOT show the cancelled half-input
 *   A15      Freshly created family is IMMEDIATELY in the member picker
 *   A16      Search survives SQL/xss-style junk (% ' " <script> അ)
 *   A17      Rapid module hopping (8 modules, 400ms apart) — no crash
 *   A18      No dialogs left open after the whole storm
 *
 * Run:  xvfb-run -a node scripts/e2e-adversarial-user.mjs
 */

import { _electron } from "file:///home/z/.npm-global/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE = "/home/z/my-project/.cache/mms-e2e-adv-profile";
const ADMIN = { fullName: "Adversary Administrator", username: "advadmin", password: "Prod@2026" };
const PWD = ADMIN.password;
const MARK = (s) => `ADV${Date.now() % 100000}${s}`;
const TODAY = new Date().toISOString().slice(0, 10);

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
}

/* ---------- helpers (same harness as the batch sweep) ---------- */
const nav = (h) => page.evaluate((hash) => { window.location.hash = hash; }, h);
const dlg = () => page.locator(".modal-root.open .modal").last();
async function expectToast(pattern, timeout = 12_000) {
  await page.locator(".toast", { hasText: pattern }).first().waitFor({ state: "visible", timeout });
}
const row = (text) => page.locator("table tbody tr", { hasText: text }).first();
const rowCount = (text) => page.locator("table tbody tr", { hasText: text }).count();

/* Open a module's Add dialog and return the dialog locator. */
async function openAdd(navHash, buttonText) {
  await nav(navHash);
  const btn = page.getByRole("button", { name: buttonText }).first();
  await btn.waitFor({ state: "visible", timeout: 15_000 });
  await btn.click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  return d;
}

/*
 * THE core stress: two clicks dispatched INSIDE the renderer in the same
 * tick — Playwright's own click/dispatchEvent auto-waits between calls, so a
 * real same-frame race can only be simulated from page context. Both clicks
 * run before React can re-render, so a state-only guard (disabled={busy})
 * would let BOTH through and create two records. The synchronous ref lock
 * must reject the second.
 */
async function inPageClickSave(d, times = 2) {
  return d.evaluate((_, n) => {
    const save = [...document.querySelectorAll("button")]
      .filter((b) => b.textContent.trim() === "Save").pop();
    if (!save) throw new Error("Save button not found in dialog");
    for (let i = 0; i < n; i++) save.click();
    return `${n} clicks dispatched in-page`;
  }, times);
}

async function doubleClickSave(d) {
  await inPageClickSave(d, 2);
}

/* Assert: correct toast fires IMMEDIATELY, dialog closes, exactly ONE row. */
async function assertSavedOnce(marker, toastText) {
  if (toastText) await expectToast(toastText, 5_000); // toast TTL is 3.5s — check before anything else
  // dialog must close on its own (slow under xvfb — allow up to 8s)
  await page
    .locator(".modal-root.open")
    .first()
    .waitFor({ state: "detached", timeout: 8_000 })
    .catch(async () => {
      if (await page.locator(".modal-root.open").count()) {
        const txt = await dlg().innerText().catch(() => "");
        throw new Error(`dialog still open after save: "${txt.slice(0, 80)}"`);
      }
    });
  await row(marker).waitFor({ state: "visible", timeout: 12_000 });
  const n = await rowCount(marker);
  if (n !== 1) throw new Error(`expected exactly 1 row for ${marker}, got ${n}`);
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
  await d.locator("input").nth(0).fill("ADV Seed House");
  await d.locator("input").nth(4).fill("9876500000");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Saved successfully");
  await row("ADV Seed House").waitFor({ state: "visible", timeout: 10_000 });
});

/* ================= A01-A10 double-submit battery ================= */
mod("A01 Families — same-frame double click");
const HOUSE = MARK(" House");
await check("double-click Save -> exactly 1 family", async () => {
  const d = await openAdd("#/families", "Add Family");
  await d.locator("input").nth(0).fill(HOUSE);
  await d.locator("input").nth(4).fill("9876501111");
  await doubleClickSave(d);
  await assertSavedOnce(HOUSE, "Saved successfully");
});

mod("A02 Members — same-frame double click");
const MEMBER = MARK(" Member");
await check("double-click Save -> exactly 1 member", async () => {
  const d = await openAdd("#/members", "Add Member");
  await d.locator("select").nth(0).selectOption({ index: 1 });
  await d.locator("input.inp").first().fill(MEMBER);
  await doubleClickSave(d);
  await assertSavedOnce(MEMBER, "Saved successfully");
});

mod("A03 Staff — same-frame double click");
const STAFF = MARK(" Staff");
await check("double-click Save -> exactly 1 staff", async () => {
  const d = await openAdd("#/staff", "Add Staff");
  await d.locator("input.inp").first().fill(STAFF);
  await doubleClickSave(d);
  await assertSavedOnce(STAFF, "Staff record saved");
});

mod("A04 Committee — same-frame double click");
const COMM = MARK(" Commit");
await check("double-click Save -> exactly 1 committee member", async () => {
  const d = await openAdd("#/committee", "Add Committee Member");
  await d.locator("input.inp").first().fill(COMM);
  await doubleClickSave(d);
  await assertSavedOnce(COMM, "Committee record saved");
});

mod("A05 Marriages — same-frame double click");
const BRIDE = MARK(" Bride");
const GROOM = MARK(" Groom");
await check("double-click Save -> exactly 1 nikah record", async () => {
  const d = await openAdd("#/marriages", "Register Marriage");
  const inputs = d.locator("input.inp");
  await inputs.nth(0).fill(BRIDE);
  await inputs.nth(2).fill(GROOM); // input.inp: 0=bride, 1=bride father, 2=groom (textareas don't match)
  await d.locator('input[type="date"]').first().fill(TODAY);
  await doubleClickSave(d);
  await assertSavedOnce(BRIDE, "Register Marriage");
});

mod("A06 Deaths — same-frame double click");
const DECEASED = MARK(" Deceased");
await check("double-click Save -> exactly 1 death record", async () => {
  const d = await openAdd("#/deaths", "Add Record");
  await d.locator("input.inp").first().fill(DECEASED);
  await d.locator('input[type="date"]').first().fill(TODAY);
  await doubleClickSave(d);
  await assertSavedOnce(DECEASED, null);
});

mod("A07 Welfare — same-frame double click");
const APPLICANT = MARK(" Applicant");
await check("double-click Save -> exactly 1 welfare request", async () => {
  const d = await openAdd("#/welfare", "New Request");
  await d.locator("input.inp").first().fill(APPLICANT);
  await d.locator('input[type="number"]').first().fill("1500");
  await d.locator("select").nth(1).selectOption({ index: 1 }); // category is DB-required (CHECK)
  await doubleClickSave(d);
  await assertSavedOnce(APPLICANT, null);
});

mod("A07b Welfare — empty category must NOT leak a raw SqliteError");
await check("no category -> clean bilingual error, dialog stays open", async () => {
  const d = await openAdd("#/welfare", "New Request");
  await d.locator("input.inp").first().fill(`${APPLICANT} NoCat`);
  await d.locator('input[type="number"]').first().fill("900");
  await inPageClickSave(d, 1);
  await expectToast("Select an assistance category", 4_000);
  await page.waitForTimeout(600);
  const allToasts = (await page.locator(".toast").allInnerTexts()).join(" | ");
  if (/Error invoking|SqliteError/i.test(allToasts)) throw new Error(`raw DB error leaked: ${allToasts.slice(0, 120)}`);
  if (!(await page.locator(".modal-root.open").count())) throw new Error("dialog closed on validation error");
  await closeAllDialogs();
});

mod("A08 Assets — same-frame double click");
const ASSET = MARK(" Asset");
await check("double-click Save -> exactly 1 asset", async () => {
  const d = await openAdd("#/assets", /Add Asset|Add/);
  await d.locator("input.inp").first().fill(ASSET);
  await doubleClickSave(d);
  await assertSavedOnce(ASSET, null);
});

mod("A09 Accounting — same-frame double click");
const DESC = MARK(" ledger entry");
await check("double-click Save -> exactly 1 ledger entry", async () => {
  const d = await openAdd("#/accounting", /Add Income|Add Transaction|Add/);
  await d.locator('input[type="number"]').first().fill("500");
  await d.locator('input[type="date"]').first().fill(TODAY);
  await d.locator("textarea").first().fill(DESC);
  await doubleClickSave(d);
  await assertSavedOnce(DESC, null);
});

mod("A10 Users — same-frame double click");
const UNAME = MARK("advusr");
await check("double-click Save -> exactly 1 user", async () => {
  const d = await openAdd("#/users", "Add User");
  await d.locator("input").nth(0).fill(UNAME);
  await d.locator("input").nth(1).fill(`ADV User ${UNAME}`);
  await d.locator('input[type="password"]').first().fill("AdvUser@2026");
  await doubleClickSave(d);
  await page.waitForTimeout(1_500);
  if (await page.locator(".modal-root.open").count()) {
    const txt = await dlg().innerText().catch(() => "");
    throw new Error(`dialog still open: "${txt.slice(0, 100)}"`);
  }
  await row(UNAME).waitFor({ state: "visible", timeout: 12_000 });
  const n = await rowCount(UNAME);
  if (n !== 1) throw new Error(`expected 1 user row, got ${n}`);
});

mod("A11 Donations — original user bug regression (triple human click)");
const DONOR = MARK(" Donor");
await check("click + dblclick + click -> exactly 1 donation", async () => {
  const d = await openAdd("#/donations", "Add Donation");
  await d.locator("input.inp").nth(0).fill(DONOR);
  await d.locator("input.inp").nth(1).fill("9876501234");
  await d.locator("select").first().selectOption({ index: 1 });
  await d.locator('input[type="number"]').first().fill("250");
  const saveBtn = d.getByRole("button", { name: "Save", exact: true });
  await saveBtn.click();
  await saveBtn.click({ timeout: 900 }).catch(() => {});
  await saveBtn.click({ timeout: 900 }).catch(() => {});
  await assertSavedOnce(DONOR, null);
});

/* ================= A12 empty save rejected ================= */
mod("A12 Empty form save");
await check("Save with empty form -> error toast, dialog STAYS open", async () => {
  const d = await openAdd("#/families", "Add Family");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(900);
  const toasts = await page.locator(".toast").allInnerTexts();
  if (toasts.some((t) => /Saved successfully/i.test(t))) throw new Error("empty form reported SUCCESS");
  if (!(await page.locator(".modal-root.open").count())) throw new Error("empty save closed the dialog silently");
  await closeAllDialogs();
});

/* ================= A13 outside-click spot checks ================= */
mod("A13 Outside-click cannot discard");
await check("Add Family / Add Member / Add Staff stay open on backdrop click", async () => {
  for (const [hash, btn] of [["#/families", "Add Family"], ["#/members", "Add Member"], ["#/staff", "Add Staff"]]) {
    const d = await openAdd(hash, btn);
    await page.mouse.click(8, 8);
    await page.waitForTimeout(450);
    if (!(await page.locator(".modal-root.open").count())) throw new Error(`${hash}: dialog closed on outside click`);
    if (!(await d.isVisible())) throw new Error(`${hash}: dialog not visible after outside click`);
    await closeAllDialogs();
  }
});

/* ================= A14 cancel -> reopen must not keep half-inputs ================= */
mod("A14 Cancel resets form");
await check("typed house name does NOT bleed into a fresh Add dialog", async () => {
  const d = await openAdd("#/families", "Add Family");
  await d.locator("input").nth(0).fill("CANCELLED GHOST HOUSE");
  await d.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(500);
  const d2 = await openAdd("#/families", "Add Family");
  const v = await d2.locator("input").nth(0).inputValue();
  if (v !== "") throw new Error(`stale cancelled input bled into fresh dialog: "${v}"`);
  await closeAllDialogs();
});

/* ================= A15 fresh family in member picker ================= */
mod("A15 Stale-dropdown check");
const FRESH = MARK(" FreshFam");
await check("family created NOW is selectable in Add Member NOW", async () => {
  const d = await openAdd("#/families", "Add Family");
  await d.locator("input").nth(0).fill(FRESH);
  await d.locator("input").nth(4).fill("9876502222");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await row(FRESH).waitFor({ state: "visible", timeout: 10_000 });
  const md = await openAdd("#/members", "Add Member");
  const opts = await md.locator("select").nth(0).locator("option").allInnerTexts();
  if (!opts.some((o) => o.includes(FRESH))) throw new Error(`fresh family missing from picker: ${opts.join("|").slice(0, 150)}`);
  await closeAllDialogs();
});

/* ================= A16 hostile search input ================= */
mod("A16 Search with hostile text");
await check("families search survives % ' \" <script> അ", async () => {
  await nav("#/families");
  await page.locator("table thead").waitFor({ state: "visible", timeout: 10_000 });
  const search = page.locator('input[placeholder*="earch" i], .card input[type="text"]').first();
  await search.waitFor({ state: "visible", timeout: 8_000 });
  await search.fill(`%' "<script>alert(1)</script>അ\\`);
  await page.waitForTimeout(800);
  if (!(await page.locator("table thead").isVisible())) throw new Error("table disappeared on hostile search");
  await search.fill("");
  await page.waitForTimeout(400);
  await row("ADV Seed House").waitFor({ state: "visible", timeout: 8_000 });
});

/* ================= A17 rapid module hopping ================= */
mod("A17 Rapid navigation storm");
await check("8 modules in quick succession — app stays alive", async () => {
  const routes = ["#/dashboard", "#/families", "#/members", "#/staff", "#/committee", "#/donations", "#/accounting", "#/reports"];
  for (const r of routes) { await nav(r); await page.waitForTimeout(400); }
  await page.locator("table, .card").first().waitFor({ state: "visible", timeout: 10_000 });
  // app must still be interactive: open and cancel a dialog
  await nav("#/families");
  const d = await openAdd("#/families", "Add Family");
  await d.getByRole("button", { name: "Cancel" }).click();
});

/* ================= A18 no leftover dialogs ================= */
mod("A18 Cleanup sanity");
await check("no dialogs left open after the storm", async () => {
  await page.waitForTimeout(600);
  const n = await page.locator(".modal-root.open").count();
  if (n) {
    await closeAllDialogs();
    throw new Error(`${n} dialog(s) were left open`);
  }
});

/* ---------- summary ---------- */
console.log(`\n══════════════════════════════════════`);
console.log(`  ADVERSARIAL SWEEP: ${passed} passed, ${failed} failed`);
console.log(`══════════════════════════════════════`);
if (failShots.length) console.log(`  screenshots: ${failShots.join(", ")}`);
await electronApp.close();
process.exit(failed ? 1 : 0);

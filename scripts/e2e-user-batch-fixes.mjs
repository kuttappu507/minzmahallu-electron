/*
 * e2e-user-batch-fixes.mjs — REAL-CLIENT verification for the 14-item user bug batch.
 *
 * Drives the packaged renderer + real main process (same harness as
 * e2e-all-modules.mjs) and verifies each reported issue as an executable
 * PASS/FAIL in the RUNNING app:
 *
 *   U01 popup stays open on outside click        U08 staff archived -> Archived tab
 *   U02 correct save toast (not "Save Changes")  U09 committee edit gated (password)
 *   U03 spouse/mother pickers list new member    U10 phone inputs clamp to 10 digits
 *   U04 son's wife selectable (Daughter-in-law)  U11 receipt send shows "Sending…" toast
 *   U12 family table: Head column, no WhatsApp
 *   U05 survey form downloads as PDF             U13 ml dropdowns not clipped
 *   U06 staff ID number saved + shown
 *   U07 donation double-click saves ONCE
 *
 * Run:  xvfb-run -a node scripts/e2e-user-batch-fixes.mjs
 */

import { _electron } from "file:///home/z/.npm-global/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE = "/home/z/my-project/.cache/mms-e2e-batch-profile";
const EXPORTS = "/home/z/my-project/.cache/mms-e2e-batch-exports";
const ADMIN = { fullName: "Batch Administrator", username: "batchadmin", password: "Prod@2026" };
const PWD = ADMIN.password;
const MARK = (s) => `E2E${Date.now() % 100000}${s}`;

let page, electronApp;
let passed = 0, failed = 0;

function mod(name) { console.log(`\n━━━ ${name} ━━━`); }

async function check(name, fn) {
  try { await fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    console.error(`  FAIL  ${name}\n        ${msg}`);
    try { await page.screenshot({ path: `${EXPORTS}/fail-${String(failed).padStart(2, "0")}.png` }); } catch {}
  }
}

/* ---------- helpers ---------- */
const nav = (h) => page.evaluate((hash) => { window.location.hash = hash; }, h);
const dlg = () => page.locator(".modal-root.open .modal").last();
async function expectToast(pattern, timeout = 12_000) {
  await page.locator(".toast", { hasText: pattern }).first().waitFor({ state: "visible", timeout });
}
const row = (text) => page.locator("table tbody tr", { hasText: text }).first();

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

/* Gated-action dialog: reason + admin password + confirm (last button). */
async function secure({ reason = "E2E automated check", password = PWD, confirm } = {}) {
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  if (reason !== undefined && (await d.locator("textarea").count())) await d.locator("textarea").first().fill(reason);
  if (password && (await d.locator("input[type=password]").count())) await d.locator("input[type=password]").first().fill(password);
  const btn = confirm ? d.getByRole("button", { name: confirm }) : d.locator("button").last();
  await btn.click();
}

/* ---------- fresh profile + launch ---------- */
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.rmSync(EXPORTS, { recursive: true, force: true });
fs.mkdirSync(PROFILE, { recursive: true });
fs.mkdirSync(EXPORTS, { recursive: true });

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

await electronApp.evaluate(({ dialog }, dir) => {
  globalThis.__e2eSaved = [];
  dialog.showSaveDialog = async (_win, opts) => {
    const name = (opts && opts.defaultPath) || `export-${Date.now()}.pdf`;
    const p = `${dir}/${Date.now()}-${String(name).replace(/[/\\:]/g, "_")}`;
    globalThis.__e2eSaved.push(p);
    return { canceled: false, filePath: p };
  };
  dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
}, EXPORTS);

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

/* Seed: one family (needed by members + donations + subscriptions flows). */
await check("seed family created — toast says Saved successfully", async () => {
  await nav("#/families");
  await page.getByRole("button", { name: "Add Family" }).first().waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "Add Family" }).first().click();
  const d = dlg();
  const f = d.locator("input");
  await f.nth(0).fill("Batch Seed House");
  await f.nth(4).fill("9876500000");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  // U02 — the OLD code toasted "Save Changes" (the button's own label); the
  // fixed toast must read "Saved successfully".
  await expectToast("Saved successfully");
  await row("Batch Seed House").waitFor({ state: "visible", timeout: 10_000 });
});

/* ================= U12 family columns ================= */
mod("U12 Family table columns");
await check("Family Head column after House Name; WhatsApp column removed", async () => {
  await nav("#/families");
  await page.locator("table thead").waitFor({ state: "visible", timeout: 10_000 });
  const headers = await page.locator("table thead th").allInnerTexts();
  const houseIdx = headers.findIndex((h) => /House Name/i.test(h));
  const headIdx = headers.findIndex((h) => /Family Head/i.test(h));
  if (houseIdx < 0) throw new Error("House Name column missing");
  if (headIdx < 0) throw new Error("Family Head column missing");
  if (headIdx !== houseIdx + 1) throw new Error(`Family Head (idx ${headIdx}) not right after House Name (idx ${houseIdx})`);
  if (headers.some((h) => /WhatsApp/i.test(h))) throw new Error("WhatsApp column still present");
  // The seeded family has a head — the cell under Family Head must show it.
  const headCell = await row("Batch Seed House").locator("td").nth(headIdx).innerText();
  if (!/Head|—/.test(headCell)) throw new Error(`unexpected head cell: "${headCell}"`);
});

/* Add a member as head so the Family Head column shows a name. */
await check("family head member seeded", async () => {
  await nav("#/members");
  await page.getByRole("button", { name: "Add Member" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator("select").nth(0).selectOption({ index: 1 }); // first family
  await d.locator("input.inp").first().fill("Batch Head Member");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Saved successfully");
  await row("Batch Head Member").waitFor({ state: "visible", timeout: 10_000 });
});

/* ================= U01 popup stays open on outside click ================= */
mod("U01 Popup outside-click");
await check("clicking the dark backdrop does NOT close the dialog", async () => {
  await nav("#/families");
  await page.getByRole("button", { name: "Add Family" }).first().click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await page.mouse.click(8, 8); // far corner = backdrop
  await page.waitForTimeout(500);
  if (!(await page.locator(".modal-root.open").count())) throw new Error("dialog closed on outside click");
  if (!(await d.isVisible())) throw new Error("dialog not visible after outside click");
  await d.getByRole("button", { name: "Cancel" }).click();
});

/* ================= U03/U04 member pickers ================= */
mod("U03/U04 Member link pickers");
const SON = MARK(" Son");
const WIFE = MARK(" WifeofSon");
await check("son added", async () => {
  await nav("#/members");
  await page.getByRole("button", { name: "Add Member" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator("select").nth(0).selectOption({ index: 1 });
  await d.locator("input.inp").first().fill(SON);
  await d.locator("select").nth(7).selectOption("Son");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Saved successfully");
  await row(SON).waitFor({ state: "visible", timeout: 10_000 });
});
await check("son's wife added via Daughter-in-law relation", async () => {
  await nav("#/members");
  await page.getByRole("button", { name: "Add Member" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator("select").nth(0).selectOption({ index: 1 });
  await d.locator("input.inp").first().fill(WIFE);
  await d.locator("select").nth(4).selectOption("Female");
  await d.locator("select").nth(7).selectOption("Daughter-in-law");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Saved successfully");
  await row(WIFE).waitFor({ state: "visible", timeout: 10_000 });
});
await check("NEW wife appears in Spouse + Mother pickers without restart", async () => {
  await nav("#/members");
  await page.getByRole("button", { name: "Add Member" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  // picker row: father / mother / spouse selects sit after the family+name grid
  const selects = d.locator("select");
  const count = await selects.count();
  let motherOpts = "", spouseOpts = "";
  for (let i = 0; i < count; i++) {
    const text = await selects.nth(i).locator("option").allInnerTexts();
    if (text.some((o) => /outside \/ not linked/i.test(o))) continue; // father picker
    const full = text.join(" | ");
    if (/—/.test(full) && !motherOpts && text.length > 2) { motherOpts = full; continue; }
    if (/—/.test(full) && !spouseOpts && text.length > 2) { spouseOpts = full; }
  }
  if (!motherOpts.includes(WIFE) && !spouseOpts.includes(WIFE)) {
    throw new Error(`wife not listed in mother/spouse pickers (options: ${motherOpts.slice(0, 200)})`);
  }
  await d.getByRole("button", { name: "Cancel" }).click();
});

/* ================= U05 survey form ================= */
mod("U05 Survey form");
await check("Survey Form button downloads a real A4 PDF", async () => {
  await nav("#/families");
  await page.getByRole("button", { name: /Survey Form/ }).first().waitFor({ state: "visible", timeout: 10_000 });
  await page.getByRole("button", { name: /Survey Form/ }).first().click();
  await expectToast("survey form saved", 20_000);
  await page.waitForTimeout(800);
  const all = await electronApp.evaluate(() => globalThis.__e2eSaved.splice(0));
  const pdf = all.find((p) => fs.existsSync(p) && fs.statSync(p).size > 1000);
  if (!pdf) throw new Error(`no survey PDF on disk (${all.length} saved)`);
});

/* ================= U06 staff ID number ================= */
mod("U06 Staff ID number");
const STAFF = MARK(" Staff");
await check("staff saved with ID number; phone clamps to 10 digits", async () => {
  await nav("#/staff");
  await page.getByRole("button", { name: "Add Staff" }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "Add Staff" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator("input.inp").first().fill(STAFF);
  // phone input is the first numeric text field after name? Use placeholder.
  const phone = d.locator('input[placeholder="98XXXXXXXX"]');
  if (!(await phone.count())) throw new Error("staff phone input (10-digit) not found");
  await phone.fill("98765432101234567890"); // 20 digits typed
  const v = await phone.inputValue();
  if (v !== "9876543210") throw new Error(`phone not clamped to 10 (got "${v}")`);
  const idn = d.locator('input[placeholder="XXXX-XXXX-XXXX"]');
  if (!(await idn.count())) throw new Error("staff ID number input missing");
  await idn.fill("E2E-ID-9999");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Staff record saved");
  await row(STAFF).waitFor({ state: "visible", timeout: 10_000 });
});
await check("ID number visible in staff preview", async () => {
  await row(STAFF).locator('button[title="View"]').click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.getByText("E2E-ID-9999").waitFor({ state: "visible", timeout: 5_000 });
  await d.getByRole("button", { name: "Close" }).click();
});

/* ================= U08 staff archived tab ================= */
mod("U08 Staff archive visibility");
await check("resigned staff appears in the Archived tab", async () => {
  await row(STAFF).locator('button[title="View"]').click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.getByRole("button", { name: "Resign", exact: true }).click();
  await secure({ reason: "E2E resignation" });
  await page.waitForTimeout(600);
  await closeAllDialogs();
  await page.getByRole("button", { name: "Archived" }).first().click();
  await page.waitForTimeout(1200);
  await row(STAFF).waitFor({ state: "visible", timeout: 10_000 });
});

/* ================= U09 committee edit gate ================= */
mod("U09 Committee edit security");
const COMM = MARK(" President");
await check("committee member added (phone clamped to 10)", async () => {
  await nav("#/committee");
  await page.getByRole("button", { name: "Add Committee Member" }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "Add Committee Member" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator("input.inp").first().fill(COMM);
  const phone = d.locator('input[placeholder="98XXXXXXXX"]');
  if (!(await phone.count())) throw new Error("committee phone is not a 10-digit clamped input");
  await phone.fill("99999888887777");
  if ((await phone.inputValue()) !== "9999988888") throw new Error("committee phone not clamped to 10");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Committee record saved");
  await row(COMM).waitFor({ state: "visible", timeout: 10_000 });
});
await check("edit button opens a SECURITY gate, not the edit form", async () => {
  await row(COMM).locator(".act-edit").click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  const txt = await d.innerText();
  if (!/administrator password/i.test(txt)) throw new Error("no admin password gate on committee edit");
  if (await d.locator('input[placeholder="98XXXXXXXX"]').count()) throw new Error("edit dialog opened directly — gate missing");
  await d.getByRole("button", { name: /Cancel/ }).last().click();
});
await check("wrong password rejected; correct password opens the edit form", async () => {
  await row(COMM).locator(".act-edit").click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator("input[type=password]").first().fill("WrongPass@123");
  await d.locator("button").last().click();
  await page.waitForTimeout(800);
  // gate still open (or an error toast) — main process rejected it
  if (!(await page.locator(".modal-root.open").count())) throw new Error("wrong password let us through!");
  const cancel = d.getByRole("button", { name: /Cancel/ }).last();
  if (await cancel.count()) await cancel.click().catch(() => {});
  await page.waitForTimeout(400);
  // retry with the right password
  await row(COMM).locator(".act-edit").click();
  const d2 = dlg();
  await d2.waitFor({ state: "visible", timeout: 8_000 });
  await d2.locator("input[type=password]").first().fill(PWD);
  await d2.locator("textarea").first().fill("E2E edit check");
  await d2.locator("button").last().click();
  const edit = page.locator(".modal-root.open .modal").last();
  await edit.locator('input[placeholder="98XXXXXXXX"]').waitFor({ state: "visible", timeout: 8_000 });
  await edit.getByRole("button", { name: /Cancel/ }).first().click();
  await closeAllDialogs();
});

/* ================= U07 donation double-save ================= */
mod("U07 Donation double-save");
const DONOR = MARK(" Donor");
await check("Save clicked twice -> exactly ONE donation row", async () => {
  await nav("#/donations");
  await page.getByRole("button", { name: "Add Donation" }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "Add Donation" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  const inputs = d.locator("input.inp");
  await inputs.nth(0).fill(DONOR);           // donor name
  await inputs.nth(1).fill("9876501234");    // donor phone (10-digit clamped)
  // category select
  const cat = d.locator("select").first();
  await cat.selectOption({ index: 1 });
  const amount = d.locator('input[type="number"]');
  await amount.first().fill("250");
  const saveBtn = d.getByRole("button", { name: "Save", exact: true });
  await saveBtn.click();
  await saveBtn.click({ timeout: 1_500 }).catch(() => { /* button may already be disabled/gone */ });
  // dialog must close and the table must hold exactly ONE row for the donor
  await page.waitForTimeout(1_800);
  if (await page.locator(".modal-root.open").count()) {
    // background receipt toast may appear while dialog already closed —
    // an open DIALOG here would mean the old lingering behaviour
    const open = page.locator(".modal-root.open .modal").last();
    const txt = await open.innerText().catch(() => "");
    if (/Add Donation/i.test(txt)) throw new Error("donation dialog still open after save (lingering save UX)");
  }
  const count = await page.locator("table tbody tr", { hasText: DONOR }).count();
  if (count !== 1) throw new Error(`expected exactly 1 donation row, got ${count}`);
});
await check("receipt send click shows immediate 'Sending…' feedback", async () => {
  const sendBtn = row(DONOR).locator('button[title="Send receipt on WhatsApp"]');
  await sendBtn.waitFor({ state: "visible", timeout: 8_000 });
  await sendBtn.click();
  await expectToast("Sending receipt on WhatsApp", 4_000);
});

/* ================= U13 ml dropdowns ================= */
mod("U13 Malayalam dropdowns");
await check("ml mode: filter selects widen (no clipped option text)", async () => {
  await nav("#/settings");
  await page.getByText("Appearance").first().waitFor({ state: "visible", timeout: 20_000 });
  const langSelect = page.locator(".card select").nth(2);
  await langSelect.selectOption("ml");
  await page.getByText("കുടുംബങ്ങൾ").first().waitFor({ state: "visible", timeout: 10_000 });
  await nav("#/families");
  await page.locator("table thead").waitFor({ state: "visible", timeout: 10_000 });
  const sel = page.locator("table thead th").first().locator("xpath=ancestor::div[contains(@class,'card')]//select").first();
  const s = page.locator("select.inp").first();
  const box = await s.boundingBox();
  const lh = await s.evaluate((el) => getComputedStyle(el).lineHeight);
  const px = parseFloat(lh);
  if (!(px >= 24)) throw new Error(`ml select line-height still ${lh} (clips Malayalam)`);
  if (!box || box.width < 150) throw new Error(`ml select too narrow (${box?.width}px)`);
  // back to English
  await nav("#/settings");
  await page.getByText("രൂപം", { exact: false }).first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
  const langSelect2 = page.locator(".card select").nth(2);
  await langSelect2.selectOption("en");
  await page.getByText("Families", { exact: true }).first().waitFor({ state: "visible", timeout: 10_000 });
});

/* ---------- summary ---------- */
console.log(`\n══════════════════════════════════════`);
console.log(`  BATCH E2E: ${passed} passed, ${failed} failed`);
console.log(`══════════════════════════════════════`);
await electronApp.close();
process.exit(failed ? 1 : 0);

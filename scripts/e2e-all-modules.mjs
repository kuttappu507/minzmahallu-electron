/*
 * e2e-all-modules.mjs — FULL 0–100 client-side E2E for MMS Electron.
 *
 * Launches the REAL app (dist-electron/main.js + dist renderer) with a fresh
 * profile and drives EVERY module through the UI:
 *
 *   M01 Setup & login          M11 Staff
 *   M02 Settings               M12 Committee
 *   M03 Families               M13 Assets
 *   M04 Members                M14 Certificates
 *   M05 Marriages              M15 Tokens (events, generate, collect, cancel,
 *   M06 Deaths                     replace, delete, PDFs)
 *   M07 Donations              M16 Users, logout & login
 *   M08 Subscriptions          M17 Global search, Dashboard, Audit, Backup
 *   M09 Accounting             M18 Reports & PDF exports
 *   M10 Welfare                M19 Close dialogue (feedback line + keep open)
 *
 * Native save dialogs are monkey-patched in the MAIN process so the real
 * PDF pipeline (renderHtmlToPdf) runs and writes to a scratch dir that the
 * script then verifies on disk.
 *
 * Run:  xvfb-run -a node scripts/e2e-all-modules.mjs
 */

import { _electron } from "file:///home/z/.npm-global/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE = "/home/z/my-project/.cache/mms-e2e-full-profile";
const EXPORTS = "/home/z/my-project/.cache/mms-e2e-exports";
const ADMIN = { fullName: "E2E Administrator", username: "e2eadmin", password: "Prod@2026" };
const PWD = ADMIN.password;

let page, electronApp;
const results = [];
let MODULE = "";
let passed = 0, failed = 0;

function mod(name) {
  MODULE = name;
  console.log(`\n━━━ ${name} ━━━`);
}

async function check(name, fn) {
  try { await fn(); passed++; results.push({ module: MODULE, name, pass: true }); console.log(`  PASS  ${name}`); }
  catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    results.push({ module: MODULE, name, pass: false, error: msg });
    console.error(`  FAIL  ${name}\n        ${msg}`);
    try { await page.screenshot({ path: `${EXPORTS}/fail-${String(failed).padStart(2, "0")}.png` }); } catch {}
  }
}

/* ---------- tiny helpers ---------- */
const nav = (h) => page.evaluate((hash) => { window.location.hash = hash; }, h);
const dlg = () => page.locator(".modal-root.open .modal").last();
async function expectToast(pattern, timeout = 12_000) {
  await page.locator(".toast", { hasText: pattern }).first().waitFor({ state: "visible", timeout });
}
const row = (text) => page.locator("table tbody tr", { hasText: text }).first();

/* Poll an input's value until it equals expected (async React prefills). */
async function valueBecomes(loc, expected, timeout = 8_000) {
  const t0 = Date.now();
  let last = "";
  while (Date.now() - t0 < timeout) {
    last = await loc.inputValue().catch(() => "");
    if (last === expected) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`value never became "${expected}" (last: "${last}")`);
}

/* Close any leftover dialogs between modules. */
async function closeAllDialogs() {
  for (let i = 0; i < 4; i++) {
    if (!(await page.locator(".modal-root.open").count())) return;
    const d = page.locator(".modal-root.open .modal").last();
    const cancel = d.getByRole("button", { name: /Cancel|Close/ }).last();
    if (await cancel.count()) await cancel.click({ timeout: 2_000 }).catch(() => {});
    else await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(350);
  }
}

/* Gated-action dialog: fill reason (+ admin password if the field exists)
 * and press the confirm (last) button. */
async function secure({ reason = "E2E automated check", password = PWD, confirm } = {}) {
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  if (reason !== undefined && (await d.locator("textarea").count())) await d.locator("textarea").first().fill(reason);
  if (password && (await d.locator("input[type=password]").count())) await d.locator("input[type=password]").first().fill(password);
  const btn = confirm ? d.getByRole("button", { name: confirm }) : d.locator("button").last();
  await btn.click();
}

/* Standard member creation through the Add Member dialog. */
async function addMember({ familyIndex = 1, name, gender = "Male", relationship, fatherOutside = false, fatherName = "Late Father", dob = "" }) {
  await page.getByRole("button", { name: "Add Member" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator("select").nth(0).selectOption({ index: familyIndex });
  await d.locator("input.inp").first().fill(name);
  if (relationship) await d.locator("select").nth(7).selectOption(relationship);
  if (gender !== "Male") await d.locator("select").nth(4).selectOption(gender);
  if (dob) await d.locator("input[type=date]").first().fill(dob);
  if (fatherOutside) { await d.locator("#father-outside").check(); await d.locator("input.inp").nth(1).fill(fatherName); }
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Save Changes");
}

async function addFamily({ name, phone, ward = "1" }) {
  await page.getByRole("button", { name: "Add Family" }).first().click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  const f = d.locator("input");
  await f.nth(0).fill(name);
  await f.nth(2).fill(ward);
  await f.nth(4).fill(phone);
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Save Changes");
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
electronApp.process().stderr.on("data", (d) => {
  try { fs.appendFileSync("/home/z/my-project/scripts/e2e-main-stderr.log", String(d)); } catch {}
});
page = await electronApp.firstWindow();
page.setDefaultTimeout(20_000);

/* Native save/open dialogs → auto-accept into EXPORTS (records paths). */
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

/* takeSaved(): return PDFs written to disk since last call (poll up to 15s). */
let savedSeen = 0;
const takeSaved = async () => {
  const t0 = Date.now();
  let paths = [];
  while (Date.now() - t0 < 15_000) {
    const all = await electronApp.evaluate(() => globalThis.__e2eSaved);
    if (all.length > savedSeen) break;
    await page.waitForTimeout(300);
  }
  const all = await electronApp.evaluate(() => globalThis.__e2eSaved.splice(0));
  savedSeen = 0;
  paths = all.filter((p) => fs.existsSync(p) && fs.statSync(p).size > 500);
  return paths;
};

/* ================= M01 — Setup & login ================= */
mod("M01 Setup & Login");
await check("first run shows the Initial Setup screen", async () => {
  await page.getByText("Initial Setup").waitFor({ state: "visible", timeout: 30_000 });
});
await check("administrator account created through the setup form", async () => {
  const inputs = page.locator(".login-form input.inp");
  await inputs.nth(0).fill(ADMIN.fullName);
  await inputs.nth(1).fill(ADMIN.username);
  await inputs.nth(2).fill(ADMIN.password);
  await inputs.nth(3).fill(ADMIN.password);
  await page.getByRole("button", { name: "Create Administrator Account" }).click();
  await page.locator(".win-controls").waitFor({ state: "visible", timeout: 30_000 });
});
await check("dashboard renders with stat cards after setup", async () => {
  await page.locator(".stat").first().waitFor({ state: "visible", timeout: 20_000 });
});

/* ================= M02 — Settings ================= */
mod("M02 Settings");
await check("mahallu name saved and persisted after remount", async () => {
  await nav("#/settings");
  await page.getByText("Appearance").first().waitFor({ state: "visible", timeout: 20_000 });
  const nameInput = page.locator(".card input.inp").first();
  await nameInput.fill("E2E Masjid Mahallu");
  await page.getByRole("button", { name: "Save Changes" }).first().click();
  // Toast is the CONFIRMATION ("Settings saved successfully"), not the button
  // label — asserting the old label re-blessed the bug it was meant to catch.
  await expectToast("Settings saved successfully");
  await nav("#/families");
  await page.locator(".view h1").first().waitFor({ state: "visible" });
  await nav("#/settings");
  await page.getByText("Appearance").first().waitFor({ state: "visible" });
  const v = await page.locator(".card input.inp").first().inputValue();
  if (v !== "E2E Masjid Mahallu") throw new Error(`mahallu name not persisted (got "${v}")`);
});
await check("donation category added — delete affordance hidden by official-records policy", async () => {
  const nameBox = page.locator('input[placeholder="e.g. Masjid Maintenance"]');
  await nameBox.fill("E2E Temp Category");
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await expectToast("Category added");
  await page.waitForTimeout(400);
  const delBtns = page.locator(".act-del");
  if (!(await delBtns.count())) throw new Error("no .act-del buttons in DOM at all");
  const visible = await page.locator(".act-del:visible").count();
  if (visible !== 0) throw new Error(`${visible} delete button(s) visible — policy violated`);
});
await check("language switch EN → ML → EN works", async () => {
  const langSelect = page.locator(".card select").nth(2);
  await langSelect.selectOption("ml");
  await page.getByText("കുടുംബങ്ങൾ").first().waitFor({ state: "visible", timeout: 10_000 });
  await langSelect.selectOption("en");
  await page.getByText("Families", { exact: true }).first().waitFor({ state: "visible", timeout: 10_000 });
});
await check("theme switch dark → light applies", async () => {
  const themeSelect = page.locator(".card select").nth(1);
  await themeSelect.selectOption("dark");
  await page.waitForTimeout(400);
  const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark") || document.body.classList.contains("dark"));
  if (!isDark) throw new Error("dark class not applied to document");
  await themeSelect.selectOption("light");
  await page.waitForTimeout(400);
});

/* ================= M03 — Families ================= */
mod("M03 Families");
await check("family A created (E2E House A)", async () => {
  await nav("#/families");
  await page.getByRole("button", { name: "Add Family" }).first().waitFor({ state: "visible", timeout: 15_000 });
  await addFamily({ name: "E2E House A", phone: "9876500001", ward: "1" });
  await row("E2E House A").waitFor({ state: "visible", timeout: 10_000 });
});
await check("family B created (E2E House B)", async () => {
  await addFamily({ name: "E2E House B", phone: "9876500002", ward: "2" });
  await row("E2E House B").waitFor({ state: "visible", timeout: 10_000 });
});
await check("family C created (E2E House C)", async () => {
  await addFamily({ name: "E2E House C", phone: "9876500003", ward: "3" });
  await row("E2E House C").waitFor({ state: "visible", timeout: 10_000 });
});
await check("family A edited (ward 5B) and persisted", async () => {
  await row("E2E House A").locator(".act-edit").click();
  const d = dlg();
  await d.locator("input").nth(2).fill("5B");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Save Changes");
  await row("E2E House A").getByText("5B").waitFor({ state: "visible", timeout: 10_000 });
});
await check("search box filters families to E2E House A", async () => {
  const search = page.locator('input[placeholder="Search records..."]');
  await search.fill("E2E House A");
  const t0 = Date.now();
  let n = -1;
  while (Date.now() - t0 < 6_000) {
    n = await page.locator("table tbody tr").count();
    if (n === 1) break;
    await page.waitForTimeout(250);
  }
  if (n !== 1) throw new Error(`expected 1 row after search, got ${n}`);
  await search.fill("");
  await page.waitForTimeout(800);
});
await check("family preview shows household details + activity history", async () => {
  await row("E2E House A").locator(".act-btn:not(.act-edit)").first().click();
  const d = dlg();
  await d.getByText("Household").waitFor({ state: "visible", timeout: 8_000 });
  await d.getByText("Activity & History").waitFor({ state: "visible" });
  await d.getByRole("button", { name: "Close", exact: true }).click();
});
await check("family C archived (reason-gated) — status becomes Archived", async () => {
  await row("E2E House C").locator(".act-btn:not(.act-edit)").first().click();
  const d = dlg();
  await d.getByRole("button", { name: "Archive", exact: true }).click();
  await secure({ reason: "E2E archive test", confirm: "Archive family" });
  await expectToast("Family archived");
  await page.locator("select.w-40").first().selectOption("Archived");
  await row("E2E House C").waitFor({ state: "visible", timeout: 10_000 });
});
await check("family C restored from archive", async () => {
  await row("E2E House C").locator(".act-btn:not(.act-edit)").first().click();
  const d = dlg();
  await d.getByRole("button", { name: "Restore" }).click();
  await secure({ reason: "E2E restore test", confirm: "Restore family" });
  await expectToast("Family restored");
  await page.locator("select.w-40").first().selectOption("All");
  await row("E2E House C").waitFor({ state: "visible", timeout: 10_000 });
});

/* ================= M04 — Members ================= */
mod("M04 Members");
await closeAllDialogs();
await check("head member added to family A (father outside mahallu)", async () => {
  await nav("#/members");
  await page.getByRole("button", { name: "Add Member" }).waitFor({ state: "visible", timeout: 15_000 });
  await addMember({ familyIndex: 1, name: "Muhammed Ali", relationship: "Head", fatherOutside: true, fatherName: "Late Kunjahammed Haji" });
  await row("Muhammed Ali").waitFor({ state: "visible", timeout: 10_000 });
});
await check("spouse member added to family A (female)", async () => {
  await addMember({ familyIndex: 1, name: "Zainab Umma", gender: "Female", relationship: "Spouse" });
  await row("Zainab Umma").waitFor({ state: "visible", timeout: 10_000 });
});
await check("son added to family A — father auto-derived from head", async () => {
  await addMember({ familyIndex: 1, name: "Yusuf Ali", relationship: "Son" });
  await row("Yusuf Ali").waitFor({ state: "visible", timeout: 10_000 });
});
await check("family B members added (head, spouse, daughter)", async () => {
  await addMember({ familyIndex: 2, name: "Abdul Rahman", relationship: "Head", fatherOutside: true });
  await addMember({ familyIndex: 2, name: "Amina Beevi", gender: "Female", relationship: "Spouse" });
  await addMember({ familyIndex: 2, name: "Fatima Beevi", gender: "Female", relationship: "Daughter" });
  await row("Fatima Beevi").waitFor({ state: "visible", timeout: 10_000 });
});
await check("elder added to family C — age auto-calculated from DOB (82)", async () => {
  await addMember({ familyIndex: 3, name: "Ibrahim Haji", relationship: "Head", fatherOutside: true, dob: "1944-01-10" });
  const r = row("Ibrahim Haji");
  await r.waitFor({ state: "visible", timeout: 10_000 });
  const txt = await r.textContent();
  if (!/(82|83)/.test(txt)) throw new Error(`expected age ~82 in row: ${txt}`);
});
await check("member edit (occupation) saved", async () => {
  await row("Muhammed Ali").locator(".act-edit").click();
  const d = dlg();
  await d.locator("input.inp").nth(4).fill("Retired Teacher");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Save Changes");
});
await check("member preview shows relations & history tabs-data", async () => {
  await row("Muhammed Ali").locator(".act-btn:not(.act-edit)").first().click();
  const d = dlg();
  await d.getByText("Family Tree", { exact: false }).first().waitFor({ state: "visible", timeout: 8_000 }).catch(async () => {
    await d.getByText(/History|Archive|Restore|Move/i).first().waitFor({ state: "visible" });
  });
  await d.getByRole("button", { name: "Close", exact: true }).click();
});
await check("disposable member archived (admin-password gate) and restored", async () => {
  await addMember({ familyIndex: 3, name: "E2E Throwaway Member", relationship: "Son" });
  await row("E2E Throwaway Member").locator(".act-btn:not(.act-edit)").first().click();
  let d = dlg();
  await d.getByRole("button", { name: "Archive" }).first().click();
  await secure({ reason: "E2E member archive", confirm: "Archive" });
  await expectToast("Operation completed");
  // archive closes both dialogs — reopen the preview to restore
  await row("E2E Throwaway Member").locator(".act-btn:not(.act-edit)").first().click();
  d = dlg();
  await d.getByRole("button", { name: "Restore" }).click();
  await secure({ reason: "E2E member restore", confirm: "Restore" });
  await expectToast("Operation completed");
  // restore (like archive) closes both dialogs — verify the row is Active again
  await page.waitForTimeout(800);
  const restored = await row("E2E Throwaway Member").textContent();
  if (restored.includes("Archived")) throw new Error(`member still archived after restore: ${restored.slice(0, 100)}`);
});
await check("family list badge shows 3 members for family A", async () => {
  await nav("#/families");
  await row("E2E House A").waitFor({ state: "visible", timeout: 10_000 });
  const txt = await row("E2E House A").textContent();
  const m = txt.match(/(\d+)\s*(Active|Inactive|Archived)/);
  if (!m || Number(m[1]) !== 3) throw new Error(`member count badge mismatch: ${txt.slice(0, 120)}`);
});

/* ================= M05 — Marriages ================= */
mod("M05 Marriages");
await closeAllDialogs();
await check("marriage registered via mahallu picker — names & father auto-prefilled", async () => {
  await nav("#/marriages");
  await page.getByRole("button", { name: "Register Marriage" }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "Register Marriage" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  // Bride from mahallu: family B → Fatima Beevi (females: Amina, Fatima)
  await d.locator("input[type=checkbox]").nth(0).check();
  await d.locator("select").nth(0).selectOption({ index: 2 });
  await d.locator("select").nth(1).selectOption({ index: 2 });
  await valueBecomes(d.locator("input.inp").nth(0), "Fatima Beevi");
  // Groom from mahallu: family A → Yusuf Ali (males: Muhammed Ali, Yusuf)
  await d.locator("input[type=checkbox]").nth(1).check();
  await d.locator("select").nth(2).selectOption({ index: 1 });
  await d.locator("select").nth(3).selectOption({ index: 2 });
  await valueBecomes(d.locator("input.inp").nth(2), "Yusuf Ali");
  await valueBecomes(d.locator("input.inp").nth(3), "Muhammed Ali");
  await d.locator("input.inp").nth(4).fill("Witness One");
  await d.locator("input.inp").nth(5).fill("Witness Two");
  await d.locator("input.inp").nth(8).fill("1001"); // mahar
  await d.locator("input.inp").nth(9).fill("E2E Mahallu Hall"); // place
  await d.locator("input[type=date]").nth(0).fill("2026-09-10");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Register Marriage");
});
await check("marriage row listed with bride & groom", async () => {
  await row("Yusuf Ali").waitFor({ state: "visible", timeout: 10_000 });
  const txt = await row("Yusuf Ali").textContent();
  if (!txt.includes("Fatima Beevi")) throw new Error("bride missing on marriage row");
});
await check("marriage edited (place updated)", async () => {
  await row("Yusuf Ali").locator(".act-edit").click();
  const d = dlg();
  await d.locator("input.inp").nth(9).fill("E2E edited venue");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Save Changes");
});
await check("marriage certificate issued from preview", async () => {
  await row("Yusuf Ali").dblclick();
  const d = dlg();
  await d.getByRole("button", { name: "Certificate", exact: true }).click();
  await expectToast("Certificate issued successfully");
  await d.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForTimeout(400);
});
await check("marriage register PDF exported (Print Register)", async () => {
  await page.getByRole("button", { name: "Print Register" }).click();
  await expectToast("Marriage register PDF saved");
  const saved = await takeSaved();
  if (!saved.length) throw new Error("no register PDF written to disk");
});

/* ================= M06 — Deaths ================= */
mod("M06 Deaths");
await closeAllDialogs();
await check("death registered from mahallu member — details prefilled", async () => {
  await nav("#/deaths");
  await page.getByRole("button", { name: "Add Record" }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "Add Record" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator("input[type=checkbox]").nth(0).check();
  await d.locator("select").nth(0).selectOption({ index: 3 }); // family C
  await d.locator("select").nth(1).selectOption({ index: 1 }); // Ibrahim Haji
  await valueBecomes(d.locator("input.inp").nth(0), "Ibrahim Haji");
  await d.locator("input.inp").nth(4).fill("E2E Home, Ward 3");
  await d.locator("input[type=date]").nth(0).fill("2026-09-15");
  await d.locator("textarea").nth(1).fill("Age-related illness");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Death record added");
});
await check("death row listed with deceased name", async () => {
  await row("Ibrahim Haji").waitFor({ state: "visible", timeout: 10_000 });
});
await check("death record edited (cause of death)", async () => {
  await row("Ibrahim Haji").locator(".act-edit").click();
  const d = dlg();
  await d.locator("textarea").nth(1).fill("Cardiac arrest — edited by E2E");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Save Changes");
});
await check("death certificate issued from preview", async () => {
  await row("Ibrahim Haji").dblclick();
  const d = dlg();
  await d.getByRole("button", { name: "Certificate", exact: true }).click();
  await expectToast("Certificate issued successfully");
  await d.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForTimeout(400);
});
await check("death register PDF exported (Print Register)", async () => {
  await page.getByRole("button", { name: "Print Register" }).click();
  await expectToast("Death register PDF saved");
  const saved = await takeSaved();
  if (!saved.length) throw new Error("no death register PDF written to disk");
});

/* ================= M07 — Donations ================= */
mod("M07 Donations");
await closeAllDialogs();
await check("validation: empty donation save is rejected with message", async () => {
  await nav("#/donations");
  await page.getByRole("button", { name: "Add Donation" }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "Add Donation" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Donor Name, Category and Amount are required");
  await d.getByRole("button", { name: "Cancel", exact: true }).click();
});
await check("donation created — DN receipt number generated", async () => {
  await page.getByRole("button", { name: "Add Donation" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator("input.inp").nth(0).fill("E2E Donor One");
  await d.locator("input.inp").nth(1).fill("9876511111");
  await d.locator("select").nth(0).selectOption({ index: 1 });
  await d.locator('input[type="number"]').first().fill("2500");
  await d.locator("select").nth(1).selectOption("UPI");
  await d.locator("input.inp").nth(4).fill("Mosque renovation");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Add Donation");
  await row(/DN\/26\/09\/001/).waitFor({ state: "visible", timeout: 10_000 });
});
await check("second donation created (for delete test)", async () => {
  await page.getByRole("button", { name: "Add Donation" }).click();
  const d = dlg();
  await d.locator("input.inp").nth(0).fill("E2E Donor Two");
  await d.locator("select").nth(0).selectOption({ index: 1 });
  await d.locator('input[type="number"]').first().fill("100");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Add Donation");
  await row("E2E Donor Two").waitFor({ state: "visible", timeout: 10_000 });
});
await check("donation edit gated (password + reason) then saved", async () => {
  await row(/DN\/26\/09\/001/).locator(".act-edit").click();
  await secure({ reason: "E2E donation edit", confirm: "Continue to edit" });
  const d = dlg();
  await d.locator("input.inp").nth(4).fill("Renovation — corrected");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Save Changes");
});
await check("A6 receipt PDF saved for donation row", async () => {
  await row(/DN\/26\/09\/001/).locator('button[title*="A6 receipt PDF"]').click();
  await expectToast("Receipt PDF saved");
});
await check("donation delete button hidden by official-records policy", async () => {
  const del = row(/DN\/26\/09\/001/).locator(".act-del");
  if (!(await del.count())) throw new Error("delete button not even in DOM");
  if (await del.isVisible()) throw new Error("delete button visible — policy violated");
});

/* ================= M08 — Subscriptions ================= */
mod("M08 Subscriptions");
await closeAllDialogs();
await check("current-month subscription rows auto-created for active families (Pending)", async () => {
  await nav("#/subscriptions");
  await page.getByRole("button", { name: "New subscription" }).waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(2_000); // ensureCurrentMonth + refetch
  await row("E2E House A").waitFor({ state: "visible", timeout: 10_000 });
  const txt = await row("E2E House A").textContent();
  if (!txt.includes("Pending")) throw new Error(`family A row not Pending: ${txt.slice(0, 120)}`);
});
await check("payment recorded for family A → Paid with SB receipt", async () => {
  await row("E2E House A").locator('button[title="Record payment"]').click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator('input[type="number"]').first().fill("100");
  await d.getByRole("button", { name: "Save payment" }).click();
  await expectToast(/Payment saved — Paid \(receipt .{0,10}SB\/26\/09/);
  await page.waitForTimeout(600);
  const txt = await row("E2E House A").textContent();
  if (!txt.includes("Paid")) throw new Error(`family A row not Paid: ${txt.slice(0, 120)}`);
});
await check("Mark Overdue runs and reports result", async () => {
  await page.getByRole("button", { name: "Mark Overdue" }).click();
  await expectToast(/subscriptions marked overdue/);
});
await check("new-subscription dialog rejects a family that already has one", async () => {
  await page.getByRole("button", { name: "New subscription" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator("select").first().selectOption({ index: 2 });
  await d.locator('input[type="number"]').nth(0).fill("500");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast(/already has a subscription/i);
  await d.getByRole("button", { name: "Cancel", exact: true }).click();
});
await check("cancel-payment button hidden by official-records policy (feature gap)", async () => {
  const cancel = row("E2E House B").locator('button[title*="Cancel this month"]');
  if (!(await cancel.count())) throw new Error("cancel-payment button not in DOM");
  if (await cancel.isVisible()) throw new Error("cancel-payment button visible — would allow test");
});
await check("collected total card shows the paid amount", async () => {
  const card = page.locator(".stat", { hasText: "Total collected" }).first();
  await card.waitFor({ state: "visible", timeout: 8_000 });
  const txt = await card.textContent();
  if (!/₹\s*[\d,]+/.test(txt)) throw new Error(`no currency total in card: ${txt}`);
});

/* ================= M09 — Accounting ================= */
mod("M09 Accounting");
await closeAllDialogs();
await check("manual income entry created (Add Income → Shop Rent, ₹1000)", async () => {
  await nav("#/accounting");
  await page.getByRole("button", { name: "Add Income" }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "Add Income" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator('input[type="number"]').first().fill("1000");
  await d.locator('input[placeholder*="Shop Rent"]').fill("Shop Rent");
  await d.locator("textarea").fill("E2E shop rent for September");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Add Transaction");
  await row("Shop Rent").waitFor({ state: "visible", timeout: 10_000 });
});
await check("expense entry created (Add Expense → Electricity, bill no, payee)", async () => {
  await page.getByRole("button", { name: "Add Expense" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator('input[type="number"]').first().fill("250");
  await d.locator('input[placeholder*="Electricity"]').fill("Electricity");
  await d.locator('input[placeholder*="bill no"]').fill("BILL-E2E-1");
  await d.locator('input[placeholder*="payment made to"]').fill("E2E Store");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Add Transaction");
  await row("Electricity").waitFor({ state: "visible", timeout: 10_000 });
});
await check("validation: expense without amount is rejected", async () => {
  await page.getByRole("button", { name: "Add Expense" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Amount and Date are required");
  await d.getByRole("button", { name: "Cancel", exact: true }).click();
});
await check("ledger entry edit gated (password+reason) — amount 250 → 300", async () => {
  await row("Electricity").locator(".act-edit").click();
  await secure({ reason: "E2E ledger edit", confirm: "Continue to edit" });
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator('input[type="number"]').first().fill("300");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Save Changes");
});
await check("void-entry button hidden by official-records policy (feature gap)", async () => {
  const v = row("Electricity").locator('button[title*="Void (keep for audit)"]');
  if (!(await v.count())) throw new Error("void button not in DOM");
  if (await v.isVisible()) throw new Error("void button visible — would allow test");
});
await check("accounting summary: donations auto-posted + stat cards render", async () => {
  await page.getByText("Income from Donations").first().waitFor({ state: "visible", timeout: 10_000 });
  if ((await page.locator(".stat").count()) < 2) throw new Error("expected income/expense/balance stat cards");
  await page.locator(".stat", { hasText: "₹" }).first().waitFor({ state: "visible", timeout: 8_000 });
});

/* ================= M10 — Welfare ================= */
mod("M10 Welfare");
await closeAllDialogs();
await check("welfare request created via mahallu picker (₹1000, Pending)", async () => {
  await nav("#/welfare");
  await page.getByRole("button", { name: "New Request" }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "New Request" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator("input[type=checkbox]").nth(0).check();
  await d.locator("select").nth(0).selectOption({ index: 1 }); // family A
  await d.locator("select").nth(1).selectOption({ index: 1 }); // Muhammed Ali
  await valueBecomes(d.locator("input.inp").first(), "Muhammed Ali");
  await d.locator("select").nth(3).selectOption({ label: "Medical Aid" });
  await d.locator('input[type="number"]').first().fill("1000");
  await d.locator("textarea").nth(0).fill("Medical assistance — E2E");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("New Request");
  await row("Muhammed Ali").waitFor({ state: "visible", timeout: 10_000 });
});
await check("welfare request approved (₹800, minutes date)", async () => {
  await row("Muhammed Ali").locator(".act-edit").click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  // handleApprove uses the approve-SECTION amount state (3rd number input),
  // not the form's amount_approved field; the minutes date is required.
  await d.locator('input[type="number"]').nth(2).fill("800");
  await d.locator("input[type=date]").last().fill("2026-09-16");
  await d.getByRole("button", { name: "Approve", exact: true }).click();
  await expectToast("Request approved");
  // approval closes the dialog itself
  await page.waitForTimeout(600);
  const txt = await row("Muhammed Ali").textContent();
  if (!txt.includes("Approved")) throw new Error(`row not Approved: ${txt.slice(0, 120)}`);
  if (!txt.includes("800")) throw new Error(`approved amount is not 800: ${txt.slice(0, 120)}`);
});
await check("welfare disbursement gated (password) → Marked as disbursed", async () => {
  await row("Muhammed Ali").locator('button[title="Mark as Disbursed"]').click();
  await secure({ reason: "E2E disbursement", confirm: "Disburse" });
  await expectToast("Marked as disbursed");
  await page.waitForTimeout(600);
  const txt = await row("Muhammed Ali").textContent();
  if (!txt.includes("Disbursed")) throw new Error(`row not Disbursed: ${txt.slice(0, 120)}`);
});

/* ================= M11 — Staff ================= */
mod("M11 Staff");
await closeAllDialogs();
await check("staff member added (name + salary)", async () => {
  await nav("#/staff");
  await page.getByRole("button", { name: "Add Staff" }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "Add Staff" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator("input.inp").first().fill("E2E Office Staff");
  await d.locator('input[type="number"]').first().fill("10000");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Staff record saved");
  await row("E2E Office Staff").waitFor({ state: "visible", timeout: 10_000 });
});
await check("salary payment recorded (month/year/amount)", async () => {
  await row("E2E Office Staff").locator('button[title="Pay Salary"]').click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator('input[type="number"]').nth(1).fill("10000");
  await d.getByRole("button", { name: "Pay Salary" }).click();
  await expectToast("Salary payment recorded");
});
await check("staff record edited (salary 10000 → 12000)", async () => {
  await row("E2E Office Staff").locator(".act-edit").click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator('input[type="number"]').first().fill("12000");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Staff record saved");
});

/* ================= M12 — Committee ================= */
mod("M12 Committee");
await closeAllDialogs();
await check("committee member added (president)", async () => {
  await nav("#/committee");
  await page.getByRole("button", { name: "Add Committee Member" }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "Add Committee Member" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator("input.inp").first().fill("E2E Committee President");
  await d.locator("input.inp").nth(1).fill("9876522222");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Committee record saved");
  await row("E2E Committee President").waitFor({ state: "visible", timeout: 10_000 });
});
await check("committee member edited (phone updated)", async () => {
  await row("E2E Committee President").locator(".act-edit").click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator("input.inp").nth(1).fill("9876533333");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Committee record saved");
});

/* ================= M13 — Assets ================= */
mod("M13 Assets");
await closeAllDialogs();
await check("asset added — code issued (AST…)", async () => {
  await nav("#/assets");
  await page.getByRole("button", { name: "Add Asset" }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "Add Asset" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator("input.inp").first().fill("E2E Shop Building");
  await d.locator("input.inp").nth(4).fill("E2E Custodian");
  await d.locator('input[type="number"]').first().fill("500000");
  await d.locator('input[type="number"]').nth(1).fill("600000");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast(/Asset saved with code/);
  await row("E2E Shop Building").waitFor({ state: "visible", timeout: 10_000 });
});
await check("asset edited (current value 600000 → 650000)", async () => {
  await row("E2E Shop Building").locator(".act-edit").click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator('input[type="number"]').nth(1).fill("650000");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Save Changes");
});
await check("asset delete button hidden by official-records policy", async () => {
  const del = row("E2E Shop Building").locator(".act-del");
  if (!(await del.count())) throw new Error("delete button not in DOM");
  if (await del.isVisible()) throw new Error("delete button visible — policy violated");
});

/* ================= M14 — Certificates ================= */
mod("M14 Certificates");
await closeAllDialogs();
await check("membership certificate issued after pick (member_code fix)", async () => {
  await nav("#/certificates");
  await page.locator(".cert-issue-card").first().waitFor({ state: "visible", timeout: 15_000 });
  await page.locator(".cert-issue-card", { hasText: "Membership" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator(".pl-row").first().click();
  await d.getByRole("button", { name: "Generate PDF" }).click();
  await expectToast("Certificate issued");
  await page.waitForTimeout(800);
  await d.getByRole("button", { name: "Cancel", exact: true }).click().catch(() => {});
});
await check("residence certificate: issued-to required, then issued", async () => {
  await page.locator(".cert-issue-card", { hasText: "Residence" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator(".pl-row").first().click();
  await d.getByRole("button", { name: "Generate PDF" }).click();
  await expectToast("Issued To name is required");
  await d.locator("input.inp").last().fill("Muhammed Ali");
  await d.getByRole("button", { name: "Generate PDF" }).click();
  await expectToast("Certificate issued");
  await page.waitForTimeout(800);
  await d.getByRole("button", { name: "Cancel", exact: true }).click().catch(() => {});
});
await check("issued certificates listed (marriage + membership + residence)", async () => {
  await page.locator("table tbody tr").first().waitFor({ state: "visible", timeout: 10_000 });
  if ((await page.locator("table tbody tr").count()) < 3) throw new Error("expected ≥3 certificate rows");
});
await check("certificate PDF regenerated from list row (file written)", async () => {
  await page.locator("table tbody tr").first().locator('button[title="Generate PDF"]').click();
  await expectToast("Certificate PDF generated");
  const saved = await takeSaved();
  if (!saved.length) throw new Error("no PDF written from list-row regeneration");
});
await check("anti-forgery verify: security code returns valid ✓ result", async () => {
  const codeCell = await page.locator("table tbody tr").first().locator("td").first().textContent();
  const code = codeCell.trim();
  const verifyInput = page.locator('input[placeholder*="Security code"]');
  await verifyInput.fill(code);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await page.getByText("✓").first().waitFor({ state: "visible", timeout: 10_000 });
});

/* ================= M15 — Tokens ================= */
mod("M15 Tokens");
await closeAllDialogs();
await check("token event created (today, E2E Charity Event)", async () => {
  await nav("#/tokens/manage");
  await page.getByRole("button", { name: "New Event" }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "New Event" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator("input.inp").first().fill("E2E Charity Event");
  await d.locator('input[type="date"]').fill("2026-09-16");
  await d.locator('input[type="time"]').fill("10:00");
  await d.getByRole("button", { name: "Save Event" }).click();
  await expectToast("Event created");
  await page.waitForTimeout(500);
  globalThis.charityEventValue = await page.locator(".vhead select").inputValue();
});
await check("past event created (deletable after date)", async () => {
  const sel = page.locator(".vhead select");
  await sel.selectOption(globalThis.charityEventValue);
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "New Event" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator("input.inp").first().fill("E2E Old Event");
  await d.locator('input[type="date"]').fill("2026-08-01");
  await d.getByRole("button", { name: "Save Event" }).click();
  await expectToast("Event created");
  // restore the charity event as the active one
  await sel.selectOption(globalThis.charityEventValue);
  await page.waitForTimeout(800);
});
await check("tokens generated for all active families", async () => {
  await page.getByRole("button", { name: "Generate Tokens" }).click();
  await page.getByRole("button", { name: "Select All Active" }).click();
  await page.getByRole("button", { name: /Review Selection \(/ }).click();
  await page.getByRole("button", { name: /Generate New Tokens/ }).click();
  await expectToast(/tokens generated/);
  await page.getByRole("button", { name: "Tokens", exact: true }).click().catch(() => {});
});
await check("token list shows GENERATED rows", async () => {
  await page.locator("table tbody tr").first().waitFor({ state: "visible", timeout: 10_000 });
  if ((await page.locator("table tbody tr").count()) < 3) throw new Error("expected ≥3 token rows");
});
await check("token marked collected (✓)", async () => {
  await page.locator("table tbody tr").first().locator('button[title="Mark Collected"]').click();
  await expectToast("Token marked as collected");
  await page.locator("table tbody tr", { hasText: "COLLECTED" }).first().waitFor({ state: "visible", timeout: 10_000 });
});
await check("token replaced — new code issued", async () => {
  const target = page.locator("table tbody tr", { hasText: "GENERATED" }).first();
  const oldCode = (await target.locator(".token-code").textContent()).trim();
  await target.locator('button[title="Replace Token"]').click();
  const d = dlg();
  await d.locator("input.inp").fill("E2E damaged token");
  await d.getByRole("button", { name: "Replacement" }).click();
  await expectToast(/Replacement token generated/);
  const body = await page.locator("table tbody").textContent();
  if (!body.includes(oldCode)) throw new Error("old cancelled code should remain listed");
});
await check("token cancel button hidden by official-records policy", async () => {
  const cancel = page.locator('button[title="Cancel Token"]');
  if (!(await cancel.count())) throw new Error("cancel-token button not in DOM");
  if ((await page.locator('button[title="Cancel Token"]:visible').count())) {
    throw new Error("token cancel visible — policy violated");
  }
});
await check("token PDF + collection sheet PDFs written", async () => {
  await page.locator(".vhead select").selectOption(globalThis.charityEventValue);
  await page.waitForTimeout(1_200);
  await page.getByRole("button", { name: "Token PDF" }).click();
  await expectToast(/Token PDF generated/, 30_000);
  await page.getByRole("button", { name: "Collection Sheet" }).click();
  await expectToast(/Collection sheet generated/, 30_000);
  const saved = await takeSaved();
  if (saved.length < 2) throw new Error(`expected 2 PDFs on disk, got ${saved.length}`);
});
await check("past-event tokens generated, then event deleted (reason-gated)", async () => {
  const sel = page.locator(".vhead select");
  const opts = await sel.locator("option").allTextContents();
  const oldVal = await sel.locator("option", { hasText: "E2E Old Event" }).getAttribute("value");
  await sel.selectOption(oldVal);
  await page.waitForTimeout(1_000);
  await page.getByRole("button", { name: "Generate Tokens" }).click();
  await page.getByRole("button", { name: "Select All Active" }).click();
  await page.getByRole("button", { name: /Review Selection \(/ }).click();
  await page.getByRole("button", { name: /Generate New Tokens/ }).click();
  await expectToast(/tokens generated/);
  await page.getByRole("button", { name: "Tokens", exact: true }).click().catch(() => {});
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Delete Event" }).click();
  const d2 = dlg();
  await d2.waitFor({ state: "visible", timeout: 8_000 });
  await d2.locator("input.inp").fill("E2E event cleanup");
  await d2.locator("button").last().click();
  await expectToast(/Event deleted/);
});

/* ================= M16 — Users & Auth ================= */
mod("M16 Users, Logout & Login");
await closeAllDialogs();
await check("new user added (Secretary role)", async () => {
  await nav("#/users");
  await page.getByRole("button", { name: "Add User" }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "Add User" }).click();
  const d = dlg();
  await d.waitFor({ state: "visible", timeout: 8_000 });
  await d.locator("input.inp").nth(0).fill("e2esecretary");
  await d.locator("input.inp").nth(1).fill("E2E Secretary");
  await d.locator("select").selectOption("Secretary");
  await d.locator('input[type="password"]').fill("S3cret@2026");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast("Add User");
  await row("e2esecretary").waitFor({ state: "visible", timeout: 10_000 });
});
await check("user password reset via key action", async () => {
  await row("e2esecretary").locator('button[title="Reset Password"]').click();
  const d = dlg();
  await d.locator('input[type="password"]').fill("N3wPass@2026");
  await d.getByRole("button", { name: "Reset", exact: true }).click();
  await expectToast("Password reset");
});
await check("user delete button hidden by official-records policy", async () => {
  const del = row("e2esecretary").locator(".act-del");
  if (!(await del.count())) throw new Error("delete button not in DOM");
  if (await del.isVisible()) throw new Error("delete button visible — policy violated");
});
await check("logout returns to the login page", async () => {
  await page.locator("button.avbtn").click();
  await page.locator(".menuit-btn.danger").click();
  await page.getByText("Welcome back.").waitFor({ state: "visible", timeout: 10_000 });
});
await check("wrong password rejected with error", async () => {
  const inputs = page.locator(".login-form input.inp");
  await inputs.nth(0).fill(ADMIN.username);
  await inputs.nth(1).fill("WrongPass@1");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.locator(".login-error").waitFor({ state: "visible", timeout: 10_000 });
});
await check("correct credentials log back in", async () => {
  const inputs = page.locator(".login-form input.inp");
  await inputs.nth(0).fill(ADMIN.username);
  await inputs.nth(1).fill(ADMIN.password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.locator(".stat").first().waitFor({ state: "visible", timeout: 15_000 });
});

/* ================= M17 — Search, Dashboard, Audit, Backup ================= */
mod("M17 Global Search · Dashboard · Audit · Backup");
await closeAllDialogs();
await check("global search finds family & member", async () => {
  const gs = page.locator(".global-search input");
  await gs.fill("E2E House A");
  await page.locator(".global-search-results").waitFor({ state: "visible", timeout: 10_000 });
  const txt = await page.locator(".global-search-results").textContent();
  if (!txt.includes("E2E House A")) throw new Error(`search results missing family: ${txt.slice(0, 120)}`);
  // Clear the input — the results panel only closes when the query drops under
  // 2 chars (Escape alone leaves it open and would cover M18's Export button).
  await gs.fill("");
  await page.locator(".global-search-results").waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
});
await check("dashboard renders stat cards & recent panel", async () => {
  await nav("#/");
  await page.locator(".stat").first().waitFor({ state: "visible", timeout: 15_000 });
  if ((await page.locator(".stat").count()) < 3) throw new Error("expected several dashboard stat cards");
});
await check("audit log records today's admin-gated actions", async () => {
  await nav("#/audit");
  await page.locator("table tbody tr").first().waitFor({ state: "visible", timeout: 15_000 });
  if ((await page.locator("table tbody tr").count()) < 5) throw new Error("expected multiple audit rows");
});
await check("backup created, integrity-verified and listed", async () => {
  await nav("#/backup");
  await page.getByRole("button", { name: /Create backup now|Backup Now/ }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: /Create backup now|Backup Now/ }).click();
  await expectToast("Verified backup created");
  await page.locator("table tbody tr").first().waitFor({ state: "visible", timeout: 15_000 });
});
await check("token events page renders", async () => {
  await nav("#/tokens");
  await page.locator(".view h1").first().waitFor({ state: "visible", timeout: 15_000 });
});

/* ================= M18 — Reports & exports ================= */
mod("M18 Reports & Exports");
await closeAllDialogs();
await check("reports catalogue renders", async () => {
  await nav("#/reports");
  await page.locator(".rep-card").first().waitFor({ state: "visible", timeout: 15_000 });
  if ((await page.locator(".rep-card").count()) < 4) throw new Error("expected report cards");
});
await check("report CSV export succeeds (toast)", async () => {
  const card = page.locator(".rep-card").first();
  await card.getByRole("button", { name: "CSV" }).click();
  await expectToast(/CSV/);
});
await check("annual audit pack PDF exported (file written)", async () => {
  await page.getByRole("button", { name: "Export PDF" }).click();
  await expectToast(/Audit pack exported/);
  const saved = await takeSaved();
  if (!saved.length) throw new Error("no audit-pack PDF written to disk");
});
await check("donation batch receipts PDF (Save receipts)", async () => {
  await nav("#/donations");
  await page.getByRole("button", { name: "Save receipts" }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "Save receipts" }).click();
  await expectToast(/receipts as one PDF/);
});

/* ================= M19 — Close dialogue ================= */
mod("M19 Close Dialogue");
await check("close dialogue carries feedback email; Keep open keeps app alive", async () => {
  await page.locator(".win-btn.win-close").click();
  await page.getByText("Do you want to close the application?").waitFor({ state: "visible", timeout: 10_000 });
  if (!(await page.getByText("send your feedback to minzmahallu@proton.me").count())) {
    throw new Error("feedback line not visible");
  }
  await page.getByRole("button", { name: "Keep open" }).click();
  await page.waitForTimeout(600);
  if (!(await page.locator(".win-controls").isVisible().catch(() => false))) throw new Error("app window lost after Keep open");
});

/* ================= summary ================= */
const byModule = {};
for (const r of results) {
  (byModule[r.module] ||= { pass: 0, fail: 0, fails: [] });
  r.pass ? byModule[r.module].pass++ : (byModule[r.module].fail++, byModule[r.module].fails.push({ name: r.name, error: r.error }));
}
console.log("\n════════════ SUMMARY ════════════");
for (const [m, s] of Object.entries(byModule)) {
  console.log(`${s.fail === 0 ? "✅" : "❌"} ${m}: ${s.pass}/${s.pass + s.fail}`);
  for (const f of s.fails) console.log(`     ✗ ${f.name} — ${f.error}`);
}
console.log(`\nTOTAL: ${passed} PASS / ${failed} FAIL of ${results.length}`);

fs.writeFileSync("/home/z/my-project/scripts/e2e-all-modules-results.json", JSON.stringify({ passed, failed, total: results.length, results }, null, 2));

/* keep the app alive briefly for the failure screenshots, then exit */
try { await page.screenshot({ path: `${EXPORTS}/final-state.png` }); } catch {}
await electronApp.close().catch(() => {});
console.log(failed === 0 ? "\nALL 0–100 CLIENT-SIDE CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);


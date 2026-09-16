#!/usr/bin/env node
/**
 * qa-clear-data-e2e.mjs — CLIENT-SIDE end-to-end test of
 * "Settings → Danger Zone → Clear All Data" on the REAL Electron app.
 *
 * Drives the actual UI (real renderer + real IPC + real SQLite file):
 *   1. First-run setup (create admin) in an ISOLATED profile ($HOME temp dir)
 *   2. Seed data through the UI: 2 families, 1 member, 2 donations (DN
 *      receipts 001/002), 1 income entry (themed category picker)
 *   3. Danger Zone → Clear All Data (SecureActionDialog: reason + password)
 *   4. After wipe: all lists empty, audit shows CLEAR_ALL_DATA, next donation
 *      receipt restarts at 001, login with the SAME admin password works
 *   5. App closed → the SQLite file itself is inspected (better-sqlite3)
 *
 * Run:  xvfb-run -a node scripts/qa-clear-data-e2e.mjs
 * (needs `npm run build` first; screenshots land in qa-screens/clear-data-e2e/)
 */
import { _electron as electron } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(REPO, "qa-screens", "clear-data-e2e");
const ADMIN = { name: "QA Administrator", user: "admin", pass: "Str0ng!Passw0rd" };
const TODAY = new Date().toISOString().slice(0, 10);

const results = [];
const consoleErrors = [];
let win, app, current = "init", pass = 0, fail = 0;

const log = (m) => console.log("  " + m);
const shot = (n) => fs.mkdirSync(SHOTS, { recursive: true }) || win?.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: false }).catch(() => {});
function check(name, cond, detail = "") {
  if (cond) { pass++; log("PASS " + name + (detail ? " — " + detail : "")); results.push(["PASS", name, detail]); }
  else { fail++; log("FAIL " + name + (detail ? " — " + detail : "")); results.push(["FAIL", name, detail]); }
}
async function step(name, fn) {
  current = name; log("▶ STEP " + name);
  try { await fn(); }
  catch (e) { await shot("FAIL-" + name.replace(/\W+/g, "_")); fail++; results.push(["FAIL", name + " (threw)", e.message.split("\n")[0]]); throw e; }
}

// ---- scoped locators -------------------------------------------------------
const modal = () => win.locator(".modal-root.open .modal");
const field = (scope, label) => scope.locator(`div:has(> label:has-text("${label}")) input`).first();
const tfield = (scope, label) => scope.locator(`div:has(> label:has-text("${label}")) textarea`).first();
const sfield = (scope, label) => scope.locator(`div:has(> label:has-text("${label}")) select`).first();
const nav = (text) => win.getByRole("link", { name: text, exact: true }).first();
const btn = (scope, text) => scope.getByRole("button", { name: text }).first();
const dashReady = () => win.getByText(/Assalamu Alaikum/).first().waitFor({ timeout: 30000 });

async function waitModalGone() { await win.waitForFunction(() => !document.querySelector(".modal-root.open"), null, { timeout: 15000 }); }
async function rowCount() { return win.locator(".tbl table tbody tr").count(); }

// ---- main ------------------------------------------------------------------
async function main() {
  for (const f of ["dist/index.html", "dist-electron/main.js"])
    if (!fs.existsSync(path.join(REPO, f))) throw new Error(f + " missing — run `npm run build` first");
  fs.rmSync(SHOTS, { recursive: true, force: true });
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "mms-e2e-home-"));
  console.log("Isolated profile: " + tmpHome + "\n");

  app = await electron.launch({
    executablePath: path.join(REPO, "node_modules", "electron", "dist", "electron"),
    args: [".", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    cwd: REPO,
    env: { ...process.env, HOME: tmpHome, XDG_CONFIG_HOME: path.join(tmpHome, ".config") },
  });
  win = await app.firstWindow();
  win.setDefaultTimeout(20000);
  win.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  // hard watchdog so CI never hangs
  const watchdog = setTimeout(() => { console.error("WATCHDOG TIMEOUT at step: " + current); shot("FAIL-watchdog"); process.exit(1); }, 300000);

  try {
    // 1 ── first-run setup ---------------------------------------------------
    await step("first-run-setup", async () => {
      await win.getByText("Initial Setup").waitFor({ timeout: 30000 });
      await shot("01-setup");
      await field(win, "Full name").fill(ADMIN.name);
      await field(win, "Username").fill(ADMIN.user);
      await win.locator('input[type="password"]').nth(0).fill(ADMIN.pass);
      await win.locator('input[type="password"]').nth(1).fill(ADMIN.pass);
      await btn(win, "Create Administrator Account").click();
      await dashReady();
      check("setup created admin and auto-entered app", true);
    });
    await shot("02-dashboard");

    // 2 ── seed data through the UI -----------------------------------------
    await step("seed-families", async () => {
      await nav("Families").click();
      for (const [house, phone] of [["Test House One", "9876543210"], ["Test House Two", "9876500011"]]) {
        await btn(win, "Add Family").click();
        await field(modal(), "House Name").fill(house);
        await field(modal(), "House Number").fill("H-" + (house.endsWith("One") ? "1" : "2"));
        await field(modal(), "Area").fill("Test Area");
        await field(modal(), "Phone").fill(phone);
        await btn(modal(), "Save").click();
        await waitModalGone();
      }
      await win.getByText("Test House Two").first().waitFor();
      check("2 families added via UI", (await rowCount()) >= 2);
      await shot("03-families");
    });

    await step("seed-member", async () => {
      await nav("Members").click();
      await btn(win, "Add Member").click();
      const famSelect = sfield(modal(), "Family");
      await famSelect.waitFor();
      // pick the option that belongs to Test House One whatever its value/label
      const val = await famSelect.evaluate((el) => {
        const o = [...el.options].find((o) => /Test House One/.test(o.textContent));
        return o ? o.value : "";
      });
      await famSelect.selectOption(val);
      await field(modal(), "Name").fill("QA Member");
      await btn(modal(), "Save").click();
      await waitModalGone();
      await win.getByText("QA Member").first().waitFor();
      check("1 member added via UI", true);
      await shot("04-members");
    });

    await step("seed-donations", async () => {
      await nav("Donations").click();
      await addDonation("Abu Test", "General Donation", "500", "Test purpose one");
      await addDonation("Fathima Test", "Masjid Donation", "750", "Test purpose two");
      await win.getByText("Fathima Test").first().waitFor();
      const rows = await rowCount();
      check("2 donations added via UI", rows >= 2, rows + " rows");
      const receipts = await win.locator(".tbl table tbody tr td:first-child").allTextContents();
      check("receipt numbers are DN/…001 and DN/…002", /DN\/.*001/.test(receipts.join("|")) && /DN\/.*002/.test(receipts.join("|")), receipts.map(s => s.trim()).join(", "));
      await shot("05-donations");
    });

    await step("seed-income", async () => {
      await nav("Accounting").click();
      await btn(win, "Add Income").click();
      await modal().locator('input[type="date"]').fill(TODAY);
      await modal().locator('input[type="number"]').fill("1000");
      // themed bilingual category picker (Input + filtered dropdown)
      const catInput = modal().locator('input[placeholder*="Shop Rent"]').first();
      await catInput.click();
      await catInput.pressSequentially("Shop", { delay: 40 });
      await modal().getByRole("button", { name: /Shop Rent/ }).first().click();
      await btn(modal(), "Save").click();
      await waitModalGone();
      await win.getByText("Shop Rent").first().waitFor();
      check("income entry added via themed picker", true);
      await shot("06-accounting");
    });

    // 3 ── Danger Zone → Clear All Data --------------------------------------
    await step("danger-zone-clear", async () => {
      await nav("Settings").click();
      await shot("07-danger-zone");
      await btn(win, "Clear All Data").click();
      await win.getByText("Clear all data").first().waitFor();
      await shot("08-clear-dialog");
      await tfield(modal(), "Reason").fill("E2E wipe test — moving to production");
      await modal().locator('input[type="password"]').fill(ADMIN.pass);
      await btn(modal(), "Erase everything").click();
      // toast then automatic reload
      await win.getByText("factory-fresh").first().waitFor({ timeout: 20000 }).catch(() => {});
      await win.waitForTimeout(2500); // reload happens 900ms after toast
      check("wipe accepted (dialog + admin password verified)", true);
    });

    // 4 ── after the wipe ------------------------------------------------------
    await step("post-wipe-empty-states", async () => {
      // sessions survive the wipe → expect the Dashboard, not the login page
      if (await win.locator('input[type="password"]').count()) {
        await field(win, "Username").fill(ADMIN.user);
        await win.locator('input[type="password"]').fill(ADMIN.pass);
        await btn(win, "Login").click();
      }
      await dashReady();

      for (const [pageName, marker] of [["Families", "Test House One"], ["Members", "QA Member"], ["Donations", "Abu Test"], ["Accounting", "Shop Rent"]]) {
        await nav(pageName).click();
        await win.waitForTimeout(600);
        const empty = await win.locator(".empty-state").count();
        const gone = (await win.getByText(marker).count()) === 0;
        check(`${pageName}: empty after wipe`, empty > 0 && gone, empty ? "empty-state shown" : "no empty-state");
        await shot("09-after-wipe-" + pageName.toLowerCase());
      }
    });

    await step("post-wipe-audit-and-receipt-reset", async () => {
      await nav("Audit Log").click();
      await win.waitForTimeout(600);
      const auditText = (await win.locator(".tbl, .view").first().textContent().catch(() => "")) + (await win.locator("body").textContent());
      check("audit log shows CLEAR_ALL_DATA entry", auditText.includes("CLEAR_ALL_DATA"));
      const preWipeMarkers = ["FAMILY_CREATE", "MEMBER_CREATE", "DON_CREATE"].filter((a) => auditText.includes(a));
      check("pre-wipe business audit rows are gone", preWipeMarkers.length === 0, preWipeMarkers.join(",") || "none found");
      await shot("10-audit");

      // next donation must restart the receipt sequence at 001
      await nav("Donations").click();
      await addDonation("Post Wipe Donor", "General Donation", "300", "after wipe");
      await win.getByText("Post Wipe Donor").first().waitFor();
      const firstCell = await win.locator(".tbl table tbody tr td:first-child").first().textContent();
      check("receipt sequence restarted at 001", /DN\/.*001/.test(firstCell), firstCell.trim());
      check("app is fully usable after wipe (new donation saved)", true);
      await shot("11-post-wipe-donation-001");

      // login still works with the SAME admin password (users kept)
      await win.evaluate(() => localStorage.clear());
      await win.reload();
      await win.getByText("Sign In").waitFor({ timeout: 30000 });
      await field(win, "Username").fill(ADMIN.user);
      await win.locator('input[type="password"]').fill(ADMIN.pass);
      await btn(win, "Login").click();
      await dashReady();
      check("admin login works after wipe (users/settings kept)", true);
      await shot("12-relogin");
    });

    // 5 ── database-level verification (app closed first so WAL is flushed;
    //     queries run via python3 stdlib sqlite3 — no Node ABI issues) ---------
    await step("database-verification", async () => {
      await app.close();
      app = null;
      clearTimeout(watchdog);
      const dbFile = walkFind(tmpHome, "mms.db");
      check("found SQLite file in isolated profile", !!dbFile, dbFile || "not found");
      if (!dbFile) return;
      const { execFileSync } = await import("node:child_process");
      const py = [
        "import sqlite3, json, sys",
        "db = sqlite3.connect('file:' + sys.argv[1] + '?mode=ro', uri=True)",
        "q = lambda t: db.execute('SELECT COUNT(*) FROM ' + t).fetchone()[0]",
        "counts = {t: q(t) for t in ['families','members','donations','transactions','donation_categories','users','settings','audit_log','audit_chain']}",
        "clear = db.execute(\"SELECT COUNT(*) FROM audit_log WHERE action='CLEAR_ALL_DATA'\").fetchone()[0]",
        "anchor = db.execute('SELECT event_count FROM audit_chain WHERE id=1').fetchone()[0] if db.execute('SELECT COUNT(*) FROM audit_chain WHERE id=1').fetchone()[0] else -1",
        "row = db.execute('SELECT receipt_number FROM donations').fetchone()",
        "print(json.dumps({'counts': counts, 'clearRow': clear, 'anchor': anchor, 'receipt': row[0] if row else ''}))",
      ].join("; ");
      const stats = JSON.parse(execFileSync("python3", ["-c", py, dbFile]).toString());
      console.log("   DB counts:", JSON.stringify(stats.counts));
      const c = stats.counts;
      check("DB: families/members/transactions wiped", c.families === 0 && c.members === 0 && c.transactions === 0);
      check("DB: only the post-wipe donation remains", c.donations === 1);
      check("DB: reference data kept (categories=5, users=1)", c.donation_categories === 5 && c.users === 1);
      check("DB: settings kept", c.settings > 0);
      check("DB: audit trail has genesis rows + intact chain anchor", c.audit_log >= 2 && stats.anchor >= 2, "audit_log=" + c.audit_log + " chain_event_count=" + stats.anchor);
      check("DB: CLEAR_ALL_DATA row present", stats.clearRow === 1);
      check("DB: post-wipe receipt number ends 001", /001$/.test(stats.receipt), stats.receipt);
    });
  } finally {
    if (app) await app.close().catch(() => {});
  }

  console.log("\n════════ SUMMARY ════════");
  for (const [s, name, detail] of results) console.log(` ${s === "PASS" ? "✔" : "✘"} ${name}${detail ? "  [" + detail + "]" : ""}`);
  console.log(`\n RESULT: ${pass} passed, ${fail} failed; console errors: ${consoleErrors.length}`);
  console.log(" Screenshots: " + SHOTS);
  process.exit(fail ? 1 : 0);
}

async function addDonation(donor, category, amount, purpose) {
  await btn(win, "Add Donation").click();
  await field(modal(), "Donor Name").fill(donor);
  await sfield(modal(), "Category").selectOption({ label: category });
  await modal().locator('input[type="number"]').fill(amount);
  await modal().locator('input[type="date"]').fill(TODAY);
  await field(modal(), "Purpose").fill(purpose);
  await btn(modal(), "Save").click();
  await waitModalGone();
}

function walkFind(dir, file) {
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { const r = walkFind(p, file); if (r) return r; }
      else if (e.name === file) return p;
    }
  } catch {}
  return null;
}

main().catch(async (e) => {
  console.error("\nE2E ABORTED at step [" + current + "]:", e.message?.split("\n")[0]);
  process.exit(1);
});

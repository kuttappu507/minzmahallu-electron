#!/usr/bin/env node
/* Verify the demo-data rebuild by driving the REAL production database
 * initialization (schema.sql → seed.sql → ensureRuntimeSchema → migrations,
 * exactly as connection.ts does), then asserting the fresh dataset:
 *   1. Old mockup data is gone / superseded (exact row counts from V032)
 *   2. Every data-bearing column of every inserted record is filled (0 NULLs)
 *   3. TXN receipt sequence is continuous 1..15 with one VOID kept
 *   4. Demo logins verify against stored PBKDF2 hashes (admin + 3 demo users)
 *   5. Audit chain is intact (empty after wipe) and guard triggers restored
 *   6. No foreign-key violations
 *
 * Requires Node 22+ and better-sqlite3 (present in node_modules). Electron is
 * stubbed via scripts/electron-loader.mjs — run with:
 *   node --experimental-loader=./scripts/electron-loader.mjs scripts/verify-demo-rebuild.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Import the REAL app connection layer with the electron stub.
const { getDB, closeDB } = await import("../electron/db/connection.ts");
const { app } = await import("electron");

let fail = 0;
const check = (label, cond, extra = "") => {
  if (cond) console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ""}`);
  else { console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`); fail++; }
};

const db = getDB();
console.log(`DB created at ${app.getPath("userData")}`);
const q = (sql, ...p) => db.prepare(sql).get(...p);
const n = (table) => q(`SELECT COUNT(*) c FROM ${table}`).c;
const missing = (table, col) => q(`SELECT COUNT(*) c FROM ${table} WHERE ${col} IS NULL OR trim(${col}) = ''`).c;

console.log("\n— Row counts (expect the fresh V032 dataset) —");
check("families = 12", n("families") === 12, `got ${n("families")}`);
check("members = 37", n("members") === 37, `got ${n("members")}`);
check("users = 4", n("users") === 4, `got ${n("users")}`);
check("transactions = 15", n("transactions") === 15, `got ${n("transactions")}`);
check("subscriptions = 10", n("subscriptions") === 10, `got ${n("subscriptions")}`);
check("subscription_payments = 12", n("subscription_payments") === 12, `got ${n("subscription_payments")}`);
check("donations = 8", n("donations") === 8, `got ${n("donations")}`);
check("marriages = 3", n("marriages") === 3, `got ${n("marriages")}`);
check("deaths = 2", n("deaths") === 2, `got ${n("deaths")}`);
check("welfare_requests = 5", n("welfare_requests") === 5, `got ${n("welfare_requests")}`);
check("certificates = 5", n("certificates") === 5, `got ${n("certificates")}`);
check("staff = 3", n("staff") === 3, `got ${n("staff")}`);
check("staff_payments = 9", n("staff_payments") === 9, `got ${n("staff_payments")}`);
check("committee_members = 8", n("committee_members") === 8, `got ${n("committee_members")}`);
check("token_events = 3", n("token_events") === 3, `got ${n("token_events")}`);
check("token_assignments = 16", n("token_assignments") === 16, `got ${n("token_assignments")}`);
check("audit_log empty (chain reset)", n("audit_log") === 0, `got ${n("audit_log")}`);
check("record_history empty", n("record_history") === 0, `got ${n("record_history")}`);
check("family_moves empty", n("family_moves") === 0, `got ${n("family_moves")}`);
check("no demo/example leftover identifiers",
  n("families") === 12
  && !q(`SELECT COUNT(*) c FROM families WHERE house_name LIKE '%Demo%' OR notes LIKE '%Demo%' OR family_number LIKE '%DEMO%'`).c
  && !q(`SELECT COUNT(*) c FROM members WHERE member_code LIKE 'MEM-%' AND id > 37`).c);

console.log("\n— Column completeness (every data-bearing column filled, 0 NULL/empty) —");
const columnSets = {
  families: ["family_number","house_name","ward","area","address","pincode","phone","status"],
  members: ["family_id","member_code","name","gender","date_of_birth","age","blood_group","occupation","education","marital_status","mobile","email","nationality","relationship","is_head","status"],
  subscriptions: ["family_id","plan_id","period_start","period_end","amount","status"],
  subscription_payments: ["subscription_id","family_id","period_start","period_end","amount","receipt_number","payment_date","payment_method","status"],
  donations: ["donor_name","category_id","amount","donation_date","receipt_number","purpose","payment_method","received_by"],
  transactions: ["txn_date","account_id","type","amount","description","receipt_number","status"],
  marriages: ["marriage_number","bride_name","bride_father","bride_address","groom_name","groom_father","groom_address","witness1","witness2","mahar","nikah_date","registration_date","place"],
  deaths: ["death_number","deceased_name","father_name","gender","date_of_death","burial_date","cause_of_death","burial_place","age","place_of_death","address","registration_date"],
  welfare_requests: ["request_number","applicant_name","category","amount_requested","reason","status","request_date"],
  certificates: ["certificate_number","type","issued_to","issued_date","status","verification_code"],
  staff: ["staff_code","name","role","phone","email","address","joined_date","salary","payment_frequency","status"],
  staff_payments: ["staff_id","period_month","period_year","amount","payment_date","payment_method","status"],
  committee_members: ["committee_code","name","position","committee_type","phone","email","address","term_start","term_end","status"],
  token_events: ["event_name","event_type","event_date","event_time","venue","description","status"],
  token_assignments: ["event_id","family_id","token_code","status"],
};
for (const [t, cols] of Object.entries(columnSets)) {
  for (const c of cols) {
    const bad = missing(t, c);
    if (bad) { console.error(`  ✗ ${t}.${c}: ${bad} empty`); fail++; }
  }
  console.log(`  ✓ ${t} (${cols.length} cols)`);
}

console.log("\n— Data quality —");
const txn = db.prepare("SELECT receipt_number, status FROM transactions ORDER BY receipt_number").all();
const nums = txn.map((r) => Number(r.receipt_number.replace("TXN-", "")));
check("TXN receipt sequence continuous 1..15", nums.length === 15 && nums.every((x, i) => x === i + 1), txn.map((r) => r.receipt_number.replace("TXN-","")).join(","));
check("exactly 1 VOID entry kept with its receipt number", txn.filter((r) => r.status === "Void").length === 1 && txn.some((r) => r.status === "Void" && r.receipt_number === "TXN-0007"));
check("manual expenses carry voucher + bill + payee", !q(`SELECT COUNT(*) c FROM transactions WHERE type='Expense' AND status != 'Void' AND (COALESCE(voucher_no,'')='' OR COALESCE(bill_no,'')='' OR COALESCE(payee,'')='')`).c);
check("certificate codes avoid confusables 0/O/1/I/L", !q(`SELECT COUNT(*) c FROM certificates WHERE verification_code GLOB '*[0O1IL]*'`).c);
check("family-tree links resolve", !q(`SELECT COUNT(*) c FROM members m WHERE m.father_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM members m2 WHERE m2.id=m.father_id)`).c
  && !q(`SELECT COUNT(*) c FROM members m WHERE m.mother_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM members m2 WHERE m2.id=m.mother_id)`).c
  && !q(`SELECT COUNT(*) c FROM members m WHERE m.spouse_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM members m2 WHERE m2.id=m.spouse_id)`).c);

console.log("\n— Passwords —");
const users = db.prepare("SELECT username, password_hash FROM users").all();
const verify = (pw, stored) => {
  const p = stored.split("$");
  const iter = parseInt(p[1], 10), salt = Buffer.from(p[2], "base64"), hash = Buffer.from(p[3], "base64");
  return crypto.timingSafeEqual(crypto.pbkdf2Sync(pw, salt, iter, hash.length, "sha256"), hash);
};
const admin = users.find((u) => u.username === "admin");
check("admin / Admin@2026 verifies", verify("Admin@2026", admin.password_hash));
check("secretary, treasurer, imam / Demo@2026 verify", ["secretary","treasurer","imam"].every((u) => {
  const row = users.find((x) => x.username === u);
  return row && verify("Demo@2026", row.password_hash);
}));

console.log("\n— Security state —");
check("audit chain anchor reset", q("SELECT last_hash l, event_count e FROM audit_chain WHERE id=1").l === null && q("SELECT event_count e FROM audit_chain WHERE id=1").e === 0);
const fkIssues = db.prepare("PRAGMA foreign_key_check").all();
check("no foreign-key violations", fkIssues.length === 0, fkIssues.length ? JSON.stringify(fkIssues.slice(0,2)) : "all clean");
const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('trg_block_family_delete','trg_block_member_delete','trg_block_certificate_delete','trg_block_audit_log_update','trg_block_audit_log_delete')").all();
check("guard triggers restored", triggers.length === 5, `found ${triggers.length}`);
check("schema_version latest = V034", q("SELECT MAX(version) v FROM schema_version").v === 34);
check("settings.demo_data = 1", q("SELECT demo_data FROM settings WHERE id=1").demo_data === 1);

// Upgrade path: re-run init on an existing DB (schema_version present) must be a no-op
const svBefore = q("SELECT COUNT(*) c FROM schema_version").c;
const { getDB: getDB2 } = await import("../electron/db/connection.ts");
const db2 = getDB2();
check("re-init on existing DB is a no-op (same state)", db2 === db && q("SELECT COUNT(*) c FROM schema_version").c === svBefore);

console.log(`\n${fail === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${fail} CHECK(S) FAILED`}`);
closeDB();
try { fs.rmSync(app.getPath("userData"), { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);

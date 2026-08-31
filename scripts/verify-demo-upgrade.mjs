#!/usr/bin/env node
/* Upgrade-path verification: simulate an EXISTING database (old seed.sql demo
 * data + all migrations up to V031 recorded in schema_version), then run the
 * real upgrade step (only V032 applies) and assert the database ends in the
 * same rebuilt state as a fresh install (V032 demo dataset, every column
 * filled, audit chain reset, demo passwords working).
 *
 * The old seed is taken from git HEAD (the pre-rebuild seed.sql with the
 * placeholder families/members/donations), so this also proves that mockup
 * data is fully replaced on upgrade, not just on fresh installs.
 *
 * Run: node scripts/verify-demo-upgrade.mjs
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const root = process.cwd();
const sqlDir = path.join(root, "resources", "sql");
const migDir = path.join(sqlDir, "migrations");
let fail = 0;
const check = (label, cond, extra = "") => {
  if (cond) console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ""}`);
  else { console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`); fail++; }
};

const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON");

// --- Phase 1: build the "old" database -------------------------------------
console.log("— Phase 1: simulate pre-existing database (old seed + migrations to V031) —");
db.exec(fs.readFileSync(path.join(sqlDir, "schema.sql"), "utf8"));
// The pre-rebuild placeholder seed (15 families / 30 members / donations /
// subscriptions / transactions) is no longer the seed at HEAD — retrieve it
// from the first git revision that ever touched seed.sql.
const seedRevs = execSync("git rev-list --all -- resources/sql/seed.sql", { cwd: root, encoding: "utf8" })
  .trim().split(/\s+/).filter(Boolean);
let oldSeed = null;
for (const rev of [...seedRevs].reverse()) {
  const candidate = execSync(`git show ${rev}:resources/sql/seed.sql`, { cwd: root, encoding: "utf8" });
  if (/INSERT OR IGNORE INTO families/i.test(candidate)) { oldSeed = candidate; break; }
}
if (!oldSeed) {
  console.error("✗ could not find the pre-rebuild placeholder seed.sql in git history");
  process.exit(1);
}
db.exec(oldSeed);
check("old seed present (families > 0)", db.prepare("SELECT COUNT(*) c FROM families").get().c > 0,
  `${db.prepare("SELECT COUNT(*) c FROM families").get().c} families`);

// runtime schema reconciliation, copied from connection.ts (fields list is
// regex-extracted from the real source so it cannot drift)
const connSrc = fs.readFileSync(path.join(root, "electron", "db", "connection.ts"), "utf8");
const fieldsBlock = connSrc.match(/const fields: Array<\[string,string,string\]> = \[([\s\S]*?)\];/);
if (!fieldsBlock) { console.error("✗ could not parse runtime fields from connection.ts"); process.exit(1); }
const fieldRe = /\["(\w+)",\s*"(\w+)",\s*"([^"]*)"\]/g;
let fm;
while ((fm = fieldRe.exec(fieldsBlock[1]))) {
  const [, table, col, def] = fm;
  const has = db.prepare("SELECT COUNT(*) c FROM pragma_table_info(?) WHERE name = ?").get(table, col).c;
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
db.exec(`CREATE TABLE IF NOT EXISTS audit_chain (id INTEGER PRIMARY KEY CHECK (id = 1), last_hash TEXT, event_count INTEGER NOT NULL DEFAULT 0, updated_at TEXT);`);
db.exec(`INSERT OR IGNORE INTO audit_chain (id, last_hash, event_count) VALUES (1, NULL, 0);`);
db.exec(`CREATE TABLE IF NOT EXISTS token_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_name TEXT NOT NULL, event_type TEXT NOT NULL DEFAULT 'general',
  event_date TEXT NOT NULL, event_time TEXT DEFAULT '', venue TEXT DEFAULT '', description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT);`);
db.exec(`CREATE TABLE IF NOT EXISTS token_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL, family_id INTEGER NOT NULL,
  token_code TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'GENERATED', collected INTEGER NOT NULL DEFAULT 0,
  collected_at TEXT, collected_by INTEGER, cancelled_at TEXT, cancelled_reason TEXT, replacement_for INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(event_id) REFERENCES token_events(id) ON DELETE CASCADE,
  FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE RESTRICT);`);
db.exec(`CREATE TABLE IF NOT EXISTS record_history (id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, action TEXT NOT NULL, user_id INTEGER, username TEXT, changed_at TEXT NOT NULL DEFAULT (datetime('now')), summary TEXT NOT NULL, changes_json TEXT, reason TEXT, FOREIGN KEY(user_id) REFERENCES users(id));`);
db.exec(`CREATE TABLE IF NOT EXISTS family_moves (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, old_family_id INTEGER NOT NULL, new_family_id INTEGER NOT NULL, move_type TEXT NOT NULL, reason TEXT NOT NULL, moved_at TEXT NOT NULL DEFAULT (datetime('now')), moved_by INTEGER);`);
check("runtime columns present (transaction_ref, verification_code)", db.prepare("SELECT COUNT(*) c FROM pragma_table_info('transactions') WHERE name='transaction_ref'").get().c === 1
  && db.prepare("SELECT COUNT(*) c FROM pragma_table_info('certificates') WHERE name='verification_code'").get().c === 1);

// apply all migrations except the upgrade-phase set (V032 demo rebuild,
// V033/V034 WhatsApp) with the runner's duplicate-column tolerance
const skip = new Set([32, 33, 34]);
const files = fs.readdirSync(migDir).filter((f) => /^V\d+.*\.sql$/i.test(f)).sort();
let version = 0;
for (const f of files) {
  const v = Number(f.match(/^V(\d+)/)[1]);
  if (skip.has(v) || v <= version) continue;
  try {
    db.exec("BEGIN"); db.exec(fs.readFileSync(path.join(migDir, f), "utf8"));
    db.prepare("INSERT OR IGNORE INTO schema_version(version, description) VALUES(?,?)").run(v, f);
    db.exec("COMMIT"); version = v;
  } catch (e) {
    db.exec("ROLLBACK");
    if (/duplicate column|already exists/i.test(String(e.message))) {
      db.prepare("INSERT OR IGNORE INTO schema_version(version, description) VALUES(?,?)").run(v, `${f} (compatibility-reconciled)`);
      version = v; continue;
    }
    console.error(`✗ migration ${f}: ${e.message}`); process.exit(1);
  }
}
check("old DB has demo data (families/members > 0)", db.prepare("SELECT COUNT(*) c FROM families").get().c > 0 && db.prepare("SELECT COUNT(*) c FROM members").get().c > 0,
  `families=${db.prepare("SELECT COUNT(*) c FROM families").get().c} members=${db.prepare("SELECT COUNT(*) c FROM members").get().c}`);
check("old DB schema_version max = V031", db.prepare("SELECT MAX(version) v FROM schema_version").get().v === 31);

// --- Phase 2: run V032→V034 as the upgrade --------------------------------
console.log("\n— Phase 2: apply V032→V034 (the upgrade) —");
for (const [file, version] of [["V032_demo_rebuild_complete.sql", 32], ["V033_whatsapp_family_fields.sql", 33], ["V034_whatsapp_india_number_normalization.sql", 34]]) {
  try {
    db.exec("BEGIN"); db.exec(fs.readFileSync(path.join(migDir, file), "utf8"));
    db.prepare("INSERT OR IGNORE INTO schema_version(version, description) VALUES(?,?)").run(version, file);
    db.exec("COMMIT");
    console.log(`  ✓ V0${version} applied`);
  } catch (e) {
    console.error(`✗ V0${version}: ${e.message}`); process.exit(1);
  }
}

// --- Phase 3: assert the rebuilt state matches a fresh install --------------
console.log("\n— Phase 3: rebuilt state matches fresh install —");
const q = (sql, ...p) => db.prepare(sql).get(...p);
const n = (t) => q(`SELECT COUNT(*) c FROM ${t}`).c;
for (const [t, want] of [["families",12],["members",37],["users",4],["transactions",15],["subscriptions",10],
  ["subscription_payments",12],["donations",8],["marriages",3],["deaths",2],["welfare_requests",5],
  ["certificates",5],["staff",3],["staff_payments",9],["committee_members",8],["token_events",3],
  ["token_assignments",16],["audit_log",0],["record_history",0],["family_moves",0]]) {
  check(`${t} = ${want}`, n(t) === want, `got ${n(t)}`);
}
const missing = (t, c) => q(`SELECT COUNT(*) c FROM ${t} WHERE ${c} IS NULL OR trim(${c}) = ''`).c;
const cols = { families: ["family_number","house_name"], members: ["member_code","name","mobile","email"],
  transactions: ["txn_date","amount","receipt_number","status"], certificates: ["verification_code","status"],
  welfare_requests: ["request_date"], token_assignments: ["token_code","status"] };
for (const [t, cs] of Object.entries(cols)) for (const c of cs) check(`${t}.${c} filled`, missing(t, c) === 0);
check("settings.demo_data = 1", q("SELECT demo_data FROM settings WHERE id=1").demo_data === 1);
check("schema_version max = V034", q("SELECT MAX(version) v FROM schema_version").v === 34);

// passwords still work after upgrade
const verify = (pw, stored) => {
  const p = stored.split("$");
  const iter = parseInt(p[1], 10), salt = Buffer.from(p[2], "base64"), hash = Buffer.from(p[3], "base64");
  return crypto.timingSafeEqual(crypto.pbkdf2Sync(pw, salt, iter, hash.length, "sha256"), hash);
};
const users = db.prepare("SELECT username, password_hash FROM users").all();
check("admin / Admin@2026 verifies after upgrade", verify("Admin@2026", users.find((u) => u.username === "admin").password_hash));
check("demo users / Demo@2026 verify after upgrade", ["secretary","treasurer","imam"].every((u) => verify("Demo@2026", users.find((x) => x.username === u).password_hash)));
check("audit chain anchor reset", q("SELECT last_hash l FROM audit_chain WHERE id=1").l === null);
const fkV = db.prepare("PRAGMA foreign_key_check").all();
check("no foreign-key violations", fkV.length === 0, fkV.length ? JSON.stringify(fkV.slice(0, 3)) : "all clean");
const triggers = db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='trigger' AND name IN ('trg_block_family_delete','trg_block_member_delete','trg_block_certificate_delete','trg_block_audit_log_update','trg_block_audit_log_delete')").get().c;
check("guard triggers restored", triggers === 5);

console.log(`\n${fail === 0 ? "✅ UPGRADE PATH PASSED" : `❌ ${fail} CHECK(S) FAILED`}`);
process.exit(fail ? 1 : 0);

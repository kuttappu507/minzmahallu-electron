/*
 * Single SQLite connection for MMS.
 * Existing installations are repaired in-place; a user's database is never
 * silently replaced because a schema revision is incomplete.
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { app, dialog } from "electron";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export type DB = Database.Database;
let db: DB | null = null;

function resourcesDir(): string {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, "resources"), process.resourcesPath]
    : [path.join(__dirname, "..", "resources"), path.join(process.cwd(), "resources"), path.join(app.getAppPath(), "resources")];
  for (const c of candidates) if (fs.existsSync(path.join(c, "sql", "schema.sql"))) return c;
  throw new Error(`Could not find SQL resources. Checked: ${candidates.join(", ")}`);
}
function userDataDir(): string { const dir = app.getPath("userData"); fs.mkdirSync(dir, { recursive: true }); return dir; }
function dbPath(): string { return path.join(userDataDir(), "mms.db"); }

function moveDbSet(base: string, targetBase: string) {
  for (const suffix of ["", "-wal", "-shm"]) {
    const source = base + suffix;
    if (fs.existsSync(source)) fs.renameSync(source, targetBase + suffix);
  }
}
function backupDb(): string | null {
  const p = dbPath(); if (!fs.existsSync(p)) return null;
  const backup = `${p}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  try { moveDbSet(p, backup); return backup; } catch (e) { console.error("[db] Could not preserve database:", e); return null; }
}
function tableColumns(database: DB, table: string): Set<string> {
  return new Set((database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(c => c.name));
}
function addColumnIfMissing(database: DB, table: string, column: string, definition: string) {
  if (!tableColumns(database, table).has(column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[db] Added missing column ${table}.${column}`);
  }
}

/** Repair the actual columns used by the current CRUD layer. */
function ensureRuntimeSchema(database: DB) {
  const tables = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(x => x.name));
  if (!tables.has("families") || !tables.has("members")) throw new Error("Core MMS tables are missing");
  const columns: Array<[string, string, string]> = [
    ["settings", "subscription_monthly_amount", "REAL NOT NULL DEFAULT 100"],
    ["families", "archived_at", "TEXT"], ["families", "archived_by", "INTEGER"], ["families", "archive_reason", "TEXT"],
    ["members", "archive_state", "INTEGER NOT NULL DEFAULT 0"], ["members", "archive_source", "TEXT"], ["members", "archived_at", "TEXT"], ["members", "archived_by", "INTEGER"], ["members", "archive_reason", "TEXT"],
    ["donations", "transaction_ref", "TEXT"], ["donations", "updated_at", "TEXT"],
    ["transactions", "transaction_ref", "TEXT"], ["transactions", "updated_at", "TEXT"],
    ["marriages", "updated_at", "TEXT"], ["deaths", "updated_at", "TEXT"],
    ["welfare_requests", "request_date", "TEXT"], ["welfare_requests", "rejection_reason", "TEXT"], ["welfare_requests", "processed_by", "INTEGER"], ["welfare_requests", "processed_date", "TEXT"],
    ["certificates", "status", "TEXT NOT NULL DEFAULT 'Issued'"], ["audit_log", "metadata", "TEXT"],
  ];
  for (const [table, column, definition] of columns) if (tables.has(table)) addColumnIfMissing(database, table, column, definition);
  if (tables.has("welfare_requests")) database.exec("UPDATE welfare_requests SET request_date = COALESCE(request_date, created_at) WHERE request_date IS NULL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS record_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, action TEXT NOT NULL,
      user_id INTEGER, username TEXT, changed_at TEXT NOT NULL DEFAULT (datetime('now')), summary TEXT NOT NULL,
      changes_json TEXT, reason TEXT, FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_record_history_entity ON record_history(entity_type, entity_id, changed_at DESC);
    CREATE TABLE IF NOT EXISTS family_moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, old_family_id INTEGER NOT NULL, new_family_id INTEGER NOT NULL,
      move_type TEXT NOT NULL CHECK (move_type IN ('ExistingFamily','NewFamily')), reason TEXT NOT NULL,
      moved_at TEXT NOT NULL DEFAULT (datetime('now')), moved_by INTEGER,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT,
      FOREIGN KEY (old_family_id) REFERENCES families(id) ON DELETE RESTRICT,
      FOREIGN KEY (new_family_id) REFERENCES families(id) ON DELETE RESTRICT,
      FOREIGN KEY (moved_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_family_moves_member ON family_moves(member_id, moved_at DESC);
  `);
}

function recoverEmptyDatabase(database: DB): DB {
  try {
    if (!database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='families'").get()) return database;
    const count = Number((database.prepare("SELECT COUNT(*) AS c FROM families").get() as { c: number }).c);
    if (count > 0) return database;
    const candidates = fs.readdirSync(userDataDir()).filter(n => /^mms\.db\.corrupt-\d{4}-/.test(n) && !n.endsWith("-wal") && !n.endsWith("-shm")).sort().reverse();
    for (const name of candidates) {
      const candidate = path.join(userDataDir(), name); let backup: DB | null = null;
      try {
        backup = new Database(candidate, { readonly: true, fileMustExist: true });
        if (!backup.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='families'").get()) continue;
        const familyCount = Number((backup.prepare("SELECT COUNT(*) AS c FROM families").get() as { c: number }).c);
        if (familyCount <= 0) continue;
        backup.close(); backup = null; database.close(); db = null;
        const live = dbPath(); if (fs.existsSync(live)) moveDbSet(live, `${live}.empty-${new Date().toISOString().replace(/[:.]/g, "-")}`);
        moveDbSet(candidate, live); db = new Database(live); db.pragma("journal_mode = WAL"); db.pragma("foreign_keys = ON"); ensureRuntimeSchema(db);
        console.warn(`[db] Recovered ${familyCount} families from ${name}`); return db;
      } catch (e) { console.warn(`[db] Recovery candidate ${name} failed:`, e); }
      finally { try { backup?.close(); } catch {} }
    }
  } catch (e) { console.warn("[db] Empty database recovery check failed:", e); }
  return database;
}

export function getDB(): DB {
  if (db) return db;
  const p = dbPath();
  try {
    db = new Database(p); db.pragma("journal_mode = WAL"); db.pragma("foreign_keys = ON");
    initializeSchema(db); db = recoverEmptyDatabase(db); return db!;
  } catch (err) {
    console.error("[db] Initialization failed:", err); if (db) { try { db.close(); } catch {} db = null; }
    const choice = dialog.showMessageBoxSync({
      type: "error", title: "MMS — Database Error", message: "The existing database could not be opened safely.",
      detail: `${err instanceof Error ? err.message : String(err)}\n\nThe existing database will be preserved. A fresh database will only be created if you explicitly choose Yes.`,
      buttons: ["Yes — Preserve & Create Fresh", "No — Exit"], defaultId: 1, cancelId: 1,
    });
    if (choice !== 0) throw new Error("Database initialization failed; existing data was preserved");
    const backup = backupDb();
    try { db = new Database(p); db.pragma("journal_mode = WAL"); db.pragma("foreign_keys = ON"); initializeSchema(db); ensureRuntimeSchema(db); console.warn(`[db] Fresh database created; previous database preserved at ${backup ?? "(none)"}`); return db; }
    catch (retryErr) { if (db) { try { db.close(); } catch {} db = null; } throw new Error(`Could not create a fresh database: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`); }
  }
}

function initializeSchema(database: DB) {
  const hasSchema = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'").get();
  if (!hasSchema) {
    const sqlDir = path.join(resourcesDir(), "sql"); const schemaPath = path.join(sqlDir, "schema.sql"); const seedPath = path.join(sqlDir, "seed.sql");
    if (!fs.existsSync(schemaPath)) throw new Error(`Schema file not found: ${schemaPath}`);
    database.exec(fs.readFileSync(schemaPath, "utf8")); if (fs.existsSync(seedPath)) database.exec(fs.readFileSync(seedPath, "utf8"));
  }
  applyMigrations(database); ensureRuntimeSchema(database);
  const userCount = Number((database.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c);
  if (userCount === 0) console.warn("[db] users table is empty — login may require initial setup");
}

function applyMigrations(database: DB) {
  const migDir = path.join(resourcesDir(), "sql", "migrations"); if (!fs.existsSync(migDir)) return;
  const files = fs.readdirSync(migDir).filter(f => /^V\d+.*\.sql$/i.test(f)).sort();
  let current = Number((database.prepare("SELECT MAX(version) AS v FROM schema_version").get() as { v: number | null }).v ?? 0);
  for (const f of files) {
    const m = f.match(/^V(\d+)/); if (!m) continue; const v = Number(m[1]); if (v <= current) continue;
    const sql = fs.readFileSync(path.join(migDir, f), "utf8");
    try {
      database.exec("BEGIN"); database.exec(sql); database.prepare("INSERT OR IGNORE INTO schema_version(version, description) VALUES(?, ?)").run(v, f); database.exec("COMMIT"); current = v; console.log(`[db] Applied migration ${f}`);
    } catch (err) {
      try { database.exec("ROLLBACK"); } catch {}
      const msg = String(err);
      if (/duplicate column|already exists/i.test(msg)) {
        /* Older builds treated duplicate-column migrations as already applied.
           Runtime schema repair now guarantees the fields, so safely record the
           revision and continue instead of leaving every CRUD operation broken. */
        database.prepare("INSERT OR IGNORE INTO schema_version(version, description) VALUES(?, ?)").run(v, `${f} (compatibility-reconciled)`);
        current = v; console.warn(`[db] Reconciled already-present migration ${f}`); continue;
      }
      throw new Error(`Migration ${f} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export function closeDB() { if (db) { db.close(); db = null; } }
export function all<T = any>(sql: string, params: any[] = []): T[] { return getDB().prepare(sql).all(...params) as T[]; }
export function one<T = any>(sql: string, params: any[] = []): T | undefined { return getDB().prepare(sql).get(...params) as T | undefined; }
export function run(sql: string, params: any[] = []): { id: number; changes: number } { const info = getDB().prepare(sql).run(...params); return { id: Number(info.lastInsertRowid), changes: info.changes }; }
export function scalar<T = any>(sql: string, params: any[] = []): T { const row = one(sql, params) as Record<string, any> | undefined; return row ? (Object.values(row)[0] ?? 0) as T : 0 as T; }

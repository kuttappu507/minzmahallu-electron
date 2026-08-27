/* Single SQLite connection and compatibility layer for MMS. */
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
function userDataDir(): string { const d = app.getPath("userData"); fs.mkdirSync(d, { recursive: true }); return d; }
function dbPath(): string { return path.join(userDataDir(), "mms.db"); }
function moveDbSet(base: string, target: string) { for (const suffix of ["", "-wal", "-shm"]) { const s = base + suffix; if (fs.existsSync(s)) fs.renameSync(s, target + suffix); } }
function backupDb(): string | null { const p = dbPath(); if (!fs.existsSync(p)) return null; const b = `${p}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`; try { moveDbSet(p, b); return b; } catch (e) { console.error("[db] Could not preserve database:", e); return null; } }
function columns(database: DB, table: string): Set<string> { return new Set((database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(x => x.name)); }
function addColumn(database: DB, table: string, name: string, definition: string) { if (!columns(database, table).has(name)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`); }

/** Reconcile fields and feature tables used by the current CRUD layer before migrations run. */
function ensureRuntimeSchema(database: DB) {
  const tables = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(x => x.name));
  if (!tables.has("families") || !tables.has("members")) throw new Error("Core MMS tables are missing");
  const fields: Array<[string,string,string]> = [
    ["settings","subscription_monthly_amount","REAL NOT NULL DEFAULT 100"],
    ["settings","subscription_frequency","TEXT NOT NULL DEFAULT 'Monthly'"],
    ["settings","subscription_quarterly_amount","REAL NOT NULL DEFAULT 300"],
    ["settings","affiliation_number","TEXT"],
    ["settings","committee_term_start","TEXT"],
    ["settings","committee_term_end","TEXT"],
    // V027 — official certificate reg nos + mahallu jurisdiction (idempotent guards)
    ["settings","wakf_reg_no","TEXT"],
    ["settings","society_reg_no","TEXT"],
    ["settings","village","TEXT"],
    ["settings","panchayath","TEXT"],
    ["settings","taluk","TEXT"],
    ["settings","district","TEXT"],
    ["settings","pincode","TEXT"],
    ["settings","state","TEXT"],
    // V027 — extended death register fields (official SMF certificate format)
    ["deaths","place_of_death","TEXT"],
    ["deaths","address","TEXT"],
    ["deaths","registration_date","TEXT"],
    ["families","archived_at","TEXT"],["families","archived_by","INTEGER"],["families","archive_reason","TEXT"],
    ["members","archive_state","INTEGER NOT NULL DEFAULT 0"],["members","archive_source","TEXT"],["members","archived_at","TEXT"],["members","archived_by","INTEGER"],["members","archive_reason","TEXT"],["members","father_name","TEXT"],
    ["donations","transaction_ref","TEXT"],["donations","updated_at","TEXT"],
    ["transactions","transaction_ref","TEXT"],["transactions","updated_at","TEXT"],
    ["marriages","updated_at","TEXT"],["deaths","updated_at","TEXT"],
    ["welfare_requests","request_date","TEXT"],["welfare_requests","rejection_reason","TEXT"],["welfare_requests","processed_by","INTEGER"],["welfare_requests","processed_date","TEXT"],
    ["certificates","status","TEXT NOT NULL DEFAULT 'Issued'"],["audit_log","metadata","TEXT"],
  ];
  for (const [table,name,definition] of fields) if (tables.has(table)) addColumn(database, table, name, definition);
  if (tables.has("welfare_requests")) database.exec("UPDATE welfare_requests SET request_date = COALESCE(request_date, created_at) WHERE request_date IS NULL");
  // V027 backfill: existing death records were registered the day they were created.
  if (tables.has("deaths")) database.exec("UPDATE deaths SET registration_date = COALESCE(NULLIF(registration_date,''), date(created_at)) WHERE registration_date IS NULL OR registration_date = ''");

  // Token feature compatibility for databases created before the token module was added.
  // Keep this schema local and idempotent so token generation never depends on a missing
  // migration or on the build process rewriting source files.
  database.exec(`
    CREATE TABLE IF NOT EXISTS token_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_name TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT 'general',
      event_date TEXT NOT NULL,
      event_time TEXT DEFAULT '',
      venue TEXT DEFAULT '',
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS token_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      family_id INTEGER NOT NULL,
      token_code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'GENERATED',
      collected INTEGER NOT NULL DEFAULT 0,
      collected_at TEXT,
      collected_by INTEGER,
      cancelled_at TEXT,
      cancelled_reason TEXT,
      replacement_for INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(event_id) REFERENCES token_events(id) ON DELETE CASCADE,
      FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE RESTRICT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_token_event_family_active
      ON token_assignments(event_id, family_id)
      WHERE status != 'CANCELLED';
    CREATE INDEX IF NOT EXISTS idx_token_assignments_event ON token_assignments(event_id);
    CREATE INDEX IF NOT EXISTS idx_token_assignments_family ON token_assignments(family_id);
  `);
  // Older token tables may predate some fields used by collection/replacement/PDF CRUD.
  const tokenTables = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(x => x.name));
  if (tokenTables.has("token_events")) {
    addColumn(database, "token_events", "event_type", "TEXT NOT NULL DEFAULT 'general'");
    addColumn(database, "token_events", "event_time", "TEXT DEFAULT ''");
    addColumn(database, "token_events", "venue", "TEXT DEFAULT ''");
    addColumn(database, "token_events", "description", "TEXT DEFAULT ''");
    addColumn(database, "token_events", "status", "TEXT NOT NULL DEFAULT 'active'");
    addColumn(database, "token_events", "created_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
    addColumn(database, "token_events", "updated_at", "TEXT");
  }
  if (tokenTables.has("token_assignments")) {
    addColumn(database, "token_assignments", "status", "TEXT NOT NULL DEFAULT 'GENERATED'");
    addColumn(database, "token_assignments", "collected", "INTEGER NOT NULL DEFAULT 0");
    addColumn(database, "token_assignments", "collected_at", "TEXT");
    addColumn(database, "token_assignments", "collected_by", "INTEGER");
    addColumn(database, "token_assignments", "cancelled_at", "TEXT");
    addColumn(database, "token_assignments", "cancelled_reason", "TEXT");
    addColumn(database, "token_assignments", "replacement_for", "INTEGER");
    addColumn(database, "token_assignments", "created_at", "TEXT NOT NULL DEFAULT (datetime('now'))");
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS record_history (id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, action TEXT NOT NULL, user_id INTEGER, username TEXT, changed_at TEXT NOT NULL DEFAULT (datetime('now')), summary TEXT NOT NULL, changes_json TEXT, reason TEXT, FOREIGN KEY(user_id) REFERENCES users(id));
    CREATE INDEX IF NOT EXISTS idx_record_history_entity ON record_history(entity_type, entity_id, changed_at DESC);
    CREATE TABLE IF NOT EXISTS family_moves (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, old_family_id INTEGER NOT NULL, new_family_id INTEGER NOT NULL, move_type TEXT NOT NULL CHECK(move_type IN ('ExistingFamily','NewFamily')), reason TEXT NOT NULL, moved_at TEXT NOT NULL DEFAULT(datetime('now')), moved_by INTEGER, FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE RESTRICT, FOREIGN KEY(old_family_id) REFERENCES families(id) ON DELETE RESTRICT, FOREIGN KEY(new_family_id) REFERENCES families(id) ON DELETE RESTRICT, FOREIGN KEY(moved_by) REFERENCES users(id));
    CREATE INDEX IF NOT EXISTS idx_family_moves_member ON family_moves(member_id, moved_at DESC);
  `);

  // Staff module tables — created here (idempotent) so the module works on any
  // database version, even before V024 migration has a chance to run.
  database.exec(`
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_code TEXT NOT NULL UNIQUE,
      member_id INTEGER,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Staff',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      joined_date TEXT,
      salary REAL NOT NULL DEFAULT 0,
      payment_frequency TEXT NOT NULL DEFAULT 'Monthly',
      status TEXT NOT NULL DEFAULT 'Active',
      notes TEXT DEFAULT '',
      archive_state INTEGER NOT NULL DEFAULT 0,
      archive_source TEXT,
      archived_at TEXT,
      archived_by INTEGER,
      archive_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_staff_status ON staff(status, archive_state);
    CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role);
    CREATE TABLE IF NOT EXISTS staff_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL,
      period_month INTEGER NOT NULL,
      period_year INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      payment_date TEXT NOT NULL DEFAULT (date('now')),
      payment_method TEXT DEFAULT 'Cash',
      transaction_ref TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Paid',
      notes TEXT DEFAULT '',
      paid_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(staff_id) REFERENCES staff(id) ON DELETE RESTRICT,
      FOREIGN KEY(paid_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_staff_payments_staff ON staff_payments(staff_id, period_year, period_month);
    CREATE INDEX IF NOT EXISTS idx_staff_payments_period ON staff_payments(period_year, period_month);
  `);
  const allTables = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(x => x.name));
  if (allTables.has("staff")) {
    addColumn(database, "staff", "member_id", "INTEGER");
    addColumn(database, "staff", "role", "TEXT NOT NULL DEFAULT 'Staff'");
    addColumn(database, "staff", "payment_frequency", "TEXT NOT NULL DEFAULT 'Monthly'");
    addColumn(database, "staff", "archive_state", "INTEGER NOT NULL DEFAULT 0");
    addColumn(database, "staff", "archive_source", "TEXT");
    addColumn(database, "staff", "archived_at", "TEXT");
    addColumn(database, "staff", "archived_by", "INTEGER");
    addColumn(database, "staff", "archive_reason", "TEXT");
    addColumn(database, "staff", "updated_at", "TEXT");
  }

  // Committee module tables — created idempotently so the module works on any DB.
  database.exec(`
    CREATE TABLE IF NOT EXISTS committee_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      committee_code TEXT NOT NULL UNIQUE,
      member_id INTEGER,
      name TEXT NOT NULL,
      position TEXT NOT NULL DEFAULT 'Committee Member',
      committee_type TEXT NOT NULL DEFAULT 'Executive',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      term_start TEXT,
      term_end TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      notes TEXT DEFAULT '',
      archive_state INTEGER NOT NULL DEFAULT 0,
      archive_source TEXT,
      archived_at TEXT,
      archived_by INTEGER,
      archive_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_committee_status ON committee_members(status, archive_state);
    CREATE INDEX IF NOT EXISTS idx_committee_position ON committee_members(position);
    CREATE INDEX IF NOT EXISTS idx_committee_type ON committee_members(committee_type);
    CREATE INDEX IF NOT EXISTS idx_committee_term_end ON committee_members(term_end);
  `);
  if (allTables.has("committee_members")) {
    addColumn(database, "committee_members", "member_id", "INTEGER");
    addColumn(database, "committee_members", "position", "TEXT NOT NULL DEFAULT 'Committee Member'");
    addColumn(database, "committee_members", "committee_type", "TEXT NOT NULL DEFAULT 'Executive'");
    addColumn(database, "committee_members", "term_start", "TEXT");
    addColumn(database, "committee_members", "term_end", "TEXT");
    addColumn(database, "committee_members", "status", "TEXT NOT NULL DEFAULT 'Active'");
    addColumn(database, "committee_members", "archive_state", "INTEGER NOT NULL DEFAULT 0");
    addColumn(database, "committee_members", "archive_source", "TEXT");
    addColumn(database, "committee_members", "archived_at", "TEXT");
    addColumn(database, "committee_members", "archived_by", "INTEGER");
    addColumn(database, "committee_members", "archive_reason", "TEXT");
    addColumn(database, "committee_members", "updated_at", "TEXT");
  }
}

function recoverEmptyDatabase(database: DB): DB {
  try {
    if (!database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='families'").get()) return database;
    const count = Number((database.prepare("SELECT COUNT(*) AS c FROM families").get() as {c:number}).c);
    if (count > 0) return database;
    const candidates = fs.readdirSync(userDataDir()).filter(n => /^mms\.db\.corrupt-\d{4}-/.test(n) && !n.endsWith("-wal") && !n.endsWith("-shm")).sort().reverse();
    for (const name of candidates) {
      const candidate = path.join(userDataDir(), name); let backup: DB | null = null;
      try {
        backup = new Database(candidate, { readonly:true, fileMustExist:true });
        if (!backup.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='families'").get()) continue;
        const familyCount = Number((backup.prepare("SELECT COUNT(*) AS c FROM families").get() as {c:number}).c);
        if (familyCount <= 0) continue;
        backup.close(); backup = null; database.close(); db = null;
        const live = dbPath(); if (fs.existsSync(live)) moveDbSet(live, `${live}.empty-${new Date().toISOString().replace(/[:.]/g,"-")}`);
        moveDbSet(candidate, live); db = new Database(live); db.pragma("journal_mode = WAL"); db.pragma("foreign_keys = ON"); ensureRuntimeSchema(db);
        console.warn(`[db] Recovered ${familyCount} families from ${name}`);
        dialog.showMessageBoxSync({type:"info",title:"MMS — Previous Data Recovered",message:`${familyCount} family records were recovered from the preserved database.`,buttons:["OK"]});
        return db;
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
    db = new Database(p); db.pragma("journal_mode = WAL"); db.pragma("foreign_keys = ON"); initializeSchema(db); db = recoverEmptyDatabase(db); return db!;
  } catch (err) {
    console.error("[db] Initialization failed:", err); if (db) { try { db.close(); } catch {} db = null; }
    const choice = dialog.showMessageBoxSync({type:"error",title:"MMS — Database Error",message:"The existing database could not be opened safely.",detail:`${err instanceof Error ? err.message : String(err)}\n\nThe existing database will be preserved.`,buttons:["Yes — Preserve & Create Fresh","No — Exit"],defaultId:1,cancelId:1});
    if (choice !== 0) throw new Error("Database initialization failed; existing data was preserved");
    const backup = backupDb();
    try { db = new Database(p); db.pragma("journal_mode = WAL"); db.pragma("foreign_keys = ON"); initializeSchema(db); console.warn(`[db] Fresh database created; previous database preserved at ${backup ?? "(none)"}`); return db; }
    catch (retryErr) { if (db) { try { db.close(); } catch {} db = null; } throw new Error(`Could not create a fresh database: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`); }
  }
}

function initializeSchema(database: DB) {
  const hasSchema = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'").get();
  if (!hasSchema) {
    const dir = path.join(resourcesDir(), "sql"); const schema = path.join(dir,"schema.sql"); const seed = path.join(dir,"seed.sql");
    if (!fs.existsSync(schema)) throw new Error(`Schema file not found: ${schema}`);
    database.exec(fs.readFileSync(schema,"utf8")); if (fs.existsSync(seed)) database.exec(fs.readFileSync(seed,"utf8"));
  }
  // ensureRuntimeSchema runs once before migrations to add optional columns that
  // older databases may be missing (so migrations don't fail on column lookups).
  // The previous implementation called it twice (before AND after migrations);
  // the second call was debug residue and has been removed — migrations are
  // idempotent via the duplicate-column reconciliation in applyMigrations().
  ensureRuntimeSchema(database);
  applyMigrations(database);
  const users = Number((database.prepare("SELECT COUNT(*) AS c FROM users").get() as {c:number}).c);
  if (users === 0) console.warn("[db] users table is empty — login may require initial setup");
}

function applyMigrations(database: DB) {
  const dir = path.join(resourcesDir(), "sql", "migrations"); if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => /^V\d+.*\.sql$/i.test(f)).sort();
  let current = Number((database.prepare("SELECT MAX(version) AS v FROM schema_version").get() as {v:number|null}).v ?? 0);
  for (const file of files) {
    const match = file.match(/^V(\d+)/); if (!match) continue; const version = Number(match[1]); if (version <= current) continue;
    const sql = fs.readFileSync(path.join(dir,file),"utf8");
    try {
      database.exec("BEGIN"); database.exec(sql); database.prepare("INSERT OR IGNORE INTO schema_version(version,description) VALUES(?,?)").run(version,file); database.exec("COMMIT"); current = version;
    } catch (err) {
      try { database.exec("ROLLBACK"); } catch {}
      const msg = String(err);
      if (/duplicate column|already exists/i.test(msg)) { database.prepare("INSERT OR IGNORE INTO schema_version(version,description) VALUES(?,?)").run(version,`${file} (compatibility-reconciled)`); current = version; continue; }
      throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export function closeDB(){ if(db){ db.close(); db=null; } }
export function all<T=any>(sql:string,params:any[]=[]):T[]{ return getDB().prepare(sql).all(...params) as T[]; }
export function one<T=any>(sql:string,params:any[]=[]):T|undefined{ return getDB().prepare(sql).get(...params) as T|undefined; }
export function run(sql:string,params:any[]=[]):{id:number;changes:number}{ const info=getDB().prepare(sql).run(...params); return {id:Number(info.lastInsertRowid),changes:info.changes}; }
export function scalar<T=any>(sql:string,params:any[]=[]):T{ const row=one(sql,params) as Record<string,any>|undefined; return row ? (Object.values(row)[0] ?? 0) as T : 0 as T; }

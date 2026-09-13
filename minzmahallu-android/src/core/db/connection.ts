/* ============================================================================
 * Single SQLite database for the Android edition.
 *
 * Behaviour is deliberately identical to the desktop (Electron) build:
 *   · first launch applies schema.sql + seed.sql, then every pending migration
 *     from sql/migrations in version order and records them in schema_version;
 *   · a compatibility pass (ensureRuntimeSchema) adds columns older databases
 *     may lack — before migrations so they can't fail on a missing column, and
 *     again afterwards for tables those migrations create;
 *   · PRAGMA foreign_keys is re-asserted after all SQL files, because schema,
 *     seed and several migrations toggle it for their own DDL;
 *   · a database that cannot be opened is preserved as mms.db.corrupt-<stamp>
 *     and the app starts fresh instead of losing data silently.
 *
 * What changed: the image is persisted through the platform file store (an
 * app-private file on Android, IndexedDB in a browser, node:fs under test)
 * instead of better-sqlite3's native file, and the database opens
 * asynchronously (WebAssembly init) — the app awaits openDatabase() during
 * boot, then every service keeps calling getDB() synchronously.
 * ========================================================================== */
import { createSqlDatabase, type SqlDatabase } from "./sqlite.js";
import { loadSqlAssets } from "./sql-assets.js";
import { platform } from "../platform/index.js";
import { computeDeviceFingerprint } from "../services/device-fingerprint.js";
import { randomBytes, toHex } from "../platform/crypto.js";
import { installTokenDateGuard } from "./token-guard.js";
import { isAlreadyAppliedError, splitSqlStatements } from "./sql-split.js";
import {
  renumberDemoDocuments,
  provisionDemoReceiptVerificationCodes,
  provisionCertificateVerificationCodes,
} from "../services/demo-renumber.service.js";

export type DB = SqlDatabase;

/** Logical path of the database image inside the platform file store. */
export const DB_PATH = "data/mms.db";
export const DB_FOLDER = "data";

let db: DB | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistInFlight: Promise<void> | null = null;
const bootWarnings: string[] = [];

/** Non-fatal problems found while opening the database (shown on the login
 *  screen instead of a modal dialog — Android has no blocking message box). */
export function getBootWarnings(): string[] {
  return [...bootWarnings];
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function schedulePersist(): void {
  if (!db) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistNow();
  }, 250);
}

/** Write the in-memory database to its file immediately. Called on every
 *  pause/background event so a WebView kill cannot lose recent entries. */
export async function persistNow(): Promise<void> {
  if (!db) return;
  if (!db.inTransaction) {
    // Coalesce overlapping flushes: a second write while one is running would
    // just re-serialise the same bytes.
    if (persistInFlight) {
      await persistInFlight;
      if (db.inTransaction) return;
    }
    const snapshot = db.export();
    persistInFlight = (async () => {
      try {
        const host = await platform();
        await host.files.write(DB_PATH, snapshot);
      } catch (err) {
        console.error("[db] Could not mirror the database to storage:", err);
      } finally {
        persistInFlight = null;
      }
    })();
    await persistInFlight;
  }
}

export function getDB(): DB {
  if (!db) {
    throw new Error("Database is not open yet — await openDatabase() during app boot.");
  }
  return db;
}

/**
 * Open (or return) the application database.
 * Idempotent: the boot sequence and the test setup can both call it.
 */
export async function openDatabase(): Promise<DB> {
  if (db) return db;
  const host = await platform();
  let bytes: Uint8Array | null = null;
  try {
    bytes = await host.files.read(DB_PATH);
  } catch (err) {
    console.warn("[db] Could not read the database file:", err);
  }

  try {
    db = await createSqlDatabase({ bytes, onWrite: schedulePersist });
    db.pragma("foreign_keys = ON");
    initializeSchema(db);
    db.pragma("foreign_keys = ON");
    await provisionDeviceFingerprint(db);
    db = await recoverEmptyDatabase(db);
  } catch (err) {
    console.error("[db] Initialisation failed:", err);
    try { db?.close(); } catch { /* ignore */ }
    db = null;
    if (bytes?.length) {
      const preserved = `${DB_PATH}.corrupt-${stamp()}`;
      try {
        await host.files.write(preserved, bytes);
        bootWarnings.push(
          `The existing database could not be opened safely. It was preserved as ${preserved.split("/").pop()} and a fresh database was created.`
        );
      } catch (copyError) {
        console.error("[db] Could not preserve the unreadable database:", copyError);
      }
    }
    db = await createSqlDatabase({ onWrite: schedulePersist });
    db.pragma("foreign_keys = ON");
    initializeSchema(db);
    db.pragma("foreign_keys = ON");
    await provisionDeviceFingerprint(db);
    bootWarnings.push("A new empty database was created.");
  }

  await persistNow();
  return db;
}

/** Reopen the database from a new image (backup restore). */
export async function replaceDatabase(image: Uint8Array): Promise<DB> {
  closeDB();
  const host = await platform();
  await host.files.write(DB_PATH, image);
  return openDatabase();
}

export async function closeDB(): Promise<void> {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
  if (db) {
    try { await persistNow(); } catch { /* ignore */ }
    try { db.close(); } catch { /* ignore */ }
    db = null;
  }
}

// ---------------------------------------------------------------------------
// Schema + migrations
// ---------------------------------------------------------------------------

function hasTable(database: DB, name: string): boolean {
  return !!database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}

function initializeSchema(database: DB): void {
  const assets = loadSqlAssets();
  if (!hasTable(database, "schema_version")) {
    database.exec(assets.schema);
    if (assets.seed) database.exec(assets.seed);
  }
  // Runs once BEFORE migrations (older databases may lack optional columns)
  // and once AFTER (migrations create tables whose extra columns can only be
  // added then). Every addColumn is existence-guarded, so the second pass is a
  // cheap no-op when everything is already present.
  ensureRuntimeSchema(database);
  applyMigrations(database);
  ensureRuntimeSchema(database);
  installTokenDateGuard(database);
  provisionQrSigningKey(database);
  renumberDemoDocuments(database as any);
  provisionDemoReceiptVerificationCodes(database as any);
  provisionCertificateVerificationCodes(database as any);
  const users = Number((database.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number })?.c ?? 0);
  if (users === 0) console.warn("[db] users table is empty — login requires the first-run setup screen");
}

function applyMigrations(database: DB): void {
  const assets = loadSqlAssets();
  let current = Number(
    (database.prepare("SELECT MAX(version) AS v FROM schema_version").get() as { v: number | null })?.v ?? 0
  );
  for (const migration of assets.migrations) {
    if (migration.version <= current) continue;
    const outcome = applyMigration(database, migration.sql);
    if (!outcome.ok) {
      throw new Error(
        `Migration ${migration.file} failed: ${outcome.error instanceof Error ? outcome.error.message : String(outcome.error)}`
      );
    }
    for (const skipped of outcome.skipped) {
      bootWarnings.push(`Migration ${migration.file}: skipped a statement (${skipped})`);
      console.warn(`[db] ${migration.file}: skipped a statement —`, skipped);
    }
    database
      .prepare("INSERT OR IGNORE INTO schema_version(version,description) VALUES(?,?)")
      .run(migration.version, outcome.reconciled ? `${migration.file} (compatibility-reconciled)` : migration.file);
    current = migration.version;
  }
}

/**
 * Apply one migration file.
 *
 * Fast path: the whole file in a single transaction — exactly what the desktop
 * loader did. If any statement in it fails (an upgraded database where the
 * first ALTER is already applied, or a file whose later statements need a
 * column a compatibility pass adds), the file is replayed statement by
 * statement instead: statements that are already satisfied are skipped, and
 * statements that fail only because an earlier one in the same file has not
 * landed yet are retried on the next pass.
 *
 * A statement that still cannot run is reported as a boot warning rather than
 * killing the startup — the same net effect as the desktop runner, but visible
 * in the app instead of silent.
 */
function applyMigration(database: DB, sql: string): { ok: boolean; reconciled: boolean; skipped: string[]; error?: unknown } {
  try {
    database.exec("BEGIN");
    database.exec(sql);
    database.exec("COMMIT");
    return { ok: true, reconciled: false, skipped: [] };
  } catch (err) {
    try { database.exec("ROLLBACK"); } catch { /* already unwound */ }
    if (!isMigrationStructureError(err)) {
      // Not a schema-drift problem: surface it.
      const message = err instanceof Error ? err.message : String(err);
      if (!isAlreadyAppliedError(err) && !/no such (column|table)|has no column named/i.test(message)) {
        return { ok: false, reconciled: false, skipped: [], error: err };
      }
    }
  }

  // Repair path — statement by statement.
  let entries = splitSqlStatements(sql).map((statement, index) => ({ statement, index }));
  const skipped: string[] = [];
  let lastErrors: Array<{ index: number; error: unknown }> = [];
  database.exec("BEGIN");
  try {
    for (let pass = 0; pass < 3 && entries.length; pass++) {
      const failed: typeof entries = [];
      lastErrors = [];
      for (const entry of entries) {
        try {
          database.exec(entry.statement);
        } catch (err) {
          failed.push(entry);
          lastErrors.push({ index: entry.index, error: err });
        }
      }
      if (!failed.length) { entries = []; break; }
      if (failed.length === entries.length) { entries = failed; break; } // no progress
      entries = failed;
    }
    for (const failure of lastErrors) {
      const message = failure.error instanceof Error ? failure.error.message : String(failure.error);
      // "Already applied" is expected on upgrades; a missing column/table can
      // still arrive from a later compatibility pass, so it is only a warning.
      if (isAlreadyAppliedError(failure.error) || /no such (column|table)|has no column named/i.test(message)) {
        skipped.push(message);
        continue;
      }
      database.exec("ROLLBACK");
      return { ok: false, reconciled: true, skipped, error: failure.error };
    }
    database.exec("COMMIT");
  } catch (err) {
    try { database.exec("ROLLBACK"); } catch { /* already unwound */ }
    return { ok: false, reconciled: true, skipped, error: err };
  }
  return { ok: true, reconciled: true, skipped };
}

/** Errors that mean the database does not look like a usable file at all. */
function isMigrationStructureError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /malformed|not a database|disk image|database is locked|readonly database|disk full/i.test(message);
}

function columns(database: DB, table: string): Set<string> {
  return new Set(
    (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name)
  );
}

function addColumn(database: DB, table: string, name: string, definition: string): void {
  if (!columns(database, table).has(name)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

/** Reconcile fields and feature tables used by the current CRUD layer.
 *  (Ported verbatim from the desktop connection — same list, same defaults.) */
function ensureRuntimeSchema(database: DB) {
  const tables = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(x => x.name));
  if (!tables.has("families") || !tables.has("members")) throw new Error("Core MMS tables are missing");
  const fields: Array<[string,string,string]> = [
    ["settings","subscription_monthly_amount","REAL NOT NULL DEFAULT 100"],
    ["settings","subscription_frequency","TEXT NOT NULL DEFAULT 'Monthly'"],
    ["settings","subscription_quarterly_amount","REAL NOT NULL DEFAULT 300"],
    // Auto-backup retention — how many automatic .mmbak files to keep on disk
    ["settings","backup_keep_count","INTEGER NOT NULL DEFAULT 30"],
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
    // V030 — voucher/bill control fields on manual transactions (audit evidence for expenses)
    ["transactions","voucher_no","TEXT"],["transactions","bill_no","TEXT"],["transactions","payee","TEXT"],
    // V031 — receipt VOID workflow + certificate anti-forgery
    ["transactions","status","TEXT NOT NULL DEFAULT 'Posted'"],["transactions","voided_at","TEXT"],["transactions","voided_by","INTEGER"],["transactions","void_reason","TEXT"],
    // V036 — ledger categories on manual transactions (shop rent, goods rent, hall rent etc.)
    ["transactions","category","TEXT"],
    ["certificates","verification_code","TEXT"],["certificates","reprint_count","INTEGER NOT NULL DEFAULT 0"],
    // V030 — member family-tree links (father/mother/spouse as member references)
    ["members","father_id","INTEGER"],["members","mother_id","INTEGER"],["members","spouse_id","INTEGER"],
    // V030 — tamper-evident audit chain columns + demo-data flag
    ["audit_log","prev_hash","TEXT"],["audit_log","entry_hash","TEXT"],
    ["settings","demo_data","INTEGER NOT NULL DEFAULT 0"],
    // QR anti-forgery — device fingerprint + HMAC signing key bound into QR payloads
    ["settings","device_fingerprint","TEXT"],
    ["settings","qr_signing_key","TEXT"],
    // Backup mirror — second copy of every .mmbak (USB / other disk / Drive folder)
    ["settings","backup_mirror_dir","TEXT"],
    // Receipt anti-forgery — verification codes on money receipts (V035).
    // subscriptions is the legacy mirror that can still back a receipt when
    // an account's payment predates the ledger, so it carries codes too.
    ["donations","verification_code","TEXT"],
    ["subscription_payments","verification_code","TEXT"],
    ["subscriptions","verification_code","TEXT"],
    // Multi-month dues & advance (V036): unpaid balances from closed months
    // accumulate on the subscription account (arrears); overpayments become
    // credit (advance) that nets against future dues. Each ledger payment
    // remembers how much cash cleared arrears / became advance so a re-record
    // or cancel can roll the account state back exactly.
    ["subscriptions","arrears","REAL NOT NULL DEFAULT 0"],
    ["subscriptions","advance","REAL NOT NULL DEFAULT 0"],
    ["subscription_payments","arrears_cleared","REAL NOT NULL DEFAULT 0"],
    ["subscription_payments","advance_added","REAL NOT NULL DEFAULT 0"],
    // WhatsApp receipt privacy lock (V037): one send per receipt (+ one
    // admin-authorized re-send). receipt_sent_at marks the ACCEPTED send,
    // whatsapp_msg_id maps late delivery receipts back to the row, and
    // receipt_delivered_at is set ONLY when the phone actually got it — the
    // lock rule. Rows on `subscriptions` would go stale at month roll-over,
    // so the live state lives on the money tables (donations and the
    // subscription_payments ledger) and the list joins the current month's
    // ledger row.
    ["donations","receipt_pdf","BLOB"],
    ["donations","receipt_generated_at","TEXT"],
    ["donations","receipt_sent_at","TEXT"],
    ["donations","receipt_delivered_at","TEXT"],
    ["donations","receipt_resends","INTEGER NOT NULL DEFAULT 0"],
    ["donations","whatsapp_msg_id","TEXT"],
    ["subscription_payments","receipt_pdf","BLOB"],
    ["subscription_payments","receipt_generated_at","TEXT"],
    ["subscription_payments","receipt_sent_at","TEXT"],
    ["subscription_payments","receipt_delivered_at","TEXT"],
    ["subscription_payments","receipt_resends","INTEGER NOT NULL DEFAULT 0"],
    ["subscription_payments","whatsapp_msg_id","TEXT"],
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
  // Date-based deletion protection: a token event can be deleted only
  // after its date is over — upcoming events are protected (DB triggers
  // enforce it even against external editors — see token-guard.ts).
  installTokenDateGuard(database);

  database.exec(`
    CREATE TABLE IF NOT EXISTS record_history (id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, action TEXT NOT NULL, user_id INTEGER, username TEXT, changed_at TEXT NOT NULL DEFAULT (datetime('now')), summary TEXT NOT NULL, changes_json TEXT, reason TEXT, FOREIGN KEY(user_id) REFERENCES users(id));
    CREATE INDEX IF NOT EXISTS idx_record_history_entity ON record_history(entity_type, entity_id, changed_at DESC);
    CREATE TABLE IF NOT EXISTS family_moves (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, old_family_id INTEGER NOT NULL, new_family_id INTEGER NOT NULL, move_type TEXT NOT NULL CHECK(move_type IN ('ExistingFamily','NewFamily')), reason TEXT NOT NULL, moved_at TEXT NOT NULL DEFAULT(datetime('now')), moved_by INTEGER, FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE RESTRICT, FOREIGN KEY(old_family_id) REFERENCES families(id) ON DELETE RESTRICT, FOREIGN KEY(new_family_id) REFERENCES families(id) ON DELETE RESTRICT, FOREIGN KEY(moved_by) REFERENCES users(id));
    CREATE INDEX IF NOT EXISTS idx_family_moves_member ON family_moves(member_id, moved_at DESC);
    -- V030 — tamper-evidence anchor: stores the hash of the newest audit event so
    -- chain verification can also detect truncation of the tail of the log.
    CREATE TABLE IF NOT EXISTS audit_chain (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_hash TEXT,
      event_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT
    );
    INSERT OR IGNORE INTO audit_chain (id, last_hash, event_count) VALUES (1, NULL, 0);
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
  // Per-entity lookups for the ledger double-click preview and the "Edited"
  // badge — audit rows for one transaction/donation are fetched by (module, id).
  if (allTables.has("audit_log")) {
    database.exec(`CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(module, entity_id);`);
  }
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

/** Compute and store this device's fingerprint once — every later QR payload
 *  uses the same stable value, so prints stay verifiable. */
async function provisionDeviceFingerprint(database: DB): Promise<void> {
  try {
    const row = database.prepare("SELECT device_fingerprint FROM settings WHERE id = 1").get() as
      | { device_fingerprint: string | null }
      | undefined;
    if (!row || !row.device_fingerprint) {
      const fingerprint = await computeDeviceFingerprint();
      database.prepare("UPDATE settings SET device_fingerprint = ? WHERE id = 1").run(fingerprint);
    }
  } catch (err) {
    console.warn("[db] Could not provision the device fingerprint:", err);
  }
}

/** 32 random bytes, hex-encoded, stored once. Signs every printed QR (HMAC)
 *  and is never printed or exported — a restored backup keeps its key. */
function provisionQrSigningKey(database: DB): void {
  try {
    const row = database.prepare("SELECT qr_signing_key FROM settings WHERE id = 1").get() as
      | { qr_signing_key: string | null }
      | undefined;
    if (!row || !row.qr_signing_key) {
      database.prepare("UPDATE settings SET qr_signing_key = ? WHERE id = 1").run(toHex(randomBytes(32)));
    }
  } catch (err) {
    console.warn("[db] Could not provision the QR signing key:", err);
  }
}

/** If the live database came back empty but a preserved copy holds data, put
 *  the data back (the mobile equivalent of the desktop recovery dialog). */
async function recoverEmptyDatabase(database: DB): Promise<DB> {
  try {
    if (!database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='families'").get()) return database;
    const count = Number((database.prepare("SELECT COUNT(*) AS c FROM families").get() as { c: number })?.c ?? 0);
    if (count > 0) return database;
    const host = await platform();
    const candidates = (await host.files.list(DB_FOLDER))
      .filter((file) => /^mms\.db\.corrupt-\d{4}-/.test(file.name))
      .sort((a, b) => b.name.localeCompare(a.name));
    for (const candidate of candidates) {
      try {
        const bytes = await host.files.read(`${DB_FOLDER}/${candidate.name}`);
        if (!bytes) continue;
        const probe = await createSqlDatabase({ bytes });
        const familyCount = Number((probe.prepare("SELECT COUNT(*) AS c FROM families").get() as { c: number })?.c ?? 0);
        probe.close();
        if (!familyCount) continue;
        await host.files.write(`${DB_FOLDER}/mms.db.empty-${stamp()}`, database.export());
        database.close();
        await host.files.write(DB_PATH, bytes);
        const reopened = await createSqlDatabase({ bytes, onWrite: schedulePersist });
        reopened.pragma("foreign_keys = ON");
        ensureRuntimeSchema(reopened);
        bootWarnings.push(`${familyCount} family records were recovered from a preserved copy of the database.`);
        return reopened;
      } catch (err) {
        console.warn(`[db] Recovery candidate ${candidate.name} failed:`, err);
      }
    }
  } catch (err) {
    console.warn("[db] Empty-database recovery check failed:", err);
  }
  return database;
}

// ---------------------------------------------------------------------------
// Query helpers — unchanged signatures, so no service had to be rewritten.
// ---------------------------------------------------------------------------
export function all<T = any>(sql: string, params: any[] = []): T[] {
  return getDB().prepare(sql).all(...params) as T[];
}
export function one<T = any>(sql: string, params: any[] = []): T | undefined {
  return getDB().prepare(sql).get(...params) as T | undefined;
}
export function run(sql: string, params: any[] = []): { id: number; changes: number } {
  const info = getDB().prepare(sql).run(...params);
  return { id: Number(info.lastInsertRowid), changes: info.changes };
}
export function scalar<T = any>(sql: string, params: any[] = []): T {
  const row = one(sql, params) as Record<string, any> | undefined;
  return (row ? (Object.values(row)[0] ?? 0) : 0) as T;
}

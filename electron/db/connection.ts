/*
 * Database connection — better-sqlite3 (synchronous, fast).
 * Schema + seed + migrations live under resources/sql/.
 *
 * SQL files are loaded via `extraResources` in electron-builder config
 * (so they live OUTSIDE the asar at process.resourcesPath/resources/sql/)
 * which is accessible to fs.readFileSync() even in packaged mode.
 *
 * Native module (better_sqlite3.node) is unpacked from the asar via
 * `asarUnpack` so Node's `require()` can load it.
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
  const candidates: string[] = [];
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, "resources"));
    candidates.push(process.resourcesPath);
  } else {
    candidates.push(path.join(__dirname, "..", "resources"));
    candidates.push(path.join(process.cwd(), "resources"));
    candidates.push(path.join(app.getAppPath(), "resources"));
  }
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "sql", "schema.sql"))) return c;
  }
  throw new Error(`Could not find SQL resources. Checked: ${candidates.join(", ")}`);
}

function userDataDir(): string {
  const dir = app.getPath("userData");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function dbPath(): string {
  return path.join(userDataDir(), "mms.db");
}

/** Preserve a database as a complete SQLite set (main DB + WAL + SHM). */
function moveDbSet(base: string, targetBase: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const source = base + suffix;
    if (!fs.existsSync(source)) continue;
    const target = targetBase + suffix;
    fs.renameSync(source, target);
  }
}

/**
 * Never silently delete a user's database. Keep a recoverable backup instead.
 */
function backupDb(): string | null {
  const p = dbPath();
  if (!fs.existsSync(p)) return null;
  const backup = `${p}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  try {
    moveDbSet(p, backup);
    return backup;
  } catch (e) {
    console.warn("[db] Could not preserve complete database set:", e);
    return null;
  }
}

/**
 * If an earlier startup created an empty replacement database while a real
 * database backup exists, recover the newest backup containing family data.
 * This is deliberately data-driven: a backup is restored only when the live
 * DB has zero families and the candidate backup has at least one family.
 */
function recoverEmptyDatabase(database: DB): DB {
  try {
    const familyTable = database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='families'")
      .get();
    if (!familyTable) return database;

    const familyCount = Number((database.prepare("SELECT COUNT(*) AS c FROM families").get() as { c: number }).c);
    if (familyCount > 0) return database;

    const dir = userDataDir();
    const candidates = fs.readdirSync(dir)
      .filter((name) => /^mms\.db\.corrupt-\d{4}-/.test(name))
      .filter((name) => !name.endsWith("-wal") && !name.endsWith("-shm"))
      .sort()
      .reverse();

    for (const name of candidates) {
      const candidate = path.join(dir, name);
      let backupDbHandle: DB | null = null;
      try {
        backupDbHandle = new Database(candidate, { readonly: true, fileMustExist: true });
        backupDbHandle.pragma("query_only = ON");
        const hasFamilies = backupDbHandle
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='families'")
          .get();
        if (!hasFamilies) continue;
        const count = Number((backupDbHandle.prepare("SELECT COUNT(*) AS c FROM families").get() as { c: number }).c);
        if (count <= 0) continue;
        backupDbHandle.close();
        backupDbHandle = null;

        database.close();
        db = null;
        const live = dbPath();
        const emptyBackup = `${live}.empty-${new Date().toISOString().replace(/[:.]/g, "-")}`;
        if (fs.existsSync(live)) moveDbSet(live, emptyBackup);
        moveDbSet(candidate, live);

        db = new Database(live);
        db.pragma("journal_mode = WAL");
        db.pragma("foreign_keys = ON");
        console.warn(`[db] Recovered ${count} families from preserved database ${name}`);
        dialog.showMessageBoxSync({
          type: "info",
          title: "MMS — Previous Data Recovered",
          message: `${count} family records were recovered from the preserved database.`,
          detail: "Your previous database was restored automatically because the current database was empty. The empty database was preserved as a backup.",
          buttons: ["OK"],
        });
        return db;
      } catch (err) {
        console.warn(`[db] Could not inspect recovery candidate ${name}:`, err);
      } finally {
        try { backupDbHandle?.close(); } catch {}
      }
    }
  } catch (err) {
    console.warn("[db] Empty-database recovery check failed:", err);
  }
  return database;
}

export function getDB(): DB {
  if (db) return db;
  const p = dbPath();
  try {
    db = new Database(p);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initializeSchema(db);
    db = recoverEmptyDatabase(db);
  } catch (err) {
    console.error("[db] First init attempt failed:", err);
    if (db) { try { db.close(); } catch {} db = null; }

    const choice = dialog.showMessageBoxSync({
      type: "error",
      title: "MMS — Database Error",
      message: "The existing database could not be opened safely.",
      detail: `Error: ${err instanceof Error ? err.message : String(err)}\n\n` +
        "Your existing database will NOT be deleted.\n" +
        "Choose Yes only if you want to preserve the current file as a backup and create a fresh database.",
      buttons: ["Yes — Create Fresh Database", "No — Exit"],
      defaultId: 1,
      cancelId: 1,
    });

    if (choice !== 0) {
      throw new Error("Database initialization failed; existing data was preserved");
    }

    const backup = backupDb();
    try {
      db = new Database(p);
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      initializeSchema(db);
      dialog.showMessageBoxSync({
        type: "warning",
        title: "MMS — Fresh Database Created",
        message: "A new database was created.",
        detail: `The previous database was preserved here:\n${backup ?? "(no previous database file found)"}\n\n` +
          "Do not overwrite or delete that backup until the data has been verified.",
        buttons: ["OK"],
      });
    } catch (retryErr) {
      if (db) { try { db.close(); } catch {} db = null; }
      throw new Error(`Could not create a fresh database: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
    }
  }
  return db!;
}

function initializeSchema(database: DB) {
  const hasSchemaVersion = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
    .get() as { name: string } | undefined;

  if (!hasSchemaVersion) {
    const sqlDir = path.join(resourcesDir(), "sql");
    const schemaPath = path.join(sqlDir, "schema.sql");
    const seedPath = path.join(sqlDir, "seed.sql");
    if (!fs.existsSync(schemaPath)) throw new Error(`Schema file not found: ${schemaPath}`);
    database.exec(fs.readFileSync(schemaPath, "utf-8"));
    if (fs.existsSync(seedPath)) database.exec(fs.readFileSync(seedPath, "utf-8"));
  }

  applyMigrations(database);
  const userCount = database.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
  if (userCount.c === 0) console.warn("[db] users table is empty — login may fail");
}

function applyMigrations(database: DB) {
  const migDir = path.join(resourcesDir(), "sql", "migrations");
  if (!fs.existsSync(migDir)) return;

  const files = fs.readdirSync(migDir)
    .filter((f) => /^V\d+.*\.sql$/i.test(f))
    .sort();

  const current = (database.prepare("SELECT MAX(version) AS v FROM schema_version").get() as { v: number | null }).v ?? 0;

  for (const f of files) {
    const m = f.match(/^V(\d+)/);
    if (!m) continue;
    const v = parseInt(m[1], 10);
    if (v <= current) continue;

    const sql = fs.readFileSync(path.join(migDir, f), "utf-8");
    console.log(`[db] Applying migration ${f} (v${v})...`);

    try {
      database.exec("BEGIN");
      try {
        database.exec(sql);
      } catch (sqlErr) {
        const msg = String(sqlErr);
        if (/duplicate column|already exists/i.test(msg)) {
          console.warn(`[db] Migration ${f} reported an existing object; continuing as idempotent: ${msg.split("\n")[0]}`);
          database.exec("ROLLBACK");
          database.exec("BEGIN");
        } else {
          database.exec("ROLLBACK");
          throw sqlErr;
        }
      }
      database.prepare("INSERT OR IGNORE INTO schema_version (version, description) VALUES (?, ?)").run(v, f);
      database.exec("COMMIT");
      console.log(`[db] Applied migration ${f}`);
    } catch (err) {
      try { database.exec("ROLLBACK"); } catch {}
      throw new Error(`Migration ${f} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export function closeDB() {
  if (db) { db.close(); db = null; }
}

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
  if (!row) return 0 as any;
  return (Object.values(row)[0] ?? 0) as T;
}

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
 *
 * Migration strategy:
 *  - Fresh install: load schema.sql + seed.sql, then run migrations.
 *  - Existing install: just run pending migrations.
 *  - Each migration is wrapped in a transaction. If the SQL fails
 *    with a benign error (duplicate column / already exists), we
 *    record the version anyway so we don't retry forever.
 *  - Version record uses INSERT OR IGNORE so migration files that
 *    contain their own INSERT INTO schema_version (legacy pattern)
 *    don't cause UNIQUE constraint failures.
 *  - If init fails, we attempt to delete the corrupted DB and retry
 *    once with a fresh install.
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
    if (fs.existsSync(path.join(c, "sql", "schema.sql"))) {
      console.log(`[db] Found SQL files at: ${c}`);
      return c;
    }
  }
  console.error("[db] Could not find SQL files in any candidate path:", candidates);
  return candidates[0];
}

function userDataDir(): string {
  const dir = app.getPath("userData");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function dbPath(): string {
  return path.join(userDataDir(), "mms.db");
}

/** Delete the DB file + WAL + SHM. Use when the DB is corrupted. */
function deleteDb() {
  const p = dbPath();
  for (const f of [p, p + "-wal", p + "-shm"]) {
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch (e) { console.warn(`[db] Could not delete ${f}:`, e); }
    }
  }
}

export function getDB(): DB {
  if (db) return db;

  const p = dbPath();
  console.log(`[db] Opening database at: ${p}`);

  try {
    db = new Database(p);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initializeSchema(db);
  } catch (err) {
    console.error("[db] First init attempt failed:", err);

    // Close the failed connection
    if (db) { try { db.close(); } catch {} db = null; }

    // Ask the user if they want to reset the database
    const choice = dialog.showMessageBoxSync({
      type: "question",
      title: "MMS — Database Error",
      message: "Failed to initialize the database.",
      detail: `Error: ${err instanceof Error ? err.message : String(err)}\n\n` +
        `This may be due to a corrupted database from a previous build.\n\n` +
        `Click "Yes" to delete the old database and create a fresh one. ` +
        `Your existing data will be lost but the app will work.\n\n` +
        `Click "No" to continue with the broken database (login may fail).`,
      buttons: ["Yes — Reset Database", "No — Continue Anyway"],
      defaultId: 0,
      cancelId: 1,
    });

    if (choice === 0) {
      console.log("[db] User chose to reset database. Deleting old DB...");
      deleteDb();
      try {
        db = new Database(p);
        db.pragma("journal_mode = WAL");
        db.pragma("foreign_keys = ON");
        initializeSchema(db);
        console.log("[db] Database reset successful — fresh install created");
        dialog.showMessageBoxSync({
          type: "info",
          title: "MMS — Database Reset",
          message: "The database has been reset successfully.",
          detail: "A fresh database was created with seed data. You can now log in with admin / admin123.",
          buttons: ["OK"],
        });
      } catch (retryErr) {
        console.error("[db] Reset also failed:", retryErr);
        dialog.showErrorBox(
          "MMS — Fatal Database Error",
          `Could not create a fresh database either:\n\n${retryErr instanceof Error ? retryErr.message : String(retryErr)}\n\n` +
          `Please check write permissions for:\n${p}`
        );
        // Create an in-memory dummy DB so the app doesn't crash on startup
        // (login will still fail, but at least the UI loads)
        db = new Database(":memory:");
      }
    } else {
      console.log("[db] User chose to continue with broken DB — creating in-memory fallback");
      // Create an in-memory dummy so the app doesn't crash
      // Login will fail but the UI will load
      db = new Database(":memory:");
    }
  }

  return db;
}

function initializeSchema(database: DB) {
  try {
    const hasSchemaVersion = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
      )
      .get() as { name: string } | undefined;

    if (!hasSchemaVersion) {
      // Fresh install — load schema + seed
      const sqlDir = path.join(resourcesDir(), "sql");
      const schemaPath = path.join(sqlDir, "schema.sql");
      const seedPath = path.join(sqlDir, "seed.sql");

      if (!fs.existsSync(schemaPath)) {
        console.error(`[db] Schema file not found at: ${schemaPath}`);
        throw new Error(`Schema file not found: ${schemaPath}`);
      }

      console.log(`[db] Fresh install — loading schema from ${schemaPath}`);
      const schema = fs.readFileSync(schemaPath, "utf-8");
      database.exec(schema);
      console.log("[db] Schema loaded");

      if (fs.existsSync(seedPath)) {
        console.log(`[db] Loading seed data from ${seedPath}`);
        const seed = fs.readFileSync(seedPath, "utf-8");
        database.exec(seed);
        console.log("[db] Seed data loaded");
      }
    } else {
      console.log("[db] Existing database — checking for pending migrations");
    }

    // ===== ALWAYS run pending migrations (works for both fresh + existing) =====
    applyMigrations(database);

    // Verify users table exists and has at least one row
    const userCount = database
      .prepare("SELECT COUNT(*) AS c FROM users")
      .get() as { c: number };
    console.log(`[db] Users table has ${userCount.c} rows`);
    if (userCount.c === 0) {
      console.error("[db] WARNING: users table is empty — login will fail!");
    }
  } catch (err) {
    console.error("[db] Schema initialization failed:", err);
    throw err;
  }
}

function applyMigrations(database: DB) {
  const migDir = path.join(resourcesDir(), "sql", "migrations");
  if (!fs.existsSync(migDir)) {
    console.log("[db] No migrations directory — skipping");
    return;
  }

  const files = fs
    .readdirSync(migDir)
    .filter((f) => /^V\d+.*\.sql$/i.test(f))
    .sort();

  const current = (
    database
      .prepare("SELECT MAX(version) AS v FROM schema_version")
      .get() as { v: number | null }
  ).v ?? 0;

  console.log(`[db] Current schema version: ${current}, available migrations: ${files.length}`);

  for (const f of files) {
    const m = f.match(/^V(\d+)/);
    if (!m) continue;
    const v = parseInt(m[1], 10);
    if (v <= current) {
      console.log(`[db] Skipping migration ${f} (already applied)`);
      continue;
    }

    const sqlPath = path.join(migDir, f);
    const sql = fs.readFileSync(sqlPath, "utf-8");
    console.log(`[db] Applying migration ${f} (v${v})...`);

    try {
      database.exec("BEGIN");
      try {
        database.exec(sql);
      } catch (sqlErr) {
        const msg = String(sqlErr);
        if (/duplicate column|already exists/i.test(msg)) {
          console.warn(`[db] Migration ${f}: SQL had benign error (${msg.split("\n")[0].slice(0, 100)}), recording version anyway`);
          database.exec("ROLLBACK");
          database.exec("BEGIN");
        } else {
          database.exec("ROLLBACK");
          throw sqlErr;
        }
      }
      database
        .prepare(
          "INSERT OR IGNORE INTO schema_version (version, description) VALUES (?, ?)"
        )
        .run(v, f);
      database.exec("COMMIT");
      console.log(`[db] Applied migration ${f}`);
    } catch (err) {
      try { database.exec("ROLLBACK"); } catch {}
      console.error(`[db] Migration ${f} failed:`, err);
    }
  }
}

export function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}

// Helper for prepared SELECT-all
export function all<T = any>(sql: string, params: any[] = []): T[] {
  return getDB().prepare(sql).all(...params) as T[];
}

// Helper for SELECT-one
export function one<T = any>(sql: string, params: any[] = []): T | undefined {
  return getDB().prepare(sql).get(...params) as T | undefined;
}

// Helper for INSERT/UPDATE/DELETE — returns lastInsertRowid / changes
export function run(sql: string, params: any[] = []): { id: number; changes: number } {
  const stmt = getDB().prepare(sql);
  const info = stmt.run(...params);
  return { id: Number(info.lastInsertRowid), changes: info.changes };
}

// Scalar
export function scalar<T = any>(sql: string, params: any[] = []): T {
  const row = one(sql, params) as Record<string, any> | undefined;
  if (!row) return 0 as any;
  const vals = Object.values(row);
  return (vals[0] ?? 0) as T;
}

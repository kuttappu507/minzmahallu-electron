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
import { app } from "electron";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type DB = Database.Database;

let db: DB | null = null;

function resourcesDir(): string {
  // Try multiple paths in order:
  // 1. Packaged: process.resourcesPath/resources (extraResources destination)
  // 2. Dev:      ../resources (relative to dist-electron/)
  // 3. Dev fallback: process.cwd()/resources
  const candidates: string[] = [];

  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, "resources"));
    // Some builds put extraResources at the root, not under "resources"
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
  return candidates[0]; // Return first candidate as fallback
}

function userDataDir(): string {
  const dir = app.getPath("userData");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDB(): DB {
  if (db) return db;

  const dbPath = path.join(userDataDir(), "mms.db");
  console.log(`[db] Opening database at: ${dbPath}`);

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Initialize schema if needed
  initializeSchema(db);

  return db;
}

function initializeSchema(database: DB) {
  try {
    // Check if schema_version table exists
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
      console.log("[db] Existing database — checking migrations");
      // Existing install — apply migrations
      const migDir = path.join(resourcesDir(), "sql", "migrations");
      if (fs.existsSync(migDir)) {
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
          if (v <= current) continue;
          const sql = fs.readFileSync(path.join(migDir, f), "utf-8");
          try {
            database.exec(sql);
            database
              .prepare(
                "INSERT INTO schema_version (version, description) VALUES (?, ?)"
              )
              .run(v, f);
            console.log(`[db] Applied migration ${f}`);
          } catch (err) {
            const msg = String(err);
            if (/duplicate column|already exists/i.test(msg)) {
              console.warn(`[db] Migration ${f}: already applied, skipping`);
            } else {
              console.error(`[db] Migration ${f} failed:`, err);
              throw err;
            }
          }
        }
      }
    }

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

/*
 * Database connection — better-sqlite3 (synchronous, fast).
 * Schema + seed + migrations live under resources/sql/.
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
  // When running in dev (ts compiled to dist-electron/), resources live in ../resources
  // When packaged, resources live in process.resourcesPath
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "resources");
  }
  return path.join(__dirname, "..", "resources");
}

function userDataDir(): string {
  const dir = app.getPath("userData");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDB(): DB {
  if (db) return db;

  const dbPath = path.join(userDataDir(), "mms.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Initialize schema if needed
  initializeSchema(db);

  return db;
}

function initializeSchema(database: DB) {
  // Check if schema_version table exists
  const hasSchemaVersion = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    )
    .get() as { name: string } | undefined;

  if (!hasSchemaVersion) {
    // Fresh install — load schema + seed
    const sqlDir = resourcesDir() + "/sql";
    const schemaPath = path.join(sqlDir, "schema.sql");
    const seedPath = path.join(sqlDir, "seed.sql");

    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, "utf-8");
      database.exec(schema);
    }
    if (fs.existsSync(seedPath)) {
      const seed = fs.readFileSync(seedPath, "utf-8");
      database.exec(seed);
    }
    console.log("[db] Fresh install — schema + seed loaded");
  } else {
    // Existing install — apply migrations
    const migDir = path.join(resourcesDir(), "sql", "migrations");
    if (fs.existsSync(migDir)) {
      const files = fs
        .readdirSync(migDir)
        .filter((f) => /^V\d+.*\.sql$/i.test(f))
        .sort();
      const current = (
        database.prepare("SELECT MAX(version) AS v FROM schema_version").get() as {
          v: number | null;
        }
      ).v ?? 0;

      for (const f of files) {
        const m = f.match(/^V(\d+)/);
        if (!m) continue;
        const v = parseInt(m[1], 10);
        if (v <= current) continue;
        const sql = fs.readFileSync(path.join(migDir, f), "utf-8");
        try {
          database.exec(sql);
          database.prepare(
            "INSERT INTO schema_version (version, description) VALUES (?, ?)"
          ).run(v, f);
          console.log(`[db] Applied migration ${f}`);
        } catch (err) {
          // "duplicate column" / "already exists" → benign
          const msg = String(err);
          if (
            /duplicate column|already exists/i.test(msg)
          ) {
            console.warn(`[db] Migration ${f}: already applied, skipping`);
          } else {
            console.error(`[db] Migration ${f} failed:`, err);
            throw err;
          }
        }
      }
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

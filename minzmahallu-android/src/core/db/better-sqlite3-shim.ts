/* ============================================================================
 * `better-sqlite3` shim for the test suite.
 *
 * Some suites (document renumbering, for example) exercise a service against a
 * throw-away database they build themselves with `new Database(":memory:")`.
 * That module is a native Node addon and does not exist on Android — but the
 * engine underneath the app (sql.js) exposes the same synchronous API once it
 * has been initialised, so this class lets those tests run unchanged against
 * the REAL SQLite build the phone uses.
 *
 * Wiring: `scripts/vitest-setup.mts` awaits `prepareSqlJs()` before any suite,
 * and the vitest/tsconfig alias maps `better-sqlite3` to this file.
 * ========================================================================== */
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import { buildWrapper, type SqlDatabase } from "./sqlite.js";

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

/** Initialise the WebAssembly engine once (idempotent). */
export async function prepareSqlJs(): Promise<void> {
  if (!SQL) SQL = await initSqlJs();
}

export class Database {
  private db: SqlDatabase;

  constructor(file?: string | Uint8Array | null) {
    if (!SQL) {
      throw new Error("The SQLite engine is not ready — await prepareSqlJs() in the test setup first.");
    }
    const raw: SqlJsDatabase = typeof file === "string" || file === undefined || file === null
      ? new SQL.Database()
      : new SQL.Database(file);
    this.db = buildWrapper(raw);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string) {
    return this.db.prepare(sql);
  }

  pragma(expression: string) {
    return this.db.pragma(expression);
  }

  transaction<T extends (...args: any[]) => any>(fn: T) {
    return this.db.transaction(fn);
  }

  export(): Uint8Array {
    return this.db.export();
  }

  close(): void {
    this.db.close();
  }
}

export default Database;

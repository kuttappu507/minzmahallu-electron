/* ============================================================================
 * SQLite engine for Android — sql.js (SQLite compiled to WebAssembly).
 *
 * WHY: the desktop app's service layer is written against better-sqlite3's
 * synchronous API (`db.prepare(sql).get/all/run`, `db.exec`, `db.pragma`,
 * `db.transaction(fn)`). Android has no native Node module, so this adapter
 * re-implements exactly that surface on top of sql.js. Every service, every
 * SQL statement and every migration therefore runs on the phone unchanged —
 * including triggers, constraints and the RAISE(ABORT) guards that protect
 * official records.
 *
 * PERSISTENCE: the whole database is held in memory and mirrored to a single
 * file ("data/mms.db") through the platform file store. Writes are debounced
 * and the app flushes on every pause/background event, so a WebView kill can
 * lose at most the last few hundred milliseconds.
 * ========================================================================== */
import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface PreparedStatement {
  get(...params: unknown[]): any;
  all(...params: unknown[]): any[];
  run(...params: unknown[]): RunResult;
  iterate(...params: unknown[]): IterableIterator<any>;
}

export interface SqlDatabase {
  exec(sql: string): void;
  prepare(sql: string): PreparedStatement;
  pragma(expression: string): any[];
  transaction<T extends (...args: any[]) => any>(fn: T): (...args: Parameters<T>) => ReturnType<T>;
  close(): void;
  /** True while a BEGIN…COMMIT block is open (exports must wait for it). */
  readonly inTransaction: boolean;
  /** Raw SQLite image — used by backups and by the write-through mirror. */
  export(): Uint8Array;
}

/** better-sqlite3 refuses booleans/undefined; the service layer relies on that
 *  strictness nowhere, so we simply coerce to something SQLite understands. */
function coerce(value: unknown): SqlValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Uint8Array) return value;
  if (typeof value === "bigint") return Number(value);
  return value as SqlValue;
}

function normalizeParams(params: unknown[]): unknown[] | Record<string, unknown> {
  let args = params;
  if (args.length === 1 && Array.isArray(args[0])) args = args[0] as unknown[];
  const first = args[0];
  if (
    args.length === 1 &&
    first !== null &&
    typeof first === "object" &&
    !Array.isArray(first) &&
    !(first instanceof Uint8Array) &&
    !(first instanceof Date) &&
    !(first instanceof ArrayBuffer)
  ) {
    return first as Record<string, unknown>;
  }
  return args.map(coerce);
}

const WRITE_PATTERN = /(^|;)\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE|VACUUM|REINDEX|ANALYZE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/i;

export interface SqlDatabaseOptions {
  /** Existing database image (omitted → brand new database). */
  bytes?: Uint8Array | null;
  /** Called (throttled by the caller) whenever a statement changed data. */
  onWrite?: () => void;
}

export async function createSqlDatabase(options: SqlDatabaseOptions = {}): Promise<SqlDatabase> {
  const isNode = typeof window === "undefined";
  const SQL = await initSqlJs(
    // In a browser/WebView the wasm binary is fetched from the app bundle; in
    // Node (unit tests) sql.js resolves its own dist folder.
    isNode ? undefined : { locateFile: () => sqlWasmUrl }
  );
  const raw: SqlJsDatabase = options.bytes?.length ? new SQL.Database(options.bytes) : new SQL.Database();
  return buildWrapper(raw, options.onWrite);
}

export function buildWrapper(raw: SqlJsDatabase, onWrite?: () => void): SqlDatabase {
  const cache = new Map<string, any>();
  let depth = 0;

  const statement = (sql: string) => {
    let stmt = cache.get(sql);
    if (!stmt) {
      stmt = raw.prepare(sql);
      // Bounded cache: the app uses a few hundred distinct statements.
      if (cache.size > 400) {
        const oldest = cache.keys().next().value as string;
        try { cache.get(oldest)?.free(); } catch { /* ignore */ }
        cache.delete(oldest);
      }
      cache.set(sql, stmt);
    }
    return stmt;
  };

  const markWrite = () => onWrite?.();

  const db: SqlDatabase = {
    exec(sql: string) {
      raw.exec(sql);
      if (WRITE_PATTERN.test(sql)) markWrite();
    },

    prepare(sql: string) {
      return {
        get(...params: unknown[]) {
          const stmt = statement(sql);
          stmt.bind(normalizeParams(params) as any);
          try {
            return stmt.step() ? stmt.getAsObject() : undefined;
          } finally {
            stmt.reset();
          }
        },
        all(...params: unknown[]) {
          const stmt = statement(sql);
          stmt.bind(normalizeParams(params) as any);
          const rows: any[] = [];
          try {
            while (stmt.step()) rows.push(stmt.getAsObject());
          } finally {
            stmt.reset();
          }
          return rows;
        },
        run(...params: unknown[]): RunResult {
          const stmt = statement(sql);
          stmt.bind(normalizeParams(params) as any);
          try {
            stmt.step();
          } finally {
            stmt.reset();
          }
          const changes = Number(raw.getRowsModified() || 0);
          let lastInsertRowid = 0;
          try {
            const result = raw.exec("SELECT last_insert_rowid() AS id");
            lastInsertRowid = Number(result?.[0]?.values?.[0]?.[0] ?? 0);
          } catch { /* statement ran outside a rowid table */ }
          if (WRITE_PATTERN.test(sql)) markWrite();
          return { changes, lastInsertRowid };
        },
        *iterate(...params: unknown[]) {
          const stmt = statement(sql);
          stmt.bind(normalizeParams(params) as any);
          try {
            while (stmt.step()) yield stmt.getAsObject();
          } finally {
            stmt.reset();
          }
        },
      };
    },

    pragma(expression: string) {
      try {
        const result = raw.exec(`PRAGMA ${String(expression).replace(/^PRAGMA\s+/i, "")}`);
        if (!result.length) return [];
        const { columns, values } = result[0];
        return values.map((row) => Object.fromEntries(row.map((v, i) => [columns[i], v])));
      } catch {
        // Pragmas that sql.js/WebAssembly cannot honour (WAL, mmap, …) are
        // irrelevant to an in-memory database — never fail the caller.
        return [];
      }
    },

    transaction<T extends (...args: any[]) => any>(fn: T) {
      return (...args: Parameters<T>): ReturnType<T> => {
        const savepoint = `mms_sp_${depth}`;
        raw.exec(depth === 0 ? "BEGIN" : `SAVEPOINT ${savepoint}`);
        depth += 1;
        try {
          const result = fn(...args) as ReturnType<T>;
          depth -= 1;
          raw.exec(depth === 0 ? "COMMIT" : `RELEASE ${savepoint}`);
          markWrite();
          return result;
        } catch (err) {
          depth -= 1;
          try {
            raw.exec(depth === 0 ? "ROLLBACK" : `ROLLBACK TO ${savepoint}`);
          } catch { /* transaction already unwound */ }
          throw err;
        }
      };
    },

    get inTransaction() {
      return depth > 0;
    },

    close() {
      for (const stmt of cache.values()) {
        try { stmt.free(); } catch { /* ignore */ }
      }
      cache.clear();
      raw.close();
    },

    export() {
      // sql.js implements export() by closing and reopening the database
      // handle, which frees every prepared statement — inside a transaction
      // that would silently roll it back, so never do it mid-transaction.
      if (depth > 0) throw new Error("Cannot export the database while a transaction is open");
      for (const stmt of cache.values()) {
        try { stmt.free(); } catch { /* ignore */ }
      }
      cache.clear();
      const bytes = raw.export();
      // The reopen resets connection pragmas — foreign keys must stay enforced.
      try { raw.exec("PRAGMA foreign_keys = ON"); } catch { /* ignore */ }
      return bytes;
    },
  };

  return db;
}

/* ============================================================================
 * Bundled SQL — the schema, seed and every migration ship INSIDE the app.
 *
 * The desktop build read these files from `resources/sql` at runtime (asar).
 * Android has no such folder at runtime, so Vite inlines them at build time and
 * the database boots identically on a phone: same schema, same seed, and the
 * same ordered V*.sql migrations, so a database created by the desktop edition
 * opens unchanged on the phone (and vice versa, via backup/restore).
 * ========================================================================== */

import schemaSql from "../../../sql/schema.sql?raw";
import seedSql from "../../../sql/seed.sql?raw";

const migrationModules = import.meta.glob("../../../sql/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface SqlAssets {
  schema: string;
  seed: string;
  /** Ordered by version, exactly like the desktop loader. */
  migrations: Array<{ file: string; version: number; sql: string }>;
}

let cached: SqlAssets | null = null;

export function loadSqlAssets(): SqlAssets {
  if (cached) return cached;
  const migrations = Object.entries(migrationModules)
    .map(([path, sql]) => {
      const file = path.split("/").pop() || path;
      const match = /^V(\d+)/i.exec(file);
      return { file, version: match ? Number(match[1]) : 0, sql };
    })
    .filter((entry) => entry.version > 0)
    .sort((a, b) => a.version - b.version || a.file.localeCompare(b.file));
  cached = { schema: schemaSql, seed: seedSql, migrations };
  return cached;
}

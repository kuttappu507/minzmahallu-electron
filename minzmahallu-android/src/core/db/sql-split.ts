/* ============================================================================
 * SQL script splitter.
 *
 * WHY IT EXISTS
 * desktop used better-sqlite3, whose `exec()` walks a script statement by
 * statement. Migrations here are written for databases of ANY age: V007, for
 * example, starts with `ALTER TABLE families ADD COLUMN archived_at …` — a
 * statement that is a no-op error on a database where the column already
 * exists (the compatibility pass adds it), while the REST of the same file is
 * what creates `record_history`, `family_moves` and their indexes. If the
 * whole file is executed as one unit, that first error aborts everything and
 * later migrations (V010 builds triggers on record_history) fail.
 *
 * So migrations are applied statement by statement: a statement that only
 * complains about an already-applied change is skipped, and everything else in
 * the file still lands.
 *
 * The splitter is deliberately careful, because splitting on ";" alone would
 * cut TRIGGER bodies in half:
 *   · line (--) and block comments are removed,
 *   · single/double/backtick/bracket quoting is honoured (doubled quotes too),
 *   · a `CREATE TRIGGER … BEGIN … END;` body keeps its internal semicolons,
 *     while `CASE … END` inside the body is not mistaken for the body's end.
 * ========================================================================== */

const WORD_CHAR = /[A-Za-z0-9_$]/;
const TRIGGER_HEAD = /^\s*CREATE\s+(?:TEMP\s+|TEMPORARY\s+)?$/i;

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let buffer = "";
  let inTriggerBody = false;
  let caseDepth = 0;
  let index = 0;

  while (index < sql.length) {
    const char = sql[index];

    // -- line comment
    if (char === "-" && sql[index + 1] === "-") {
      while (index < sql.length && sql[index] !== "\n") index++;
      continue;
    }
    // /* block comment */
    if (char === "/" && sql[index + 1] === "*") {
      const end = sql.indexOf("*/", index + 2);
      index = end === -1 ? sql.length : end + 2;
      buffer += " ";
      continue;
    }
    // 'string', "identifier", `identifier` — with doubled quotes as escapes
    if (char === "'" || char === '"' || char === "`") {
      const quote = char;
      buffer += char;
      index++;
      while (index < sql.length) {
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) {
            buffer += quote + quote;
            index += 2;
            continue;
          }
          buffer += quote;
          index++;
          break;
        }
        buffer += sql[index++];
      }
      continue;
    }
    // [bracketed identifier]
    if (char === "[") {
      const end = sql.indexOf("]", index);
      const stop = end === -1 ? sql.length : end + 1;
      buffer += sql.slice(index, stop);
      index = stop;
      continue;
    }
    // keywords we must understand
    if (WORD_CHAR.test(char) && !/[0-9]/.test(char)) {
      let end = index;
      while (end < sql.length && WORD_CHAR.test(sql[end])) end++;
      const word = sql.slice(index, end).toUpperCase();
      if (word === "CASE") caseDepth += 1;
      else if (word === "END") {
        if (caseDepth > 0) caseDepth -= 1;
        else if (inTriggerBody) inTriggerBody = false;
      } else if (word === "TRIGGER" && TRIGGER_HEAD.test(buffer)) {
        inTriggerBody = true;
      }
      buffer += sql.slice(index, end);
      index = end;
      continue;
    }
    if (char === ";") {
      index++;
      if (inTriggerBody) {
        // Semicolon inside `BEGIN … END` — part of the trigger body.
        buffer += ";";
        continue;
      }
      const statement = buffer.trim();
      if (statement) statements.push(statement);
      buffer = "";
      continue;
    }
    buffer += char;
    index++;
  }

  const tail = buffer.trim();
  if (tail) statements.push(tail);
  return statements;
}

/**
 * Failures that mean "this change is already in the database" — a migration
 * replayed on top of a newer schema. Anything else must surface.
 */
export function isAlreadyAppliedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate column|already exists|duplicate index|duplicate trigger/i.test(message);
}

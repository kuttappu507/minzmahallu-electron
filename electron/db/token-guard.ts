/*
 * Date-based deletion protection for token events — DB-level enforcement.
 *
 * Policy (mirrored at the IPC layer in security-ipc.ts and in
 * data.service.ts, so the app fails with a friendly message BEFORE the
 * trigger ever fires):
 *
 *   1. A token event whose date has already passed ("event date is over")
 *      is a historical record and can NEVER be deleted — neither through
 *      the app nor through an external SQLite editor. Only events dated
 *      today or in the future can be deleted (Administrator + reason,
 *      audited).
 *   2. Tokens belonging to a past event cannot be deleted either, EXCEPT
 *      through the app's audited cleanup flow ("tokens:remove"), which
 *      sets a one-shot guard row inside the SAME transaction. The guard
 *      row never survives a commit or rollback, so an outside editor
 *      cannot use it.
 *   3. A past event's date cannot be moved to today or the future (that
 *      would be an escape route around rule 1). Past-to-past date
 *      corrections stay allowed; future events can still be edited and
 *      postponed freely.
 *
 * Everything is CREATE ... IF NOT EXISTS, so installation is idempotent
 * and runs on every boot for databases of any age (the same pattern the
 * token tables themselves use in connection.ts, and the same
 * RAISE(ABORT) guard style used for families / members / certificates /
 * audit_log since V008/V032).
 *
 * Timezone note: the triggers compare against date('now','localtime').
 * MMS is used in India only (see ist-date.ts) and the machine's local
 * timezone is IST, which matches todayIST() used by the app layer. On a
 * misconfigured machine the two could disagree around midnight — the
 * app-layer check is the friendly one; the trigger is the backstop.
 */

/** Key of the one-shot authorization row for past-event token cleanup. */
export const TOKEN_DELETE_GUARD_KEY = "allow_past_token_delete";

/** Minimal interface so this module stays free of Electron imports and
 *  is unit-testable against a plain better-sqlite3 database. */
export interface ExecutableDb {
  exec(sql: string): void;
}

export const TOKEN_DATE_GUARD_SQL = `
  -- One-shot authorization row for the audited tokens:remove flow.
  -- The app inserts it at the start of the deletion transaction and
  -- removes it before the transaction ends — it never persists.
  CREATE TABLE IF NOT EXISTS token_delete_guard (
    key TEXT PRIMARY KEY CHECK (key = '${TOKEN_DELETE_GUARD_KEY}'),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Rule 1: a past (or undated) token event can never be deleted.
  -- '' sorts before any yyyy-mm-dd date, so undated rows fail closed.
  CREATE TRIGGER IF NOT EXISTS trg_token_events_block_past_delete
  BEFORE DELETE ON token_events
  FOR EACH ROW
  WHEN COALESCE(OLD.event_date, '') < date('now', 'localtime')
  BEGIN
    SELECT RAISE(ABORT, 'Token events whose date has passed cannot be deleted — the record is history');
  END;

  -- Rule 2: tokens of a past (or undated) event cannot be deleted without
  -- the one-shot guard row (only the app's audited cleanup sets it). When
  -- a FUTURE event is deleted, the FK ON DELETE CASCADE removes its tokens
  -- after the parent row is gone, so the EXISTS probe below finds no event
  -- and allows the cascade through.
  CREATE TRIGGER IF NOT EXISTS trg_token_assignments_block_past_delete
  BEFORE DELETE ON token_assignments
  FOR EACH ROW
  WHEN NOT EXISTS (SELECT 1 FROM token_delete_guard WHERE key = '${TOKEN_DELETE_GUARD_KEY}')
    AND EXISTS (
      SELECT 1 FROM token_events e
      WHERE e.id = OLD.event_id
        AND COALESCE(e.event_date, '') < date('now', 'localtime')
    )
  BEGIN
    SELECT RAISE(ABORT, 'Tokens of an event whose date has passed cannot be deleted without authorization');
  END;

  -- Rule 3: a past event's date cannot be moved into today-or-later (the
  -- deletable zone) — that would bypass rule 1. Moving it to another past
  -- date (a correction) stays allowed.
  CREATE TRIGGER IF NOT EXISTS trg_token_events_block_date_escape
  BEFORE UPDATE OF event_date ON token_events
  FOR EACH ROW
  WHEN COALESCE(OLD.event_date, '') < date('now', 'localtime')
    AND COALESCE(NEW.event_date, '') >= date('now', 'localtime')
  BEGIN
    SELECT RAISE(ABORT, 'The date of an event that already took place cannot be moved forward');
  END;
`;

/** Install the guard table + triggers (idempotent, safe on every boot). */
export function installTokenDateGuard(database: ExecutableDb): void {
  database.exec(TOKEN_DATE_GUARD_SQL);
}

/*
 * Date-based token-event deletion protection (see db/token-guard.ts).
 *
 * Policy under test, enforced at THREE layers:
 *   1. data.tokens.removeEvent / updateEvent (friendly service errors)
 *   2. DB triggers (backstop that blocks even an external SQLite editor)
 *   3. the one-shot token_delete_guard row that lets the app's audited
 *      "delete token after the event" cleanup flow through rule 2
 *
 * Event dates are seeded relative to today so the suite never goes stale:
 * istPlusDays(-30) is safely "past" in both IST and the test machine's
 * local timezone, and istPlusDays(+7) is safely "future".
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDB } from "../db/connection.js";
import { tokens, families } from "./data.service.js";
import { todayIST, istPlusDays } from "./ist-date.js";
import { TOKEN_DELETE_GUARD_KEY, installTokenDateGuard } from "../db/token-guard.js";

const ACTOR = { id: 1, username: "vitest" };

function makeEvent(name: string, date: string) {
  return tokens.createEvent({
    eventName: name, eventType: "general", eventDate: date,
    eventTime: "10:00", venue: "Test Hall", description: "",
  });
}

let familyId = 0;

beforeAll(() => {
  getDB(); // schema + migrations + token date-guard triggers (throwaway DB)
  const fam = families.create({ houseName: "Token Date Guard Test Family" });
  familyId = Number(fam.id);
});

describe("token events — deletion is date-locked (service layer)", () => {
  it("a future event with tokens is deleted (tokens cascade) and audited", () => {
    const ev = makeEvent("Guard Future Event", istPlusDays(7));
    tokens.generate(ev.id, [familyId], ACTOR.id);
    const result = tokens.removeEvent(ev.id, "created by mistake (test)", ACTOR) as any;
    expect(result.success).toBe(true);
    expect(result.deletedTokens).toBe(1);
    expect(tokens.getEvent(ev.id)).toBeUndefined();
    expect(getDB().prepare("SELECT COUNT(*) AS c FROM token_assignments WHERE event_id = ?").get(ev.id)).toMatchObject({ c: 0 });
    const auditRow = getDB()
      .prepare("SELECT id FROM audit_log WHERE module = 'token_events' AND entity_id = ? AND action = 'DELETE'")
      .get(ev.id);
    expect(auditRow).toBeTruthy();
  });

  it("an event dated TODAY is still deletable (the date must be over to lock)", () => {
    const ev = makeEvent("Guard Today Event", todayIST());
    const result = tokens.removeEvent(ev.id, "boundary check (test)", ACTOR) as any;
    expect(result.success).toBe(true);
    expect(result.deletedTokens).toBe(0);
  });

  it("a past event is refused with the friendly 'already passed' error", () => {
    const ev = makeEvent("Guard Past Event", istPlusDays(-30));
    expect(() => tokens.removeEvent(ev.id, "cleanup attempt (test)", ACTOR)).toThrow(/already passed/);
  });

  it("a missing reason is refused even for a future event", () => {
    const ev = makeEvent("Guard No-Reason Event", istPlusDays(7));
    expect(() => tokens.removeEvent(ev.id, "   ", ACTOR)).toThrow(/reason is required/);
  });
});

describe("token events — deletion is date-locked (DB triggers)", () => {
  it("a raw DELETE on a past event is blocked by the trigger", () => {
    const ev = makeEvent("Guard Raw Delete Event", istPlusDays(-15));
    expect(() => getDB().prepare("DELETE FROM token_events WHERE id = ?").run(ev.id)).toThrow(/cannot be deleted/);
    expect(tokens.getEvent(ev.id)).toBeTruthy();
  });

  it("a raw DELETE of a past event's token is blocked without the guard row", () => {
    const ev = makeEvent("Guard Raw Token Event", istPlusDays(-10));
    tokens.generate(ev.id, [familyId], ACTOR.id);
    const tok = getDB().prepare("SELECT id FROM token_assignments WHERE event_id = ?").get(ev.id) as { id: number };
    expect(() => getDB().prepare("DELETE FROM token_assignments WHERE id = ?").run(tok.id)).toThrow(/without authorization/);
    expect(getDB().prepare("SELECT COUNT(*) AS c FROM token_assignments WHERE id = ?").get(tok.id)).toMatchObject({ c: 1 });
  });

  it("the one-shot guard row lets the audited cleanup path through — and never persists", () => {
    const ev = makeEvent("Guard Cleanup Event", istPlusDays(-10));
    tokens.generate(ev.id, [familyId], ACTOR.id);
    const tok = getDB().prepare("SELECT id FROM token_assignments WHERE event_id = ?").get(ev.id) as { id: number };
    const db = getDB();
    db.transaction(() => {
      db.prepare("INSERT OR REPLACE INTO token_delete_guard (key) VALUES (?)").run(TOKEN_DELETE_GUARD_KEY);
      db.prepare("DELETE FROM token_assignments WHERE id = ?").run(tok.id);
      db.prepare("DELETE FROM token_delete_guard WHERE key = ?").run(TOKEN_DELETE_GUARD_KEY);
    })();
    expect(getDB().prepare("SELECT COUNT(*) AS c FROM token_assignments WHERE id = ?").get(tok.id)).toMatchObject({ c: 0 });
    expect(getDB().prepare("SELECT COUNT(*) AS c FROM token_delete_guard").get()).toMatchObject({ c: 0 });
  });

  it("installTokenDateGuard is idempotent (re-running never throws)", () => {
    expect(() => installTokenDateGuard(getDB() as any)).not.toThrow();
  });
});

describe("token events — the date-escape route is closed", () => {
  it("updateEvent refuses to move a past event's date to today/future", () => {
    const ev = makeEvent("Guard Escape Event", istPlusDays(-20));
    expect(() =>
      tokens.updateEvent(ev.id, {
        eventName: "Guard Escape Event", eventType: "general", eventDate: istPlusDays(5),
        eventTime: "10:00", venue: "Test Hall", description: "",
      })
    ).toThrow(/can no longer be moved/);
  });

  it("the DB trigger blocks the same move even for a raw UPDATE", () => {
    const ev = makeEvent("Guard Escape Raw Event", istPlusDays(-20));
    expect(() =>
      getDB().prepare("UPDATE token_events SET event_date = ? WHERE id = ?").run(istPlusDays(1), ev.id)
    ).toThrow(/cannot be moved forward/);
  });

  it("past-to-past date corrections stay allowed", () => {
    const ev = makeEvent("Guard Correction Event", istPlusDays(-20));
    expect(() =>
      tokens.updateEvent(ev.id, {
        eventName: "Guard Correction Event", eventType: "general", eventDate: istPlusDays(-21),
        eventTime: "11:00", venue: "Corrected Hall", description: "",
      })
    ).not.toThrow();
    expect((tokens.getEvent(ev.id) as any).event_date).toBe(istPlusDays(-21));
  });

  it("a future event can still be edited and postponed", () => {
    const ev = makeEvent("Guard Postpone Event", istPlusDays(3));
    expect(() =>
      tokens.updateEvent(ev.id, {
        eventName: "Guard Postpone Event", eventType: "eid", eventDate: istPlusDays(10),
        eventTime: "09:00", venue: "Bigger Hall", description: "postponed",
      })
    ).not.toThrow();
    expect((tokens.getEvent(ev.id) as any).event_date).toBe(istPlusDays(10));
  });
});

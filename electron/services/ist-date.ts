/*
 * Indian Standard Time date helpers — MMS is used in India ONLY, so every
 * calendar date is fixed to Asia/Kolkata regardless of the machine's
 * timezone. Never UTC (`toISOString()`), never machine-local
 * (`getTimezoneOffset()`) — both shift the date by a day for a machine on
 * UTC or another zone between 00:00–05:30 IST.
 * Pure functions, no DB/Electron imports — unit-testable.
 */

function istParts(d: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return map;
}

/** Format a Date as yyyy-mm-dd in Indian Standard Time. */
export function istDateStr(d: Date): string {
  const p = istParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Today's date (yyyy-mm-dd) in Indian Standard Time. */
export function todayIST(): string {
  return istDateStr(new Date());
}

/** Current year-month (yyyy-mm) in Indian Standard Time. */
export function istMonth(): string {
  return todayIST().slice(0, 7);
}

/** todayIST() plus N days (pure calendar arithmetic — no timezone involved). */
export function istPlusDays(days: number): string {
  const ymd = todayIST();
  const d = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)) + days));
  return d.toISOString().slice(0, 10);
}

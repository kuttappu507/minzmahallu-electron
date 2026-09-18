import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Currency symbol store — Settings → Currency Symbol drives EVERY amount in
// the UI. The symbol is set once at app start (from settings.load) and again
// whenever Settings are saved, so formatCurrency() everywhere follows the
// configured value instead of a hardcoded "₹".
let CURRENCY_SYMBOL = "₹";
export function setCurrencySymbol(symbol: string | null | undefined): void {
  const v = String(symbol ?? "").trim();
  if (v) CURRENCY_SYMBOL = v;
}
export function getCurrencySymbol(): string {
  return CURRENCY_SYMBOL;
}
export function formatCurrency(amount: number): string {
  return CURRENCY_SYMBOL + Number(amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

/* -----------------------------------------------------------------------
 * Indian Standard Time display helpers — the mahallu offices run in India
 * only, so EVERY date/time the user reads is pinned to Asia/Kolkata,
 * regardless of the machine's clock zone.
 *
 * Parsing rules (matching how the DB actually writes values):
 *   - "yyyy-mm-dd"                       → a BUSINESS date entered by the
 *     office (payment date, birth date…). Shown as-is — zone math must
 *     never shift it.
 *   - "yyyy-mm-dd HH:MM:SS" (SQLite      → written by `datetime('now')`,
 *     `datetime('now')`, no zone)          which is UTC. Parsed as UTC and
 *                                          rendered in IST, so the audit
 *                                          log etc. show the real Indian
 *                                          time on ANY machine (they used
 *                                          to show raw UTC — user report:
 *                                          "time shown in app is not
 *                                          correct").
 *   - ISO strings with Z/offset, Date,   → parsed natively, rendered in
 *     epoch numbers                        IST.
 * ----------------------------------------------------------------------- */
const IST_TZ = "Asia/Kolkata";

function parseDateValue(date: string | number | Date): Date | null {
  if (date instanceof Date) return isNaN(date.getTime()) ? null : date;
  if (typeof date === "number") {
    const d = new Date(date);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(date ?? "").trim();
  if (!s) return null;
  // SQLite naive "yyyy-mm-dd[ HH:MM[:SS[.sss]]]" — UTC when it has a time,
  // a plain calendar date when it has not.
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?$/);
  if (m) {
    const d = new Date(m[2] ? `${m[1]}T${m[2]}Z` : `${m[1]}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function istParts(date: string | number | Date, opts: Intl.DateTimeFormatOptions): Record<string, string> | null {
  const d = parseDateValue(date);
  if (!d) return null;
  try {
    const map: Record<string, string> = {};
    for (const p of new Intl.DateTimeFormat("en-GB", { timeZone: IST_TZ, ...opts }).formatToParts(d)) {
      map[p.type] = p.value;
    }
    return map;
  } catch {
    return null;
  }
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  const p = istParts(date, { day: "2-digit", month: "2-digit", year: "numeric" });
  if (p === null) return String(date);
  return `${p.day}-${p.month}-${p.year}`;
}

/** Today's date (yyyy-mm-dd) in INDIAN time (Asia/Kolkata) — the app is
 * used in India only, so a machine set to another zone must still record the
 * date the office sees. Never UTC, never the machine's local zone. */
export function todayIST(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return "—";
  const p = istParts(date, {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  if (p === null) return String(date);
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
}

/** "HH:MM" in Indian Standard Time — dashboard recent-activity stamps. */
export function formatTimeIST(date: string | null | undefined): string {
  if (!date) return "—";
  const p = istParts(date, { hour: "2-digit", minute: "2-digit", hour12: false });
  return p === null ? String(date) : `${p.hour}:${p.minute}`;
}

export function statusVariant(status: string): "active" | "inactive" | "overdue" | "paid" | "pending" | "partial" {
  const s = status?.toLowerCase() ?? "";
  if (s === "paid" || s === "active" || s === "approved" || s === "disbursed") return "active";
  if (s === "pending") return "pending";
  if (s === "overdue") return "overdue";
  if (s === "partial") return "partial";
  if (s === "inactive" || s === "rejected" || s === "archived") return "inactive";
  return "pending";
}

/** Auto-capitalization: upper-case the first letter of every word (Latin
 *  letters only — Malayalam text is untouched). Used as an onBlur helper on
 *  name/title inputs so "muhammed ali" becomes "Muhammed Ali". */
export function capitalizeWords(input: string): string {
  const s = String(input ?? "");
  if (!s) return s;
  return s.replace(/(^|[\s\-.'()])([a-z])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
}

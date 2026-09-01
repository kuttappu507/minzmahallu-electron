/*
 * Unified document numbering — one short, unique, auditable scheme for every
 * receipt and certificate the mahallu issues:
 *
 *     Receipt:      PREFIX / YYYY / MM / NNN           e.g.  MM/2026/09/001
 *     Certificate:  PREFIX / CODE / YYYY / MM / NNN    e.g.  MM/DT/2026/09/001
 *
 *   PREFIX  1–5 capital letters identifying THE MAHALLU — the "Numbering
 *     Prefix" field in Settings. When it is blank or still the legacy
 *     placeholder "RCP", the INITIALS OF THE MAHALLU NAME are used
 *     ("Minz Mahallu" → MM). Because the mahallu's letters lead EVERY
 *     number — receipts AND certificates — two mahallus running this app
 *     can never issue the same number to two different people.
 *   CODE    certificate type only: DT (death), MB (membership), RS
 *     (residence), MR (marriage), NOC (no-objection) — keeps certificate
 *     kinds in separate series. Receipts share ONE series (donations +
 *     subscription payments — the same money book), so they carry no code.
 *   YYYY/MM the document's OWN date in IST — a backdated receipt is numbered
 *     inside its own month.
 *   NNN     zero-padded 3-digit sequence restarting each month; it simply
 *     grows to 4+ digits past 999 without renumbering anything.
 *
 * Numbers are allocated by scanning the live rows (no counter table), so a
 * deleted row never causes a duplicate and a restored backup keeps working.
 * better-sqlite3 serves one synchronous connection, so read-max → INSERT is
 * atomic within the app process.
 *
 * Records created before this scheme keep their legacy numbers (issued
 * receipts are never renumbered); a legacy row whose number is blank gets
 * one the first time its receipt is generated, printed or sent
 * (ensureDonationReceiptNumber / ensureSubscriptionReceiptNumber).
 */
import { getDB } from "../db/connection.js";
import { todayIST } from "./ist-date.js";

/** Certificate type → number code. Death certificates use "DT" per the
 *  mahallu's request; every other type gets its own short code. The code
 *  rides AFTER the mahallu prefix (MM/DT/…), never instead of it. */
export const CERT_TYPE_CODES: Record<string, string> = {
  Death: "DT",
  Membership: "MB",
  Residence: "RS",
  Marriage: "MR",
  NOC: "NOC",
};

/** A–Z only, at most 5 letters — safe for SQL LIKE (no wildcards) and for
 *  file names after fileNameSafe(). Non-Latin input (e.g. Malayalam) yields
 *  the fallback, since receipt numbers print in Latin digits/letters. */
export function sanitizePrefix(raw: string | null | undefined, fallback: string): string {
  const letters = String(raw || "").toUpperCase().replace(/[^A-Z]/g, "");
  return letters ? letters.slice(0, 5) : fallback;
}

/** Initials of the mahallu name — "Minz Mahallu" → MM, "Kunnoth P O" → KPO.
 *  A single-word name uses its first 3 letters. Malayalam-only names yield
 *  "" (the caller then falls back to a generic prefix). */
export function mahalluInitials(name: string | null | undefined): string {
  const words = String(name || "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";
  if (words.length === 1) return words[0].slice(0, 3);
  return words.slice(0, 4).map((w) => w[0]).join("");
}

/** yyyy + mm from a stored date (yyyy-mm-dd…); unparseable/empty values fall
 *  back to today in IST so a number is always emitted. */
function yearMonthOf(dateStr: string | null | undefined): { y: string; m: string } {
  const match = String(dateStr || "").match(/^(\d{4})-(\d{2})/);
  if (match) return { y: match[1], m: match[2] };
  const today = todayIST();
  return { y: today.slice(0, 4), m: today.slice(5, 7) };
}

/** Highest sequence already used with `prefix/yyyy/mm/` among `numbers`.
 *  Legacy formats (DON-003, RCP-0001, MMS-2026-…) never match the head, so
 *  old data can never collide with or inflate the new series. */
export function maxSeriesUsed(numbers: string[], prefix: string, y: string, m: string): number {
  const head = `${prefix}/${y}/${m}/`;
  let max = 0;
  for (const n of numbers) {
    if (!n || !String(n).startsWith(head)) continue;
    const tail = Number(String(n).slice(head.length));
    if (Number.isFinite(tail) && tail > max) max = tail;
  }
  return max;
}

export function formatDocNumber(prefix: string, y: string, m: string, n: number): string {
  return `${prefix}/${y}/${m}/${String(n).padStart(3, "0")}`;
}

/** Receipt numbers contain "/" — make them file-name safe for saved PDFs and
 *  WhatsApp document names (MMH/2026/09/001 → MMH-2026-09-001). */
export function fileNameSafe(n: string | number): string {
  return String(n).replace(/[^A-Za-z0-9._-]/g, "-");
}

// ---------------------------------------------------------------------------
// DB-backed allocation
// ---------------------------------------------------------------------------
function columnValues(table: string, column: string): string[] {
  try {
    return (getDB()
      .prepare(`SELECT ${column} AS v FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != ''`)
      .all() as Array<{ v: string }>).map((r) => String(r.v));
  } catch {
    return []; // table/column missing on a very old database — treat as empty
  }
}

/** The mahallu's own letters — lead EVERY receipt AND certificate number.
 *  Reads the "Numbering Prefix" setting; blank or legacy "RCP" falls back
 *  to the initials of the mahallu name. */
function mahalluPrefix(): string {
  try {
    const row = getDB().prepare("SELECT receipt_prefix, mahallu_name FROM settings WHERE id = 1").get() as
      | { receipt_prefix?: string; mahallu_name?: string }
      | undefined;
    const stored = String(row?.receipt_prefix || "").trim().toUpperCase();
    // "RCP" is the legacy placeholder default shipped before this scheme —
    // treat it as "not chosen yet" and use the mahallu's own initials.
    if (stored && stored !== "RCP") return sanitizePrefix(stored, "RC");
    const initials = sanitizePrefix(mahalluInitials(row?.mahallu_name), "");
    if (initials) return initials;
  } catch {
    /* settings unavailable (odd DB orders) — generic prefix */
  }
  return "RC";
}

/** Next receipt number for a document dated `dateStr`. ONE series is shared
 *  by donations and subscription payments — both are money receipts from the
 *  same book — and the scan covers the legacy subscriptions mirror so the
 *  series can never produce a duplicate. */
export function nextReceiptNumber(dateStr?: string | null): string {
  const { y, m } = yearMonthOf(dateStr);
  const prefix = mahalluPrefix();
  const used = [
    ...columnValues("donations", "receipt_number"),
    ...columnValues("subscription_payments", "receipt_number"),
    ...columnValues("subscriptions", "receipt_number"),
  ];
  return formatDocNumber(prefix, y, m, maxSeriesUsed(used, prefix, y, m) + 1);
}

/** Next certificate number — MAHALLU/CODE/YYYY/MM/NNN. The mahallu's own
 *  letters lead the number (same letters the receipts carry), so mahallus
 *  using this app never issue duplicate certificate numbers; the type code
 *  after the prefix keeps certificate kinds in separate series. */
export function nextCertificateNumber(type: string, dateStr?: string | null): string {
  const { y, m } = yearMonthOf(dateStr);
  const prefix = `${mahalluPrefix()}/${CERT_TYPE_CODES[type] || "CRT"}`;
  const used = columnValues("certificates", "certificate_number");
  return formatDocNumber(prefix, y, m, maxSeriesUsed(used, prefix, y, m) + 1);
}

// ---------------------------------------------------------------------------
// Backfill — legacy rows with a blank number get one the moment their
// receipt is generated / printed / sent (a receipt leaving the app must
// always carry a number). Issued numbers are never changed.
// ---------------------------------------------------------------------------
export function ensureDonationReceiptNumber(donationId: number, dateStr?: string | null): string {
  const row = getDB().prepare("SELECT receipt_number FROM donations WHERE id = ?").get(donationId) as
    | { receipt_number?: string }
    | undefined;
  const current = String(row?.receipt_number || "").trim();
  if (current) return current;
  const number = nextReceiptNumber(dateStr);
  getDB().prepare("UPDATE donations SET receipt_number = ? WHERE id = ?").run(number, donationId);
  return number;
}

/** Backfill a subscription-side row (ledger payment, or the legacy
 *  subscription mirror for accounts whose payment predates the ledger). */
export function ensureSubscriptionReceiptNumber(
  source: { table: "subscription_payments" | "subscriptions"; id: number; receiptNumber: string | null },
  dateStr?: string | null
): string {
  const current = String(source.receiptNumber || "").trim();
  if (current) return current;
  const number = nextReceiptNumber(dateStr);
  getDB().prepare(`UPDATE ${source.table} SET receipt_number = ? WHERE id = ?`).run(number, source.id);
  return number;
}

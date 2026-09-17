import type { useI18n } from "@/i18n";

/**
 * Money-amount validation shared by every module that stores an amount
 * (Donations, Accounting, Welfare, Staff salary/pay).
 *
 * WHY THIS EXISTS (hostile-user sweep, round 2): no layer validated amounts.
 * `type="number"` inputs happily submit negatives (`!(-500)` is falsy so the
 * existing required-checks passed them through) and absurd magnitudes; the
 * services wrote them straight to SQLite and every dashboard total silently
 * absorbed them. Validation now happens client-side with a localized message
 * before any IPC call.
 */

/** Hard ceiling: 9,99,99,999 — no legitimate mahallu transaction is larger,
 *  and it keeps Indian-locale grouping and PDF layouts sane. */
export const MAX_AMOUNT = 99_999_999;

type Translate = (key: string) => string;

/** Returns null when the amount is usable, otherwise a localized error. */
export function amountError(raw: unknown, t: Translate): string | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return t("amount_invalid");
  if (n > MAX_AMOUNT) return t("amount_too_large");
  return null;
}

/** Variant for fields where 0 is legitimate (e.g. volunteer staff salary):
 *  rejects only negative / non-finite / over-ceiling values. */
export function nonNegativeAmountError(raw: unknown, t: Translate): string | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return t("amount_negative");
  if (n > MAX_AMOUNT) return t("amount_too_large");
  return null;
}

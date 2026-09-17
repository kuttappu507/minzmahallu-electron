/**
 * Paste-safe phone clamping for Indian (10-digit) mobile numbers.
 *
 * WHY THIS EXISTS (hostile-user sweep, round 2): every phone field used to
 * clamp with `value.replace(/\D/g, "").slice(0, 10)`. A user pasting a number
 * copied from contacts/WhatsApp — "+91 98470 12345" or "098470 12345" — got
 * it SILENTLY CORRUPTED to "9198470123" (the 91/0 prefix eats the tail of the
 * real number). Nobody notices at save time; WhatsApp sends then fail or,
 * worse, reach the wrong person. We strip recognised prefixes first and only
 * then take 10 digits.
 */
export function clampPhone10(value: string): string {
  let d = String(value ?? "").replace(/\D/g, "");
  if (d.length > 10) {
    // "+91 98470 12345" -> "919847012345" -> strip 91 -> "9847012345"
    if (d.startsWith("91") && d.length - 2 >= 10) d = d.slice(2);
    // "098470 12345" -> "09847012345" -> strip leading zeros -> "9847012345"
    else if (d.startsWith("0")) d = d.replace(/^0+/, "");
  }
  return d.slice(0, 10);
}

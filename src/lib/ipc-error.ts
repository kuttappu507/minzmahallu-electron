import { stripIpcWrapper } from "./pwd";
import type { useI18n } from "@/i18n";

/**
 * Friendly, LOCALIZED text for runtime (non-auth) IPC failures on hot paths —
 * currently the WhatsApp receipt/message sends.
 *
 * WHY THIS EXISTS (hostile-user sweep, round 2): when WhatsApp is not paired,
 * sendDonationReceipt/sendSubscriptionReceipt reject and the catch sites
 * toasted Electron's raw wrapper
 *   "Error invoking remote method 'whatsapp:sendDonationReceipt': Error: WhatsApp is not connected yet. …"
 * The preload now strips the wrapper globally (see electron/preload.mts);
 * this helper additionally maps the KNOWN runtime guidance messages onto
 * bilingual i18n keys so Malayalam users get Malayalam, matching the
 * friendlyAuthError pattern from the password round.
 */

type Translate = (key: string) => string;

const RUNTIME_MESSAGE_MAP: Array<{ match: RegExp; key: string }> = [
  { match: /not connected yet|not paired yet|not connected\b/i, key: "wa_not_connected" },
  { match: /no internet/i, key: "wa_no_internet" },
  { match: /QR code is not available/i, key: "wa_not_connected" },
  // Approval workflow (V037): receipts/payments blocked for PENDING entries —
  // thrown by receipt.service, certificates.service and subscriptions.service
  // with the stable phrase "WAITING FOR ADMIN APPROVAL".
  { match: /waiting for admin approval|pending approval|approval page/i, key: "appr_receipt_blocked" },
];

/** Turn a thrown send error into clean, localized guidance. Unknown errors
 *  fall back to the stripped raw text (never the Electron wrapper). */
export function friendlySendError(err: unknown, t: Translate): string {
  const raw =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : (err as any)?.error || (err as any)?.message || "";
  const cleaned = stripIpcWrapper(String(raw || ""));
  if (!cleaned) return t("wa_send_failed");
  for (const { match, key } of RUNTIME_MESSAGE_MAP) {
    if (match.test(cleaned)) {
      const localized = t(key);
      if (localized && localized !== key) return localized;
    }
  }
  return cleaned;
}

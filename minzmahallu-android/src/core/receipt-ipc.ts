/*
 * Receipt API — A6 receipts for donations and subscription payments:
 * generate (stored in the app database), share a single A6 PDF, or share many
 * receipts as one A4 PDF (4 per sheet with cut guides).
 *
 * On the desktop these handlers opened a "Save PDF…" dialog; on Android the
 * platform share sheet takes the file the rest of the way (WhatsApp, Drive,
 * Files, a printer). Auth-gated like every other handler.
 */
import {
  getDonationPdf, getSubscriptionPdf,
  saveDonationPdf, saveSubscriptionPdf,
  saveDonationBatchPdf, saveSubscriptionBatchPdf,
} from "./services/receipt.service.js";
import type { Actor } from "./services/security.service.js";
import type { IpcRegistrar } from "../bridge/registry.js";

export function registerReceiptIpc(register: IpcRegistrar, getActor: () => Actor | null) {
  const requireAuth = () => {
    const actor = getActor();
    if (!actor) throw new Error("Authentication is required");
    return actor;
  };

  // Generation + in-app storage (no UI — also used by automated checks).
  register("receipts:getDonationPdf", (id: number) => { requireAuth(); return getDonationPdf(id); });
  register("receipts:getSubscriptionPdf", (subscriptionId: number) => { requireAuth(); return getSubscriptionPdf(subscriptionId); });

  // Share a single A6 receipt PDF.
  register("receipts:saveDonationPdf", (id: number) => { requireAuth(); return saveDonationPdf(id); });
  register("receipts:saveSubscriptionPdf", (subscriptionId: number) => { requireAuth(); return saveSubscriptionPdf(subscriptionId); });

  // Share MANY receipts as one A4 PDF — 4 per sheet with cut guides.
  register("receipts:saveDonationBatchPdf", (ids: number[]) => { requireAuth(); return saveDonationBatchPdf(ids || []); });
  register("receipts:saveSubscriptionBatchPdf", (subscriptionIds: number[]) => { requireAuth(); return saveSubscriptionBatchPdf(subscriptionIds || []); });
}

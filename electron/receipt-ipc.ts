/*
 * Receipt IPC — A6 receipts for donations and subscription payments:
 * generate (saved in the app DB), save to file, print single (A6) and
 * print in 4-per-A4 sheets. Auth-gated like every other handler.
 */
import { ipcMain } from "electron";
import {
  getDonationPdf, getSubscriptionPdf,
  saveDonationPdf, saveSubscriptionPdf,
  printDonation, printSubscription,
  printDonationBatch, printSubscriptionBatch,
} from "./services/receipt.service.js";
import type { Actor } from "./services/security.service.js";

export function registerReceiptIpc(getActor: () => Actor | null, getWindow: () => Electron.BrowserWindow | null) {
  const register = (name: string, handler: (...args: any[]) => any) => {
    try { ipcMain.removeHandler(name); } catch {}
    ipcMain.handle(name, async (_event, ...args) => handler(...args));
  };
  const requireAuth = () => {
    const actor = getActor();
    if (!actor) throw new Error("Authentication is required");
    return actor;
  };

  // Generation + in-app storage (no dialogs — also used by automated checks).
  register("receipts:getDonationPdf", (id: number) => { requireAuth(); return getDonationPdf(id); });
  register("receipts:getSubscriptionPdf", (subscriptionId: number) => { requireAuth(); return getSubscriptionPdf(subscriptionId); });

  // Save a copy to disk (dialog).
  register("receipts:saveDonationPdf", (id: number) => { requireAuth(); return saveDonationPdf(id, getWindow()); });
  register("receipts:saveSubscriptionPdf", (subscriptionId: number) => { requireAuth(); return saveSubscriptionPdf(subscriptionId, getWindow()); });

  // Printing: one receipt on A6, or many receipts 4-per-A4 sheet.
  register("receipts:printDonation", (id: number) => { requireAuth(); return printDonation(id); });
  register("receipts:printSubscription", (subscriptionId: number) => { requireAuth(); return printSubscription(subscriptionId); });
  register("receipts:printDonationBatch", (ids: number[]) => { requireAuth(); return printDonationBatch(ids || []); });
  register("receipts:printSubscriptionBatch", (subscriptionIds: number[]) => { requireAuth(); return printSubscriptionBatch(subscriptionIds || []); });
}

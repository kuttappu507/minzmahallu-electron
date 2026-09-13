import { whatsapp } from "./services/whatsapp.service.js";
import { recipientStats } from "./services/whatsapp-recipient.service.js";
import type { Actor } from "./services/security.service.js";
import type { IpcRegistrar } from "../bridge/registry.js";

/*
 * WhatsApp API — auth-gated exactly like the rest of the app, so every
 * whatsapp:* call fails closed when nobody is signed in.
 *
 * Android transport note: sending happens through the WhatsApp app on this
 * phone (click-to-chat links and the share sheet) instead of a bundled
 * WhatsApp-Web engine — see whatsapp.service.ts for why. The handlers,
 * counters, campaign queues and the receipt privacy lock are unchanged.
 */
let registered = false;

export function registerWhatsAppIpc(register: IpcRegistrar, getActor: () => Actor | null) {
  if (registered) return;
  registered = true;
  whatsapp.init();

  const actor = (): Actor => {
    const current = getActor();
    if (current) return current;
    const authActor = (globalThis as any).__mmsGetActor?.() as Actor | null | undefined;
    if (authActor) return authActor;
    throw new Error("Authentication is required for this operation");
  };
  const requireAuth = () => actor();

  register("whatsapp:status", () => { requireAuth(); return whatsapp.status(); });
  register("whatsapp:connect", () => { requireAuth(); return whatsapp.connect(); });
  register("whatsapp:qr", () => { requireAuth(); return whatsapp.qr(); });
  // PAUSE the engine — the paired device stays linked on the phone, so
  // Connect resumes without a new QR scan.
  register("whatsapp:disconnect", () => { requireAuth(); return whatsapp.disconnect(); });
  // Full unlink — removes the device from the phone's Linked Devices and
  // wipes stored credentials. Only for an explicit "Unlink phone" action.
  register("whatsapp:unlink", () => { requireAuth(); return whatsapp.unlink(); });
  // `register` (above) already strips the Electron IPC event from the
  // argument list (`handler(...args)`), so the handlers below receive the
  // renderer's arguments DIRECTLY — no leading `_event` parameter. The earlier
  // phantom `_e` first parameter silently swallowed the first real argument
  // (donationId arrived as undefined → "Donation not found", announcement
  // text arrived as undefined → "cannot be empty", campaign ids likewise).
  register("whatsapp:checkNumber", (phone: string) => { requireAuth(); return whatsapp.checkNumber(phone); });
  register("whatsapp:setFamily", (familyId: number, phone: string, enabled: boolean) => { requireAuth(); return whatsapp.setFamilyWhatsApp(familyId, phone, enabled); });
  register("whatsapp:getFamily", (familyId: number) => { requireAuth(); return whatsapp.familyWhatsApp(familyId); });
  register("whatsapp:sendMessage", (input: any) => { requireAuth(); return whatsapp.sendMessage(input); });
  // Receipt sends carry the PRIVACY LOCK: a delivered receipt is locked; the
  // one admin-authorized re-send needs the administrator's password, which is
  // verified in the MAIN process (whatsapp.service.gateReceiptSend) — the
  // renderer's promise alone is never enough.
  register("whatsapp:sendDonationReceipt", (donationId: number, adminPassword?: string) => { requireAuth(); return whatsapp.sendDonationReceipt(donationId, { adminPassword }); });
  register("whatsapp:sendSubscriptionReceipt", (subscriptionId: number, adminPassword?: string) => { requireAuth(); return whatsapp.sendSubscriptionReceipt(subscriptionId, { adminPassword }); });
  register("whatsapp:recipientStats", (type: "ANNOUNCEMENT" | "SUBSCRIPTION_REMINDER") => { requireAuth(); return recipientStats(type); });
  register("whatsapp:createSubscriptionCampaign", () => { requireAuth(); return whatsapp.createSubscriptionCampaign(); });
  register("whatsapp:createAnnouncementCampaign", (text: string) => { requireAuth(); return whatsapp.createAnnouncementCampaign(text); });
  register("whatsapp:runCampaign", (id: number) => { requireAuth(); return whatsapp.runCampaign(id); });
  register("whatsapp:getCampaign", (id: number) => { requireAuth(); return whatsapp.campaign(id); });
  register("whatsapp:listCampaigns", (limit?: number) => { requireAuth(); return whatsapp.campaigns(limit || 30); });
  register("whatsapp:listHistory", (limit?: number) => { requireAuth(); return whatsapp.history(limit || 100); });
  register("whatsapp:retryFailed", (id: number) => { requireAuth(); return whatsapp.retryFailed(id); });
  register("whatsapp:runtimeState", () => { requireAuth(); return whatsapp.runtimeState(); });

  // Nothing to start on Android: WhatsApp is an app on the same phone.
}

export { registerWhatsAppIpc as registerWhatsappIpc };

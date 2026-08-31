import { app, ipcMain } from "electron";
import { whatsapp } from "./services/whatsapp.service.js";
import { recipientStats } from "./services/whatsapp-recipient.service.js";
import { startWaha, stopWaha } from "./services/waha-runtime.service.js";
import type { Actor } from "./services/security.service.js";

// WhatsApp IPC — auth-gated exactly like the rest of the app. The actor
// provider is wired from main.ts (the logged-in session), so every
// whatsapp:* handler fails closed when nobody is signed in.
let registered = false;

export function registerWhatsAppIpc(getActor: () => Actor | null) {
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

  const register = (name: string, handler: (...args: any[]) => any) => {
    try { ipcMain.removeHandler(name); } catch {}
    ipcMain.handle(name, async (_event, ...args) => handler(...args));
  };

  // Clear the auth hook used by the main-process services on logout so a
  // walked-away workstation cannot keep using the WhatsApp API.
  register("whatsapp:invalidateAuth", () => {
    (globalThis as any).__mmsClearActor?.();
    return { success: true };
  });
  register("whatsapp:status", () => { requireAuth(); return whatsapp.status(); });
  register("whatsapp:connect", () => { requireAuth(); return whatsapp.connect(); });
  register("whatsapp:qr", () => { requireAuth(); return whatsapp.qr(); });
  register("whatsapp:disconnect", () => { requireAuth(); return whatsapp.disconnect(); });
  register("whatsapp:checkNumber", (_e: unknown, phone: string) => { requireAuth(); return whatsapp.checkNumber(phone); });
  register("whatsapp:setFamily", (_e: unknown, familyId: number, phone: string, enabled: boolean) => { requireAuth(); return whatsapp.setFamilyWhatsApp(familyId, phone, enabled); });
  register("whatsapp:getFamily", (_e: unknown, familyId: number) => { requireAuth(); return whatsapp.familyWhatsApp(familyId); });
  register("whatsapp:sendMessage", (_e: unknown, input: any) => { requireAuth(); return whatsapp.sendMessage(input); });
  register("whatsapp:sendDonationReceipt", (_e: unknown, donationId: number) => { requireAuth(); return whatsapp.sendDonationReceipt(donationId); });
  register("whatsapp:recipientStats", (_e: unknown, type: "ANNOUNCEMENT" | "SUBSCRIPTION_REMINDER") => { requireAuth(); return recipientStats(type); });
  register("whatsapp:createSubscriptionCampaign", () => { requireAuth(); return whatsapp.createSubscriptionCampaign(); });
  register("whatsapp:createAnnouncementCampaign", (_e: unknown, text: string) => { requireAuth(); return whatsapp.createAnnouncementCampaign(text); });
  register("whatsapp:runCampaign", (_e: unknown, id: number) => { requireAuth(); return whatsapp.runCampaign(id); });
  register("whatsapp:getCampaign", (_e: unknown, id: number) => { requireAuth(); return whatsapp.campaign(id); });
  register("whatsapp:listCampaigns", (_e: unknown, limit?: number) => { requireAuth(); return whatsapp.campaigns(limit || 30); });
  register("whatsapp:listHistory", (_e: unknown, limit?: number) => { requireAuth(); return whatsapp.history(limit || 100); });
  register("whatsapp:retryFailed", (_e: unknown, id: number) => { requireAuth(); return whatsapp.retryFailed(id); });
  register("whatsapp:runtimeState", () => { requireAuth(); return whatsapp.runtimeState(); });

  // Bring the bundled local WhatsApp service up with the app and tear it
  // down cleanly on quit. If it is not installed (dev checkout), this simply
  // logs a warning — the UI reports UNAVAILABLE and messaging stays disabled.
  void startWaha().catch((err) => console.warn("[WhatsApp] local service not started:", err?.message || err));
  app.on("before-quit", () => { void stopWaha(); });
}

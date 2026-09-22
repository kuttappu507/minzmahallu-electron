import { app, ipcMain } from "electron";
import { whatsapp, setReceiptDeliveryPush } from "./services/whatsapp.service.js";
import { recipientStats } from "./services/whatsapp-recipient.service.js";
import { flushAuthWrites, maybeStartEngine, stopEngine, drainAuthWrites, snapshotAuthNow } from "./services/whatsapp-engine.service.js";
import type { Actor } from "./services/security.service.js";

// WhatsApp IPC — auth-gated exactly like the rest of the app. The actor
// provider is wired from main.ts (the logged-in session), so every
// whatsapp:* handler fails closed when nobody is signed in.
let registered = false;

export function registerWhatsAppIpc(
  getActor: () => Actor | null,
  getWindow?: () => Electron.BrowserWindow | null
) {
  if (registered) return;
  registered = true;
  whatsapp.init();
  // Push late receipt deliveries to the open window: the send returns as soon
  // as WhatsApp accepts the message (no 4 s block), and the ack that lands a
  // moment later flips the privacy lock — the page is told which row changed
  // so its badge updates itself instead of waiting for the next refresh.
  setReceiptDeliveryPush((e) => {
    try {
      const win = getWindow?.();
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send("whatsapp:receipt-delivered", e);
      }
    } catch { /* renderer gone — the database row is already updated */ }
  });

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
  // `connect` carries the ToS consent: the renderer's safety-notice checkbox
  // sets `acknowledged` — the FIRST pairing is refused without it (stored in
  // whatsapp_settings.tos_ack_at, so later resumes don't re-ask).
  register("whatsapp:connect", (opts?: { acknowledged?: boolean }) => { requireAuth(); return whatsapp.connect(opts || {}); });
  register("whatsapp:ackToS", () => { requireAuth(); return whatsapp.acknowledgeToS(); });
  register("whatsapp:qr", () => { requireAuth(); return whatsapp.qr(); });
  // Phone-number pairing — QR-free alternative ("Link with phone number").
  register("whatsapp:pairingCode", (phone: string) => { requireAuth(); return whatsapp.pairingCode(phone); });
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

  // The WhatsApp engine lives in-process — nothing to spawn. When a paired
  // session exists on disk it logs back in silently with the app; an
  // unpaired machine stays idle until the user presses Connect (no QR
  // handshake churn).
  maybeStartEngine();
  // GRACEFUL QUIT — the "pairing gone after closing the app" guard:
  //   1. persist the session WHILE the socket is still alive (Baileys writes
  //      creds asynchronously, so a key rotation can still be in flight),
  //   2. close the WebSocket cleanly WITHOUT logout, so the phone keeps this
  //      device linked,
  //   3. drain Baileys' in-flight KEY writes (only creds used to be awaited;
  //      a truncated pre-key/sync-key file was the remaining "connection gone
  //      after closing" class),
  //   4. verify the credentials on disk one last time, then hold the whole
  //      folder (creds + keys together) as the verified snapshot the next
  //      start restores from if anything still got cut off.
  // Every step is capped and the whole sequence is bounded, so a wedged
  // socket can never hang the exit; main.ts' before-quit closes the DB first,
  // this handler runs after it and finishes the exit itself.
  let quitting = false;
  app.on("before-quit", (event) => {
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    void (async () => {
      const guard = new Promise((resolve) => setTimeout(resolve, 9000));
      const work = (async () => {
        try {
          await flushAuthWrites();
          await stopEngine();
          await drainAuthWrites(2000);
          await flushAuthWrites(1500);
          snapshotAuthNow();
        } catch { /* best effort */ }
      })();
      await Promise.race([work, guard]);
      app.exit(0);
    })();
  });
}

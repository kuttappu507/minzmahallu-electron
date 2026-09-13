/* ============================================================================
 * Boot sequence — what electron/main.ts did, in the order the app needs it.
 *
 *   1. load the host adapter (the native shell on Android, IndexedDB in a browser)
 *   2. open the SQLite database (schema, seed, migrations, provisions)
 *   3. register every API handler: business → secured → whatsapp → receipts
 *      (later registrations win, which is how the secured layer locks the
 *      sensitive channels down)
 *   4. expose window.mms
 *   5. start the auto-backup timer and the lifecycle hooks (flush on pause,
 *      hardware back button)
 *
 * The UI must not render before step 4, so main.tsx awaits this.
 * ========================================================================== */
import { getPlatform, platformKind } from "../core/platform/index.js";
import { closeDB, getBootWarnings, openDatabase, persistNow } from "../core/db/connection.js";
import { register, hasHandler } from "./registry.js";
import { registerBusinessHandlers, startAutoBackup } from "./handlers.js";
import { installMmsBridge } from "./mms.js";
import { registerSecurityIpc } from "../core/security-ipc.js";
import { registerWhatsAppIpc } from "../core/whatsapp-ipc.js";
import { registerReceiptIpc } from "../core/receipt-ipc.js";
import { currentActorContext } from "../core/services/auth.service.js";
import type { Actor } from "../core/services/security.service.js";

let booted = false;

export interface BootResult {
  warnings: string[];
  platform: string;
  handlers: number;
}

/** The logged-in session, exactly as the desktop's `session.user` was. */
function actorProvider(): Actor | null {
  return currentActorContext();
}

export async function bootApp(): Promise<BootResult> {
  if (booted) return { warnings: getBootWarnings(), platform: platformKind(), handlers: 0 };
  booted = true;

  const host = await getPlatform();
  await openDatabase();

  // 1) Business handlers (the permissive baseline).
  registerBusinessHandlers({ getSession: actorProvider });
  // 2) Secured handlers — they overwrite the sensitive channels above.
  registerSecurityIpc(register, actorProvider);
  // 3) WhatsApp and receipts (also auth-gated).
  registerWhatsAppIpc(register, actorProvider);
  registerReceiptIpc(register, actorProvider);

  // 4) App lifecycle helpers.
  register("app:flush", async () => {
    await persistNow();
    return { success: true };
  });
  register("app:minimize", async () => {
    await host.ui.minimize();
  });

  // 5) Bridge + background flushing.
  installMmsBridge();
  host.onAppStateChange((active) => {
    if (!active) void persistNow();
  });

  // Android hardware back button: walk the history back, and only leave the
  // app when there is nowhere left to go.
  host.onBackButton(() => {
    if (typeof window !== "undefined" && window.history?.length > 1) window.history.back();
    else void host.ui.minimize();
  });

  // The automatic backup timer belongs to a real device; test hosts would
  // only keep a process alive for nothing.
  if (host.kind !== "node") startAutoBackup();

  // Flush at the last possible moment before the page is frozen or unloaded.
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("pagehide", () => void persistNow());
    document?.addEventListener?.("visibilitychange", () => {
      if (document.visibilityState === "hidden") void persistNow();
    });
  }

  return { warnings: getBootWarnings(), platform: host.kind, handlers: hasHandler("auth:login") ? 1 : 0 };
}

export async function shutdownApp(): Promise<void> {
  await closeDB();
}

export { getBootWarnings };

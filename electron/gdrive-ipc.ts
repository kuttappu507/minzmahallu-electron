import { app, ipcMain, shell, safeStorage } from "electron";
import * as data from "./services/data.service.js";
import { createGDrive, type GDriveService } from "./services/gdrive.service.js";
import type { Actor } from "./services/security.service.js";

/*
 * Google Drive IPC — same auth-gating pattern as whatsapp-ipc.ts. The actor
 * provider is wired from main.ts (the logged-in session), so every mutating
 * gdrive:* handler fails closed when nobody is signed in. `gdrive:getStatus`
 * is intentionally NOT auth-gated: it only reports configuration state (like
 * settings:load) so the Settings page can render the card.
 *
 * Token security: the refresh token is stored ONLY through Electron
 * safeStorage — on Windows that is DPAPI encryption bound to the Windows
 * user account. If safeStorage is unavailable the connection is refused
 * outright rather than falling back to a plaintext token file.
 */

let registered = false;
let svc: GDriveService | null = null;

// DPAPI-backed secret store. Refuses (available() === false) instead of
// storing plaintext when the OS keychain cannot be reached.
const osSecretStore = {
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain: string): Buffer => safeStorage.encryptString(plain),
  decrypt: (buf: Buffer): string => safeStorage.decryptString(buf),
};

export function registerGDriveIpc(getActor: () => Actor | null) {
  if (registered) return;
  registered = true;

  svc = createGDrive({
    getUserData: () => app.getPath("userData"),
    getConfig: () => {
      const s: any = data.settings.load() || {};
      return {
        clientId: String(s.gdrive_client_id || "").trim(),
        clientSecret: String(s.gdrive_client_secret || "").trim(),
        folderName: String(s.gdrive_folder_name || "").trim() || "MMS-Backups",
      };
    },
    secretStore: osSecretStore,
    openExternal: (url: string) => shell.openExternal(url),
  });

  const requireAuth = () => {
    if (!getActor()) throw new Error("Authentication is required for this operation");
  };

  const register = (name: string, handler: (...args: any[]) => any) => {
    try { ipcMain.removeHandler(name); } catch {}
    ipcMain.handle(name, async (_event, ...args) => handler(...args));
  };

  register("gdrive:getStatus", () => svc!.getStatus());
  register("gdrive:connect", async () => { requireAuth(); return svc!.connect(); });
  register("gdrive:disconnect", () => { requireAuth(); return svc!.disconnect(); });
  register("gdrive:test", async () => { requireAuth(); return svc!.test(); });
  register("gdrive:uploadNow", async () => { requireAuth(); return svc!.uploadNewestBackup(app.getPath("userData")); });
}

/**
 * Best-effort Google Drive upload after every backup (manual + auto).
 * Returns null when Drive is not configured/connected — that case must be
 * completely silent. A configured-but-failing upload returns { ok:false }
 * so the caller can log it without ever failing the backup itself.
 */
export async function gdriveUploadAfterBackup(filePath: string): Promise<{ ok: boolean; name?: string; error?: string } | null> {
  if (!svc) return null;
  const status = svc.getStatus();
  if (!status.configured || !status.connected) return null;
  return svc.uploadBackupFile(filePath);
}

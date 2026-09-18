/*
 * auto-update — in-app self-update (electron-updater).
 *
 * Until v2.1.0 the banner's "download" button handed the installer asset to
 * the system browser (shell.openExternal). That made the office download a
 * fresh Setup.exe through Edge/Chrome — the file lands with the
 * Mark-of-the-Web flag, Windows SmartScreen calls it untrusted, and the
 * upgrade often dies there.
 *
 * This module lets the app download and install the update ITSELF:
 *   1. update-check.ts (monthly, due-gated) still does the DETECTION and
 *      shows the banner — unchanged.
 *   2. When the user accepts, `updates:downloadUpdate` runs electron-updater
 *      against the SAME GitHub release feed (latest*.yml assets). The
 *      installer is fetched by the app process — no browser, no
 *      Mark-of-the-Web, no SmartScreen.
 *   3. `updates:installUpdate` quits and installs silently (Windows may show
 *      one UAC prompt because the office install is per-machine), then
 *      relaunches the app.
 *
 * Consent-first: autoDownload stays false — nothing downloads until the user
 * clicks. If the download DID finish but the user walked away, the update is
 * applied on the next app quit (autoInstallOnAppQuit) so the office never
 * has to babysit an installer.
 *
 * electron-updater's `autoUpdater` is a lazy getter that instantiates a
 * platform updater (Nsis/AppImage/Mac…) the moment it is TOUCHED — outside a
 * packaged Electron runtime that touch throws. The module is therefore only
 * default-imported at top level (harmless); it is destructured inside
 * registerAutoUpdater, which runs in the packaged app and never in tests.
 */
import { app, ipcMain } from "electron";
// electron-updater ships CommonJS only. Under the packaged ESM main process a
// named import crashes for the same reason exceljs did — cjs-module-lexer
// cannot see through the bundled dist. Default-import and destructure inside
// registerAutoUpdater instead (same interop pattern as ExcelJS in main.ts).
import electronUpdaterModule from "electron-updater";
import { isNewerVersion } from "./update-check.js";

export type UpdaterFailureReason = "no-update" | "unsupported" | "network" | "signature" | "generic";

export type DownloadUpdateReply =
  | { success: true }
  | { success: false; reason: UpdaterFailureReason };

type GetWindow = () => import("electron").BrowserWindow | null;

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** Platforms electron-updater can service with the artifacts this repo ships. */
export function isAutoUpdatePlatform(platform: string): boolean {
  return platform === "win32" || platform === "linux" || platform === "darwin";
}

/** Clamp/round a download-progress percent to a safe 0–100 integer. */
export function normalizePercent(p: unknown): number {
  const n = typeof p === "number" ? p : Number(p);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Map electron-updater's technical error text to one compact reason the
 * renderer can translate. Patterns are matched against the message because
 * electron-updater does not expose error codes.
 */
export function classifyUpdaterError(raw: unknown): UpdaterFailureReason {
  const msg = String((raw as { message?: unknown } | null)?.message ?? raw ?? "");
  if (/no (?:valid )?update|updateInfo|version is equal|is not newer/i.test(msg)) return "no-update";
  if (/app-update\.yml|dev-app-update|latest\.yml|latest-mac\.yml|latest-linux\.yml|APPIMAGE env|unsupported platform/i.test(msg)) return "unsupported";
  if (/signature|code signature|verify/i.test(msg)) return "signature";
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|network|timed? ?out|\b(?:404|403)\b|HTTP 50\d/i.test(msg)) return "network";
  return "generic";
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function send(getWindow: GetWindow, channel: string, payload: unknown): void {
  try { getWindow()?.webContents.send(channel, payload); } catch { /* window gone */ }
}

let wired = false;

/**
 * Registers the in-app download/install IPC surface. Call once during boot,
 * AFTER registerUpdateIpc (they own different channels). No-op in dev and on
 * platforms electron-updater cannot serve — the UI falls back to the
 * browser-download path it already has.
 */
export function registerAutoUpdater(getWindow: GetWindow): void {
  if (wired || !app.isPackaged || !isAutoUpdatePlatform(process.platform)) return;
  wired = true;

  const { autoUpdater } = electronUpdaterModule as unknown as typeof import("electron-updater");

  // Consent-first: detection + banner stay in update-check.ts; this module
  // only moves bytes after the user clicks.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null; // keep the office console clean

  autoUpdater.on("download-progress", (p) => {
    send(getWindow, "update:progress", {
      percent: normalizePercent(p?.percent),
      transferred: Math.max(0, Math.round(p?.transferred ?? 0)),
      total: Math.max(0, Math.round(p?.total ?? 0)),
      bytesPerSecond: Math.max(0, Math.round(p?.bytesPerSecond ?? 0)),
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    send(getWindow, "update:downloaded", { version: typeof info?.version === "string" ? info.version : "" });
  });

  autoUpdater.on("error", (err) => {
    send(getWindow, "update:download-failed", { reason: classifyUpdaterError(err) });
  });

  // In-app download. electron-updater must do its own feed check first
  // (latest*.yml) to cache UpdateInfo before downloadUpdate() can run.
  ipcMain.handle("updates:downloadUpdate", async (): Promise<DownloadUpdateReply> => {
    try {
      if (!isAutoUpdatePlatform(process.platform)) return { success: false, reason: "unsupported" };
      const res = await autoUpdater.checkForUpdates();
      const feedVersion = String(res?.updateInfo?.version ?? "");
      if (!isNewerVersion(app.getVersion(), feedVersion)) return { success: false, reason: "no-update" };
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      // The "error" listener already told the renderer; the reply is for the
      // immediate caller (Settings/banner click handler).
      return { success: false, reason: classifyUpdaterError(err) };
    }
  });

  // Quit → silent install → relaunch. setImmediate lets the IPC reply reach
  // the renderer before the process tears down.
  ipcMain.handle("updates:installUpdate", () => {
    try {
      setImmediate(() => {
        try { autoUpdater.quitAndInstall(true, true); } catch { app.quit(); }
      });
      return { success: true };
    } catch {
      return { success: false, reason: "generic" as const };
    }
  });
}

/* ============================================================================
 * Platform contract — everything the ported service layer needs from the host.
 *
 * The desktop build talked to Node/Electron directly (fs, dialog, BrowserWindow
 * print-to-PDF, Baileys WhatsApp engine, auto-updater). Android has none of
 * those, so each host capability behind this interface has three
 * implementations selected at runtime:
 *
 *   android → the native shell's bridge, window.mmsNative (see webview.ts and
 *             android/src/MainActivity.java)
 *   web     → IndexedDB + anchor downloads  (lets the SAME build run in a
 *             desktop browser for QA and demos, no emulator needed)
 *   node    → node:fs  (unit tests)
 * ========================================================================== */

export type PlatformKind = "android" | "web" | "node";

/** A stored file. Logical paths look like "data/mms.db" or "docs/backup-x.mmbak". */
export interface StoredFile {
  /** Path relative to its logical root, e.g. "mms.db". */
  name: string;
  size: number;
  mtime: number;
}

export interface PlatformFiles {
  read(path: string): Promise<Uint8Array | null>;
  write(path: string, data: Uint8Array): Promise<void>;
  readText(path: string): Promise<string | null>;
  writeText(path: string, text: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
  /** Files directly inside a logical folder ("data", "docs", "cache"). */
  list(folder: string): Promise<StoredFile[]>;
  /** Absolute/URI form when the host has one (used for sharing & messages). */
  uri(path: string): Promise<string | null>;
}

export interface ShareResult {
  /** true when the file left the app (saved, shared, or handed to another app). */
  saved: boolean;
  cancelled?: boolean;
  path?: string;
  error?: string;
}

export interface PlatformShare {
  /** Send a generated file (PDF/XLSX/backup) out of the app: Android share
   *  sheet on a phone, a browser download on the web, a temp file under test. */
  saveFile(opts: { name: string; mime: string; data: Uint8Array; title?: string; text?: string }): Promise<ShareResult>;
  /** Open an external URL / app scheme (whatsapp://, https://wa.me/…, tel:). */
  openUrl(url: string): Promise<void>;
}

export interface PlatformDevice {
  /** Stable-ish hardware/OS identity used for the anti-forgery fingerprint. */
  identityParts(): Promise<string[]>;
  /** App + device facts shown in Settings → About. */
  info(): Promise<{ model: string; platform: string; osVersion: string; appVersion: string; appId: string }>;
}

export interface PlatformPrefs {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface PlatformUi {
  alert(message: string, title?: string): Promise<void>;
  /** Native-feeling top status bar colour (no-op on web/node). */
  setStatusBarColor(hex: string): Promise<void>;
  /** Send the app to the background (Android hardware back at the root
   *  screen). No-op on web/node. */
  minimize(): Promise<void>;
}

export interface Platform {
  kind: PlatformKind;
  files: PlatformFiles;
  share: PlatformShare;
  device: PlatformDevice;
  prefs: PlatformPrefs;
  ui: PlatformUi;
  /** Hook for Android back-button handling (no-op elsewhere). */
  onBackButton(handler: () => void): () => void;
  /** App went to background / came back — the database uses this to flush. */
  onAppStateChange(handler: (active: boolean) => void): () => void;
}

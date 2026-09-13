/* ============================================================================
 * Android adapter — talks to the native shell in android/src/MainActivity.java
 * through `window.mmsNative`.
 *
 * One bridge method (`call(method, json)`) covers everything the service layer
 * needs from a device, so the JavaScript side never has to know how a
 * capability is implemented natively:
 *
 *   files.*        app-private storage (the SQLite image, .mmbak backups,
 *                  spreadsheet exports) — no storage permission required
 *   share.file     Android share sheet (what replaces the desktop "Save PDF…")
 *   share.openUrl  whatsapp://, tel:, https://wa.me/… in their own app
 *   device.*       model/OS/app facts, and the anti-forgery install identity
 *   prefs.*        native key/value settings
 *   ui.*           status-bar colour and native alerts
 *   app.*          minimise, exit, lifecycle handshake
 *
 * Native → JS events arrive through `window.__mmsNativeEvent` (back button,
 * foreground/background, QR deep links). The bridge queues events fired before
 * the page is ready, so a cold start from a scanned QR code is never lost.
 * ========================================================================== */
import { fromBase64, toBase64 } from "./crypto";
import type { Platform, PlatformKind, StoredFile } from "./types";

interface NativeApi {
  call(method: string, payload: string): string;
}
interface NativeEvent {
  name: string;
  payload?: any;
}
interface Envelope<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

declare global {
  interface Window {
    mmsNative?: NativeApi;
    __mmsNativeEvent?: (event: NativeEvent) => void;
  }
}

/** The native shell, when we are running inside it. */
export function hasNativeShell(): boolean {
  const api = (globalThis as any).mmsNative as NativeApi | undefined;
  return !!api && typeof api.call === "function";
}

function callNative<T>(method: string, payload: Record<string, unknown> = {}): T {
  const api = (globalThis as any).mmsNative as NativeApi | undefined;
  if (!api || typeof api.call !== "function") {
    throw new Error("The native bridge is not available in this host");
  }
  let envelope: Envelope<T>;
  try {
    envelope = JSON.parse(String(api.call(method, JSON.stringify(payload)))) as Envelope<T>;
  } catch {
    throw new Error(`Malformed reply from the native bridge (${method})`);
  }
  if (!envelope.ok) throw new Error(envelope.error || `Native call failed: ${method}`);
  return envelope.value as T;
}

// ---------------------------------------------------------------------------
// Native → JS events
// ---------------------------------------------------------------------------
const backHandlers = new Set<() => void>();
const stateHandlers = new Set<(active: boolean) => void>();
/** A scanned QR deep link, kept for the verify screen to pick up after login. */
export const DEEPLINK_STORAGE_KEY = "mms-pending-verify";
let listenersInstalled = false;

function installNativeEvents(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;

  (globalThis as any).__mmsNativeEvent = (event: NativeEvent) => {
    if (!event || typeof event.name !== "string") return;
    if (event.name === "back") {
      if (backHandlers.size) backHandlers.forEach((handler) => handler());
      else void platformUiMinimize();
      return;
    }
    if (event.name === "resume") {
      stateHandlers.forEach((handler) => handler(true));
      return;
    }
    if (event.name === "pause") {
      stateHandlers.forEach((handler) => handler(false));
      return;
    }
    if (event.name === "deeplink") {
      handleDeepLink(event.payload);
    }
  };

  // Tells the shell the listener is installed so it can release queued events.
  try {
    callNative("app.ready");
  } catch {
    /* an older shell without the handshake: events still arrive after load */
  }
}

function handleDeepLink(payload: any): void {
  const code = payload && typeof payload.code === "string" ? payload.code.trim() : "";
  if (!code) return;
  try {
    window.sessionStorage.setItem(DEEPLINK_STORAGE_KEY, code);
  } catch {
    /* private mode: the verify screen simply starts empty */
  }
  try {
    const target = "#/certificates";
    if (window.location.hash !== target) window.location.hash = target;
  } catch {
    /* ignore */
  }
  if (typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent("mms-deeplink", { detail: { code } }));
  }
}

async function platformUiMinimize(): Promise<void> {
  try {
    callNative("app.minimize");
  } catch {
    /* nothing to minimise outside the shell */
  }
}

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------
export function webviewPlatform(): Platform {
  installNativeEvents();

  return {
    kind: "android" as PlatformKind,
    files: {
      async read(logical) {
        const value = callNative<string | null>("files.read", { path: logical });
        return value == null ? null : fromBase64(value);
      },
      async write(logical, data) {
        callNative("files.write", { path: logical, base64: toBase64(data) });
      },
      async readText(logical) {
        return callNative<string | null>("files.readText", { path: logical });
      },
      async writeText(logical, text) {
        callNative("files.writeText", { path: logical, text });
      },
      async exists(logical) {
        return callNative<boolean>("files.exists", { path: logical }) === true;
      },
      async remove(logical) {
        callNative("files.remove", { path: logical });
      },
      async list(folder): Promise<StoredFile[]> {
        const rows = callNative<StoredFile[]>("files.list", { folder });
        return Array.isArray(rows) ? rows : [];
      },
      async uri(logical) {
        return callNative<string | null>("files.uri", { path: logical });
      },
    },
    share: {
      async saveFile({ name, mime, data, title, text }) {
        try {
          const result = callNative<{ saved: boolean; path?: string }>("share.file", {
            name,
            mime,
            base64: toBase64(data),
            title: title || name,
            ...(text ? { text } : {}),
          });
          return { saved: !!result?.saved, path: result?.path };
        } catch (error: any) {
          return { saved: false, error: String(error?.message || error) };
        }
      },
      async openUrl(url) {
        callNative("share.openUrl", { url });
      },
    },
    device: {
      async identityParts() {
        const parts = callNative<string[]>("device.identityParts");
        return Array.isArray(parts) ? parts.map(String) : [];
      },
      async info() {
        const info = callNative<any>("device.info");
        return {
          model: String(info?.model || "Android device"),
          platform: String(info?.platform || "android"),
          osVersion: String(info?.osVersion || ""),
          appVersion: String(info?.appVersion || "2.0.0"),
          appId: String(info?.appId || "com.mms.minzmahallu"),
        };
      },
    },
    prefs: {
      async get(key) {
        return callNative<string | null>("prefs.get", { key });
      },
      async set(key, value) {
        callNative("prefs.set", { key, value });
      },
      async remove(key) {
        callNative("prefs.remove", { key });
      },
    },
    ui: {
      async alert(message, title) {
        callNative("ui.alert", { message, ...(title ? { title } : {}) });
      },
      async setStatusBarColor(hex) {
        try {
          callNative("ui.statusBar", { hex });
        } catch {
          /* not fatal: the theme colour stays */
        }
      },
      async minimize() {
        await platformUiMinimize();
      },
    },
    onBackButton(handler) {
      backHandlers.add(handler);
      return () => backHandlers.delete(handler);
    },
    onAppStateChange(handler) {
      stateHandlers.add(handler);
      return () => stateHandlers.delete(handler);
    },
  };
}

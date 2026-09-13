import type { Platform, PlatformKind } from "./types";

/* ============================================================================
 * Runtime platform selection.
 *
 * The Android build and the browser build share one codebase; only this module
 * decides which host adapter is loaded. Detection is a property probe — the
 * native shell injects `window.mmsNative` before any script runs, so nothing
 * has to be imported to decide (and the server/test side stays clean).
 * ========================================================================== */

export function detectPlatformKind(): PlatformKind {
  if (typeof window === "undefined" || typeof document === "undefined") return "node";
  const native = (globalThis as any).mmsNative;
  if (native && typeof native.call === "function") return "android";
  return "web";
}

let current: Platform | null = null;
let loading: Promise<Platform> | null = null;

/** Tests (and any embedding host) can install their own adapter. */
export function setPlatform(impl: Platform): void {
  current = impl;
  loading = null;
}

export function platformKind(): PlatformKind {
  return current?.kind ?? detectPlatformKind();
}

/** Load (once) the adapter for the current host. */
export function getPlatform(): Promise<Platform> {
  if (current) return Promise.resolve(current);
  if (loading) return loading;
  const kind = detectPlatformKind();
  loading = (async () => {
    if (kind === "android") {
      const { webviewPlatform } = await import("./webview");
      current = webviewPlatform();
    } else if (kind === "web") {
      const { webPlatform } = await import("./web");
      current = webPlatform();
    } else {
      throw new Error(
        "No platform adapter installed. Node hosts (tests) must call setPlatform(nodePlatform())."
      );
    }
    return current;
  })();
  return loading;
}

/** Convenience accessor used by the service layer. */
export async function platform(): Promise<Platform> {
  return getPlatform();
}

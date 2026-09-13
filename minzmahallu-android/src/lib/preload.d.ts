/*
 * TypeScript view of the window.mms bridge.
 *
 * On the desktop this file described Electron's preload script; the Android
 * build installs the same API shape from @/bridge/mms, so screens keep calling
 * `window.mms.<module>.<method>(...)` without any type changes.
 */
import type { MmsApi } from "@/bridge/mms";

declare global {
  interface Window {
    mms: MmsApi;
    mmsPlatform?: string;
  }
}

export {};

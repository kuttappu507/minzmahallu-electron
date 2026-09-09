import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Interface-animation preference ("low-end mode").
 *
 * WHY THIS EXISTS: the sidebar collapse animates CSS `width`, which forces a
 * full-window relayout + repaint on every frame (the main column, its tables
 * and the gradient canvases all resize with it). On weak hardware that reads
 * as a glitch. When html.lowfx is set, globals.css snaps the sidebar instantly
 * instead — snappy beats stuttery.
 *
 * AUTO DETECTION (Chromium APIs, evaluated once at load):
 *  - navigator.hardwareConcurrency: CPU logical cores; <= 4 covers old
 *    Celeron/Pentium and early i3-class machines common in offices.
 *  - navigator.deviceMemory: RAM in GiB (capped at 8 by the spec); <= 4
 *    catches low-RAM laptops that are the typical low-end case.
 * Users can override the detection in Settings → Appearance.
 */

type FxPref = "auto" | "reduced" | "full";

const weakHardware =
  (typeof navigator !== "undefined" && (navigator.hardwareConcurrency ?? 8) <= 4) ||
  (typeof navigator !== "undefined" && ((navigator as any).deviceMemory ?? 8) <= 4);

interface FxState {
  pref: FxPref;
  /** Effective value after applying the preference (what html.lowfx mirrors). */
  reduced: boolean;
  setPref: (p: FxPref) => void;
  apply: () => void;
}

export const useFx = create<FxState>()(
  persist(
    (set, get) => ({
      pref: "auto",
      reduced: weakHardware,
      setPref: (p) => {
        set({ pref: p });
        get().apply();
      },
      apply: () => {
        const pref = get().pref;
        const reduced = pref === "auto" ? weakHardware : pref === "reduced";
        set({ reduced });
        document.documentElement.classList.toggle("lowfx", reduced);
      },
    }),
    {
      name: "mms-fx",
      onRehydrateStorage: () => (state) => {
        if (state) state.apply();
      },
    }
  )
);

// Apply immediately at module init: on a FRESH install (empty localStorage)
// zustand never invokes the rehydrate callback, so without this the detected
// html.lowfx class would be missing until the user touches the setting.
useFx.getState().apply();

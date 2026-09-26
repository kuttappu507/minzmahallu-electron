import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Occasional-freeze fix (user report: "freezing happening in mid range
// systems, but low end doesnt feel in low end system"). Machine-dependent
// freezes point at the compositor/window-management layer, not compute.
// Three mitigations are pinned here, all in electron/main.ts:
//
//   1. The main window is NO LONGER unconditionally `transparent: true`.
//      Transparent frameless windows are Electron's best-documented freeze
//      vector on Windows (per-pixel-alpha DWM blend on every frame; hybrid
//      GPUs and Win11 24H2 are the classic broken combos, while basic
//      low-end iGPUs sail through — exactly the reported split). Windows now
//      gets an opaque window painted with the app's own --bg (#f6f8fa);
//      macOS/Linux keep the old transparent look. Transparency bought
//      nothing: .app-shell is a square full-bleed surface and the window is
//      hidden until "win:renderer-ready" anyway.
//   2. Chromium's native window-occlusion calculation is disabled on Windows
//      (disable-features=CalculateNativeWinOcclusion) — the standard
//      mitigation for "window freezes until refocus" false-positives with
//      frameless windows. Ignored gracefully where the flag no longer exists.
//   3. Crash resilience: a dead GPU process gets an immediate invalidate()
//      (fresh frame instead of a stale wedged one), and a crashed main
//      renderer gets ONE guarded reload (max 2 per rolling minute).

const MAIN = readFileSync(
  fileURLToPath(new URL("./main.ts", import.meta.url)),
  "utf8"
);

describe("main window compositing (occasional-freeze fix)", () => {
  it("window transparency is platform-conditional — never unconditional", () => {
    expect(MAIN).toContain(
      '...(win32 ? { backgroundColor: "#f6f8fa" } : { backgroundColor: "#00000000", transparent: true })'
    );
    expect(MAIN).toContain('const win32 = process.platform === "win32";');
    // The old unconditional options line must be gone.
    expect(MAIN).not.toContain(
      'title: "MMS — Minz Mahallu Management System", transparent: true, frame: false'
    );
  });

  it("Windows window background is the app's opaque --bg colour", () => {
    // globals.css light token --bg: #f6f8fa — body.app-loaded paints the
    // same value, so the opaque window is visually identical at reveal time.
    expect(MAIN).toContain('backgroundColor: "#f6f8fa"');
  });

  it("disables native window occlusion on Windows (before app ready)", () => {
    expect(MAIN).toContain('app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion")');
    // Guarded to win32, and placed at module top level (a top-level statement
    // always precedes app.whenReady(), which is all Chromium requires).
    const switchIdx = MAIN.indexOf('appendSwitch("disable-features"');
    expect(switchIdx).toBeGreaterThan(-1);
    const guard = MAIN.lastIndexOf("process.platform === \"win32\"", switchIdx);
    expect(guard).toBeGreaterThan(-1);
  });

  it("a dead GPU process forces a repaint (invalidate), not a wedged stale frame", () => {
    expect(MAIN).toContain('app.on("child-process-gone"');
    expect(MAIN).toContain('if (details.type !== "GPU") return;');
    expect(MAIN).toContain("mainWindow?.webContents.invalidate()");
  });

  it("a crashed main renderer gets a guarded reload (max 2 per rolling minute)", () => {
    expect(MAIN).toContain('mainWindow.webContents.on("render-process-gone"');
    expect(MAIN).toContain("rendererReloadTimestamps = rendererReloadTimestamps.filter((t) => now - t < 60_000);");
    expect(MAIN).toContain("if (rendererReloadTimestamps.length >= 2) return;");
    // A reload must never fire for a clean teardown.
    expect(MAIN).toContain('details.reason === "clean-exit"');
  });
});

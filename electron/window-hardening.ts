import type { WebContents } from "electron";

/**
 * Navigation / window-open hardening applied to EVERY webContents the app
 * creates (main window, splash, uninstall-verify gate, offscreen PDF
 * renderer).
 *
 * The production UI is a local file (`dist/index.html`) and the splash /
 * PDF renderers load generated `data:` URLs — the application has no
 * legitimate reason to navigate anywhere else, and no legitimate reason to
 * open a second window or embed a webview. These guards close the classic
 * renderer-escape hatches:
 *
 *   - `setWindowOpenHandler` denies EVERY `window.open`/target=_blank popup
 *     (the renderer cannot create arbitrary Electron windows);
 *   - `will-navigate` blocks page-initiated navigation to any URL the main
 *     process did not explicitly allow (dev server in dev mode only);
 *   - `will-attach-webview` refuses every <webview> (none are used).
 *
 * Main-process-initiated loads (`loadURL` / `loadFile`) are NOT affected —
 * they do not emit `will-navigate`.
 */
export function hardenWebContents(
  wc: WebContents,
  opts: { allowUrl?: (url: string) => boolean } = {},
): void {
  const allowed = opts.allowUrl;
  // No popups, no child windows, no browser views — ever. A compromised
  // renderer must not be able to create a new privileged surface.
  try { wc.setWindowOpenHandler(() => ({ action: "deny" })); } catch { /* gone */ }
  wc.on("will-navigate", (event, url) => {
    if (allowed && url && allowed(url)) return;
    event.preventDefault();
  });
  wc.on("will-attach-webview", (event) => { event.preventDefault(); });
}

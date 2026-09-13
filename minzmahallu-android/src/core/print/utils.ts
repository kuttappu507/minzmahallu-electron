/* ============================================================================
 * Print helpers shared by every template.
 *
 * The desktop build read the Anek Malayalam font CSS and the certificate
 * preview stylesheet from disk (node:fs). Android has no such files at
 * runtime, so both are inlined into the bundle: the fonts are embedded as
 * base64 data URIs (./anek-font-css.ts) and the preview stylesheet is imported
 * as raw text. The function signatures are unchanged, so no template had to be
 * touched.
 * ========================================================================== */
import { ANEK_MALAYALAM_FONT_CSS } from "./anek-font-css.js";
import { PREVIEW_SCREEN_CSS } from "./preview-screen.js";

export function esc(value: any): string {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

/**
 * Full @fontsource-variable/anek-malayalam CSS (latin + latin-ext + malayalam
 * subsets, every weight) with each url(...) already replaced by a base64 data
 * URI, so Malayalam glyphs render inside the sandboxed print frame — without
 * it they fall back to Poppins/Arial, which have no Malayalam block, and the
 * PDF shows empty boxes.
 */
export function getAnekMalayalamCss(): string {
  return ANEK_MALAYALAM_FONT_CSS;
}

/**
 * On-screen styles for the certificate preview popup, authored as its own
 * stylesheet (src/core/print/preview-screen.css) and inlined at build time so
 * no component has to inject inline <style> markup.
 */
export function getPreviewScreenCss(): string {
  return PREVIEW_SCREEN_CSS;
}

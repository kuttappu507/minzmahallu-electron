/* ============================================================================
 * Fonts for printed documents (receipts, certificates, registers, tokens).
 *
 * WHY THIS FILE EXISTS
 * The desktop build read the font stylesheet from the app bundle inside the
 * Electron main process. Nothing like that exists on Android, so the fonts are
 * inlined into the JavaScript bundle at build time as data URIs (`?inline`).
 * That makes every generated PDF self-contained: the print frame renders with
 * the real Malayalam (Anek) and Latin (Poppins) faces on any device, with no
 * network and no font installed on the phone.
 *
 * Both families matter:
 *   · Anek Malayalam Variable — Malayalam script (needs the malayalam subset)
 *     plus latin/latin-ext for mixed text;
 *   · Poppins (400/500/600/700) — the app's Latin UI face, used by headings,
 *     numbers and column labels in every template.
 * If a face is missing, English text silently becomes a system fallback and
 * Malayalam becomes empty boxes — so this is bundled unconditionally.
 * ========================================================================== */
import anekMalayalam from "../../assets/fonts/anek-malayalam-malayalam-wght-normal.woff2?inline";
import anekLatinExt from "../../assets/fonts/anek-malayalam-latin-ext-wght-normal.woff2?inline";
import anekLatin from "../../assets/fonts/anek-malayalam-latin-wght-normal.woff2?inline";
import poppinsRegular from "../../assets/fonts/Poppins-Regular.ttf?inline";
import poppinsMedium from "../../assets/fonts/Poppins-Medium.ttf?inline";
import poppinsSemiBold from "../../assets/fonts/Poppins-SemiBold.ttf?inline";
import poppinsBold from "../../assets/fonts/Poppins-Bold.ttf?inline";

/** Unicode ranges copied from @fontsource-variable/anek-malayalam. */
const RANGE_MALAYALAM = "U+0307,U+0323,U+0951-0952,U+0964-0965,U+0D00-0D7F,U+1CDA,U+1CF2,U+200C-200D,U+20B9,U+25CC,U+A830-A832";
const RANGE_LATIN_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";
const RANGE_LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

function anekFace(url: string, unicodeRange: string): string {
  return `@font-face{font-family:'Anek Malayalam Variable';font-style:normal;font-display:block;font-weight:100 800;src:url(${url}) format('woff2-variations');unicode-range:${unicodeRange};}`;
}

function poppinsFace(url: string, weight: number): string {
  return `@font-face{font-family:Poppins;font-style:normal;font-display:block;font-weight:${weight};src:url(${url}) format('truetype');}`;
}

/**
 * Complete `@font-face` CSS, already inlined — drop it straight into a
 * template's <style> block (every template does).
 */
export const ANEK_MALAYALAM_FONT_CSS: string = [
  anekFace(anekMalayalam, RANGE_MALAYALAM),
  anekFace(anekLatinExt, RANGE_LATIN_EXT),
  anekFace(anekLatin, RANGE_LATIN),
  poppinsFace(poppinsRegular, 400),
  poppinsFace(poppinsMedium, 500),
  poppinsFace(poppinsSemiBold, 600),
  poppinsFace(poppinsBold, 700),
].join("\n");

export default ANEK_MALAYALAM_FONT_CSS;

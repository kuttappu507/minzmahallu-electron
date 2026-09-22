import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function esc(value: any): string {
  return String(value ?? '').replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c] || c));
}

/**
 * Returns the full @fontsource-variable/anek-malayalam CSS (all weights,
 * latin + malayalam subsets) with each url(...) replaced by a base64 data URI
 * so the fonts render correctly inside a detached BrowserWindow used for
 * printToPDF. Without this, Malayalam glyphs fall back to "Segoe UI"/Arial
 * which don't have the Malayalam unicode block — the PDF shows empty boxes
 * or missing characters.
 *
 * The result is MEMOIZED: the font files never change during a run, yet this
 * used to re-read ~110 KB of woff2 from disk (through asar in a packaged app)
 * and re-base64 them on EVERY receipt, certificate and statement render.
 *
 * Returns an empty string if the font package isn't resolvable (defensive).
 */
let anekMalayalamCssCache: string | null = null;

export function getAnekMalayalamCss(): string {
  if (anekMalayalamCssCache !== null) return anekMalayalamCssCache;
  anekMalayalamCssCache = buildAnekMalayalamCss();
  return anekMalayalamCssCache;
}

function buildAnekMalayalamCss(): string {
  try {
    const require = createRequire(import.meta.url);
    const cssPath = require.resolve('@fontsource-variable/anek-malayalam/wght.css');
    const css = readFileSync(cssPath, 'utf8');
    const cssDir = dirname(cssPath);
    return css.replace(/url\((['"]?)([^'"\)]+)\1\)/g, (_m, quote: string, relativePath: string) => {
      if (/^(data:|https?:|file:)/i.test(relativePath)) return `url(${quote}${relativePath}${quote})`;
      try {
        const fontPath = resolve(cssDir, relativePath);
        const base64 = readFileSync(fontPath).toString('base64');
        return `url("data:font/woff2;base64,${base64}")`;
      } catch {
        return `url(${quote}${relativePath}${quote})`;
      }
    });
  } catch {
    return '';
  }
}

/**
 * Poppins @font-face CSS (400/500/600/700) for the print windows. The printed
 * templates all declare font-family:"Poppins,…" but until now only Anek
 * Malayalam was embedded — Latin text and digits fell back to Arial/Helvetica
 * in every PDF that wasn't a receipt/certificate, so registers, the survey
 * form and report exports visibly lost the app's typeface.
 *
 * The TTFs are the SAME files the renderer UI uses (src/assets/fonts, copied
 * to resources/fonts — resources/** ships inside app.asar, see
 * getPreviewScreenCss for the resolution pattern). Each face is embedded as a
 * base64 data URI; no unicode-range needed because the font-family list puts
 * "Anek Malayalam Variable" right after Poppins for the Malayalam block.
 *
 * Memoized like getAnekMalayalamCss. Returns '' defensively if not found.
 */
const POPPINS_FACES: Array<[number, string]> = [
  [400, 'Poppins-Regular.ttf'],
  [500, 'Poppins-Medium.ttf'],
  [600, 'Poppins-SemiBold.ttf'],
  [700, 'Poppins-Bold.ttf'],
];

let poppinsCssCache: string | null = null;

export function getPoppinsCss(): string {
  if (poppinsCssCache !== null) return poppinsCssCache;
  poppinsCssCache = buildPoppinsCss();
  return poppinsCssCache;
}

function buildPoppinsCss(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const dirs = [
      resolve(here, '../../resources/fonts'),
      resolve(here, '../../../resources/fonts'),
      resolve(process.cwd(), 'resources/fonts'),
    ];
    const faces = POPPINS_FACES.map(([weight, file]) => {
      for (const dir of dirs) {
        try {
          const base64 = readFileSync(resolve(dir, file)).toString('base64');
          return `@font-face{font-family:Poppins;src:url("data:font/ttf;base64,${base64}") format("truetype");font-weight:${weight};font-style:normal;font-display:block}`;
        } catch { /* next dir */ }
      }
      return '';
    }).filter(Boolean);
    return faces.join('\n');
  } catch {
    return '';
  }
}

/**
 * On-screen styles for the certificate preview popup, authored as a SEPARATE
 * stylesheet (resources/templates/preview-screen.css) so no component injects
 * inline <style> markup. The path resolves both in dev (repo/resources) and
 * packaged builds (app.asar/resources — resources/** ships in the asar).
 *
 * Returns an empty string if the file isn't found (defensive).
 */
export function getPreviewScreenCss(): string {
  try {
    // dist-electron/print/utils.js -> ../../resources/templates/preview-screen.css
    // (in source form under vitest: electron/print -> ../../resources/… — same depth)
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolve(here, '../../resources/templates/preview-screen.css'),
      resolve(here, '../../../resources/templates/preview-screen.css'),
      resolve(process.cwd(), 'resources/templates/preview-screen.css'),
    ];
    for (const c of candidates) {
      try { return readFileSync(c, 'utf8'); } catch { /* next */ }
    }
    return '';
  } catch {
    return '';
  }
}


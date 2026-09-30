/*
 * Task 44/47 — the native instant splash window.
 *
 * It is the only splash (the renderer-side overlay was removed in Task 47)
 * and the only user-visible surface of the first ~1-3 s of app life
 * (everything else loads behind it), so its correctness matters: brand
 * strings must match the app's i18n byte-for-byte (the Malayalam text is
 * copy-pasted into many places by hand — a garbled variant here would be
 * the FIRST thing a new user ever sees), every asset must be inline (one
 * network/file fetch at that moment defeats the whole point), and the
 * version must survive sanitisation.
 *
 * main.ts companion guard: electron/startup-imports.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSplashHtml } from "./splash-window.js";

/** The exact Malayalam app name, extracted from src/i18n/index.ts at run
 *  time so the test fails loudly if the splash ever drifts from the app. */
function i18nAppName(): { en: string; ml: string } {
  const src = readFileSync(fileURLToPath(new URL("../src/i18n/index.ts", import.meta.url)), "utf8");
  const m = src.match(/app_name:\s*\{\s*en:\s*"([^"]*)",\s*ml:\s*"([^"]*)"/);
  if (!m) throw new Error("app_name not found in src/i18n/index.ts");
  return { en: m[1], ml: m[2] };
}

describe("buildSplashHtml", () => {
  it("renders the brand title and the i18n Malayalam app name byte-exactly", () => {
    const html = buildSplashHtml({ version: "2.4.11" });
    expect(html).toContain("<h1>Minz Mahallu</h1>");
    const name = i18nAppName();
    expect(html).toContain(name.ml);
    // The English i18n app name is longer than the display title; the
    // subtitle line carries the Malayalam only.
    expect(html).not.toContain(name.en);
  });

  it("keeps the Malayalam preparing-modules caption byte-exactly", () => {
    const html = buildSplashHtml({ version: "2.4.11" });
    // Pinned literal (was byte-checked against the renderer splash's boot
    // steps, which Task 47 removed — the native splash is the only splash).
    expect(html).toContain("\u0d2e\u0d4a\u0d21\u0d4d\u0d2f\u0d42\u0d33\u0d41\u0d15\u0d7e \u0d24\u0d2f\u0d4d\u0d2f\u0d3e\u0d31\u0d3e\u0d15\u0d4d\u0d15\u0d41\u0d28\u0d4d\u0d28\u0d41");
  });

  it("embeds the sanitized version and strips unsafe characters", () => {
    const html = buildSplashHtml({ version: "2.4.11" });
    expect(html).toContain("Version 2.4.11");
    const hostile = buildSplashHtml({ version: '2.4.11<script>alert(1)</script>" onload="x' });
    const versionLine = hostile.match(/Version ([^<]*)</)![1];
    expect(versionLine.startsWith("2.4.11")).toBe(true);
    // Only the safe charset survives sanitisation.
    expect(versionLine).toMatch(/^[0-9A-Za-z.\-+]+$/);
    expect(hostile).not.toContain("<script>");
    expect(hostile).not.toContain('onload="');
  });

  it("shows the logo image when a data URL is provided", () => {
    const html = buildSplashHtml({ version: "2.4.11", logoDataUrl: "data:image/png;base64,QUJD" });
    expect(html).toContain('<img class="logo" id="splash-logo" src="data:image/png;base64,QUJD"');
    // The fallback DIV (not its CSS rule) must be absent.
    expect(html).not.toContain('logo-fallback" id="splash-logo">M</div>');
  });

  it("falls back to the letter mark when no logo is available", () => {
    const html = buildSplashHtml({ version: "2.4.11", logoDataUrl: null });
    expect(html).toContain('logo-fallback" id="splash-logo">M</div>');
    expect(html).not.toContain('<img class="logo"');
  });

  it("is fully self-contained: no network references, only data: assets", () => {
    const html = buildSplashHtml({ version: "2.4.11", logoDataUrl: "data:image/png;base64,QUJD" });
    expect(html).not.toMatch(/(?:src|href)\s*=\s*"(?!data:)[^"]*"/);
    expect(html).not.toMatch(/url\(\s*["']?https?:/i);
    expect(html).not.toMatch(/@import/i);
  });

  it("keeps the spinner and the loading caption", () => {
    const html = buildSplashHtml({ version: "2.4.11" });
    expect(html).toContain('class="spin"');
    expect(html).toContain("@keyframes turn");
  });

  it("pays no blur-filter cost on the critical first paint (v2.6.5)", () => {
    // Gaussian blur layers on the brand glows are among the most expensive
    // paint ops and ran on the very first frames of app life (on the
    // software path that Chromium's blocklist gives low-end machines).
    // The soft look comes from radial gradients only — cheap on every
    // rendering path, native or software.
    const html = buildSplashHtml({ version: "2.6.5" });
    expect(html).not.toMatch(/filter:\s*blur/);
    expect(html).toContain("radial-gradient");
  });

  it("reveals the window only after its content has painted — no empty frame before the splash (v2.6.8)", () => {
    // Field report (v2.6.8): "one outer frame comes before splash, then
    // splash come". v2.6.5-2.6.7 called show() at CREATION, before the HTML
    // load — the user saw an empty brand-colour rectangle first and the
    // real splash seconds later, as two events. The verdict: the first
    // visible thing must be the COMPLETE splash; latency (even 5-10 s) is
    // acceptable, an intermediate empty frame is not. Source pin: there is
    // NO show() call between window creation and the ready-to-show handler
    // (the loadURL must also come before any show — the content paints
    // while hidden, then ready-to-show presents it in one step), and the
    // only bare show() calls live inside the ready-to-show handler and the
    // 2.5 s wedged-renderer fallback (both guarded by isVisible()).
    const src = readFileSync(fileURLToPath(new URL("./splash-window.ts", import.meta.url)), "utf8");
    const createIdx = src.indexOf("splashWin = new BrowserWindow");
    const loadIdx = src.indexOf("splashWin.loadURL", createIdx);
    const readyIdx = src.indexOf('splashWin.once("ready-to-show"', createIdx);
    const fallbackIdx = src.indexOf("setTimeout(() => {", src.indexOf("// Paint fallback"));
    expect(createIdx).toBeGreaterThan(-1);
    expect(loadIdx).toBeGreaterThan(createIdx);
    expect(readyIdx).toBeGreaterThan(-1);
    expect(readyIdx).toBeLessThan(loadIdx);
    expect(fallbackIdx).toBeGreaterThan(-1);
    // Between creation and the ready-to-show registration there must be NO
    // eager show() — the v2.6.5 "show the moment it exists" is what
    // produced the outer frame. The only show() calls live inside the
    // ready-to-show handler and the 2.5 s fallback, both after this point.
    const eager = src.slice(createIdx, readyIdx);
    expect(eager).not.toContain("splashWin.show()");
    // Both reveal points show ONLY when the window is not visible yet.
    const readyHandler = src.slice(readyIdx, src.indexOf("markSplashShown", readyIdx));
    expect(readyHandler).toContain("isVisible()");
    expect(readyHandler).toContain("splashWin.show()");
    const fallbackBody = src.slice(fallbackIdx, src.indexOf("markSplashShown", fallbackIdx));
    expect(fallbackBody).toContain("isVisible()");
    expect(fallbackBody).toContain("splashWin.show()");
  });

  it("keeps a painted-fallback show so a wedged renderer can never hide the splash", () => {
    // The ready-to-show milestone depends on the splash renderer actually
    // compositing. If it stalls on some GPU/driver the 2.5 s fallback shows
    // the window anyway (hidden windows keep painting, so it is virtually
    // always the finished content by then) — and the boot gate resolves
    // either way. There must be exactly one such fallback timer.
    const src = readFileSync(fileURLToPath(new URL("./splash-window.ts", import.meta.url)), "utf8");
    const createIdx = src.indexOf("splashWin = new BrowserWindow");
    const fnEnd = src.indexOf("export function closeSplash");
    const body = src.slice(createIdx, fnEnd);
    expect(body).toContain("2500");
    expect(body).toContain("isVisible()");
  });

  it("builds nothing and reads no files before the window exists (v2.6.6)", () => {
    // Office report: "double click have a some second time to come splash".
    // createSplashWindow used to read + base64-encode the logo and build the
    // whole document BEFORE `new BrowserWindow` — a filesystem hit (subject
    // to antivirus scan latency) stood between the double-click and the
    // first native pixel. Now the window is created and shown first; the
    // (tiny) HTML is built after, and the logo is injected once the content
    // has painted.
    const src = readFileSync(fileURLToPath(new URL("./splash-window.ts", import.meta.url)), "utf8");
    const fnIdx = src.indexOf("export function createSplashWindow");
    const createIdx = src.indexOf("splashWin = new BrowserWindow");
    // Everything between the function's first line and window creation must
    // be free of work (the injectSplashLogo DEFINITION above the function is
    // fine — it only RUNS after did-finish-load).
    const before = src.slice(fnIdx, createIdx);
    expect(before).not.toContain("findSplashLogoDataUrl()");
    expect(before).not.toContain("buildSplashHtml(");
    // The HTML build and loadURL both come after the first show().
    const showIdx = src.indexOf("splashWin.show()", createIdx);
    const htmlIdx = src.indexOf("const html = buildSplashHtml(", createIdx);
    const loadIdx = src.indexOf("splashWin.loadURL", createIdx);
    expect(htmlIdx).toBeGreaterThan(showIdx);
    expect(loadIdx).toBeGreaterThan(htmlIdx);
    // The logo is injected after the content paints, not loaded upfront.
    expect(src).toContain("did-finish-load");
    expect(src).toContain("injectSplashLogo()");
    const finishIdx = src.indexOf('webContents.once("did-finish-load"');
    expect(finishIdx).toBeGreaterThan(-1);
    expect(src.slice(finishIdx, finishIdx + 120)).toContain("injectSplashLogo()");
  });

  it("disables the splash spellchecker (v2.6.6)", () => {
    // No input exists in the splash; the spellcheck service must never be
    // initialised for it (consistency with the main window's login fix).
    const src = readFileSync(fileURLToPath(new URL("./splash-window.ts", import.meta.url)), "utf8");
    expect(src).toContain("spellcheck: false");
  });
});

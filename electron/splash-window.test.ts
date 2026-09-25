/*
 * Task 44 — the native instant splash window.
 *
 * The HTML document is the only user-visible surface of the first ~1-3 s of
 * app life (everything else loads behind it), so its correctness matters:
 * brand strings must match the app's i18n byte-for-byte (the Malayalam text
 * is copy-pasted into many places by hand — a garbled variant here would be
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

/** The 4th Malayalam boot-step caption ("preparing modules"), extracted from
 *  src/components/Splash.tsx — the native splash reuses that exact string. */
function splashPreparingCaption(): string {
  const src = readFileSync(fileURLToPath(new URL("../src/components/Splash.tsx", import.meta.url)), "utf8");
  const mlBlock = src.match(/ml:\s*\[([\s\S]*?)\],/);
  if (!mlBlock) throw new Error("ml boot steps not found in Splash.tsx");
  const msgs = Array.from(mlBlock[1].matchAll(/msg:\s*"([^"]+)"/g)).map((m) => m[1]);
  if (msgs.length < 4) throw new Error("unexpected boot-step count in Splash.tsx");
  return msgs[3];
}

describe("buildSplashHtml", () => {
  it("renders the brand title and the i18n Malayalam app name byte-exactly", () => {
    const html = buildSplashHtml({ version: "2.4.11" });
    expect(html).toContain("<h1>Minz Mahallu</h1>");
    const name = i18nAppName();
    expect(html).toContain(name.ml);
    // The English i18n app name is longer than the display title; the
    // subtitle line carries the Malayalam only (title matches the renderer
    // splash's "Minz Mahallu" display brand).
    expect(html).not.toContain(name.en);
  });

  it("reuses the renderer splash's Malayalam preparing caption byte-exactly", () => {
    const html = buildSplashHtml({ version: "2.4.11" });
    expect(html).toContain(splashPreparingCaption());
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
    expect(html).toContain('<img class="logo" src="data:image/png;base64,QUJD"');
    // The fallback DIV (not its CSS rule) must be absent.
    expect(html).not.toContain('logo-fallback">M</div>');
  });

  it("falls back to the letter mark when no logo is available", () => {
    const html = buildSplashHtml({ version: "2.4.11", logoDataUrl: null });
    expect(html).toContain('logo-fallback">M</div>');
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
});

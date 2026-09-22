import { describe, it, expect } from "vitest";
import { getPoppinsCss } from "./utils.js";

/**
 * User report: register / survey-form / report PDFs did not use Poppins —
 * Latin text fell back to Arial because only Anek Malayalam was embedded in
 * the print window. getPoppinsCss() must yield the four static Poppins faces
 * (400/500/600/700) as base64 data URIs, resolvable from source AND packaged
 * (resources/fonts ships in app.asar).
 */
describe("getPoppinsCss", () => {
  it("embeds all four Poppins weights as data-URI @font-face blocks", () => {
    const css = getPoppinsCss();
    expect(css).not.toBe("");
    const faces = css.match(/@font-face\{/g)?.length ?? 0;
    expect(faces).toBe(4);
    for (const weight of [400, 500, 600, 700]) {
      expect(css).toContain(`font-weight:${weight}`);
    }
    expect((css.match(/data:font\/ttf;base64,/g) ?? []).length).toBe(4);
    // every url() must be an embedded data URI — print windows have no asset server
    const cssWithoutDataUris = css.replace(/url\("data:[^"]*"\)/g, "");
    expect(cssWithoutDataUris).not.toContain("url(");
  });

  it("is memoized (same string instance on repeated calls)", () => {
    expect(getPoppinsCss()).toBe(getPoppinsCss());
  });
});

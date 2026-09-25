import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The login screen makes the WHOLE viewport a window-drag region
// (.login-wrap carries -webkit-app-region: drag). Chromium computes the drag
// region only from elements that explicitly declare an app-region — an
// overlay painted above one (app-region auto) does NOT subtract from it.
// Interactive layers that portal to <body> or render as siblings of
// .login-wrap therefore need an explicit no-drag, or every mouse event on
// them is swallowed by window-drag. That is exactly the reported bug: the
// "Close MMS?" confirm dialog's buttons were dead on the login screen while
// working everywhere else — main routes only drag on the thin .topbar strip,
// which never reaches the centered dialog.
// Pinned here: every fixed/absolute interactive overlay layer declares
// -webkit-app-region: no-drag, and the login screen keeps its drag region
// WITH its interactive exemptions.

const CSS = readFileSync(
  fileURLToPath(new URL("./globals.css", import.meta.url)),
  "utf8"
);

/** All rule bodies for a selector (first occurrence onward, top-level scan). */
function ruleBodies(selector: string): string[] {
  const bodies: string[] = [];
  let from = 0;
  for (;;) {
    const at = CSS.indexOf(selector, from);
    if (at === -1) break;
    const open = CSS.indexOf("{", at);
    const close = CSS.indexOf("}", open);
    if (open === -1 || close === -1) break;
    // Only a direct match: the char before the selector must not continue an
    // identifier (e.g. .modal-root must not match .modal-rootx).
    const before = at > 0 ? CSS[at - 1] : " ";
    if (!/[\w-]/.test(before)) bodies.push(CSS.slice(open + 1, close));
    from = at + selector.length;
  }
  return bodies;
}

const NO_DRAG = "-webkit-app-region: no-drag";

describe("app-region: interactive overlays stay clickable over drag regions", () => {
  it("the login screen is a drag region (window must stay movable by its chrome)", () => {
    expect(ruleBodies(".login-wrap").some((b) => b.includes("-webkit-app-region: drag"))).toBe(true);
  });

  it("login page's own controls are exempted from the drag region", () => {
    expect(ruleBodies(".login-wrap input, .login-wrap button").some((b) => b.includes(NO_DRAG))).toBe(true);
    expect(ruleBodies(".login-win-controls").some((b) => b.includes(NO_DRAG))).toBe(true);
  });

  it(".modal-root is no-drag — the Close MMS? dialog portals to <body>, so on the login screen its buttons sat above the full-viewport drag region", () => {
    expect(ruleBodies(".modal-root").some((b) => b.includes(NO_DRAG))).toBe(true);
  });

  it(".toast-container is no-drag — toasts (with a close button) show on the login screen too", () => {
    expect(ruleBodies(".toast-container").some((b) => b.includes(NO_DRAG))).toBe(true);
  });

  it(".upd-banner is no-drag — update actions render on the login screen as well", () => {
    expect(ruleBodies(".upd-banner").some((b) => b.includes(NO_DRAG))).toBe(true);
  });

  it(".dropdown-fixed is no-drag — fixed dropdown overlays must stay interactive", () => {
    expect(ruleBodies(".dropdown-fixed").some((b) => b.includes(NO_DRAG))).toBe(true);
  });
});

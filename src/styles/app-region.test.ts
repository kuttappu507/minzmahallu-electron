import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The login screen no longer makes the WHOLE viewport a window-drag region.
// History: the original full-viewport drag (.login-wrap) plus per-element
// no-drag subtraction produced the reported "Close MMS? dialog buttons dead
// on the login screen" bug (an `auto` overlay above a drag region does NOT
// subtract from it), and after the v2.7.1 per-button hardening the field
// STILL reported "✕ dead on the login window" on Windows. v2.7.2 removed the
// fragile geometry entirely: the drag region lives ONLY in .login-drag-strip,
// a titlebar strip that stops 124px short of the right edge, so the ✕/min/max
// buttons never sit above ANY drag region. Interactive layers that portal to
// <body> or render as siblings of .login-wrap keep an explicit no-drag —
// pinned here so a future full-viewport drag can never sneak back in.

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

/** Rule bodies where the selector appears EXACTLY (not as a prefix of a
 *  longer selector list like ".login-wrap input"): the text between the
 *  selector and the next "{" must be whitespace only. */
function exactRuleBodies(selector: string): string[] {
  const bodies: string[] = [];
  let from = 0;
  for (;;) {
    const at = CSS.indexOf(selector, from);
    if (at === -1) break;
    const open = CSS.indexOf("{", at);
    if (open !== -1 && CSS.slice(at + selector.length, open).trim() === "") {
      const close = CSS.indexOf("}", open);
      if (close !== -1) bodies.push(CSS.slice(open + 1, close));
    }
    from = at + selector.length;
  }
  return bodies;
}

describe("app-region: interactive overlays stay clickable over drag regions", () => {
  it("the login viewport itself is NOT a drag region anymore (v2.7.2: the field-failing geometry is gone)", () => {
    expect(exactRuleBodies(".login-wrap").some((b) => b.includes("-webkit-app-region"))).toBe(false);
  });

  it("the login drag strip is the only drag region and stops short of the window controls", () => {
    const strip = exactRuleBodies(".login-drag-strip");
    expect(strip.some((b) => b.includes("-webkit-app-region: drag"))).toBe(true);
    // 3 × 40px buttons + 2 × 2px gaps = 124px reserved on the right for the
    // controls: no drag region may ever exist under the buttons.
    expect(strip.some((b) => b.includes("right: 124px"))).toBe(true);
  });

  it("login page's own controls keep their explicit no-drag exemption", () => {
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

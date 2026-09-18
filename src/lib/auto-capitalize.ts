/*
 * Global auto-capitalization for text inputs (user request v2.2.1).
 *
 * When the user leaves a text field, the first letter of every Latin word
 * becomes uppercase — "muhammed ali" → "Muhammed Ali". Malayalam text is
 * never touched (the transform only matches [a-z] after a word boundary),
 * and neither are numbers, codes or values that are already capitalized.
 *
 * One document-level "focusout" listener covers EVERY field at once —
 * shared <Input> components AND raw .inp inputs (the login screen, dialogs,
 * toolbars). Controlled React inputs are updated through the native value
 * setter + a bubbling "input" event so React state and the DOM stay in sync.
 *
 * Opt-outs (value must stay exactly as typed):
 *   - any non-text input type (password, email, number, tel, date, search…)
 *   - readonly/disabled fields
 *   - fields (or containers) marked data-nocap — username/email-ish/code
 *     fields where "admin" → "Admin" would break logins, "sb/" → "Sb/"
 *     would corrupt receipt prefixes, etc.
 *   - Malayalam transliteration inputs (Manglish must not be re-cased
 *     before Enter converts it).
 */
import { capitalizeWords } from "./utils";

function isEligible(el: EventTarget | null): el is HTMLInputElement {
  if (!el || !(el instanceof HTMLInputElement)) return false;
  if (el.readOnly || el.disabled) return false;
  const type = (el.getAttribute("type") || "text").toLowerCase();
  if (type !== "text" && type !== "") return false;
  if (el.closest("[data-nocap]")) return false;
  // MalayalamInput marks its <input> with data-transliteration while the
  // Enter-to-convert mode is active — leave Manglish as typed.
  if (el.getAttribute("data-transliteration") === "ml-enter") return false;
  return true;
}

function installAutoCapitalize(): void {
  // Guard against double-install (HMR / repeated imports in tests).
  const w = window as typeof window & { __mmsAutoCapInstalled?: boolean };
  if (w.__mmsAutoCapInstalled) return;
  w.__mmsAutoCapInstalled = true;

  document.addEventListener(
    "focusout",
    (e) => {
      const el = e.target;
      if (!isEligible(el)) return;
      const value = el.value;
      if (!value) return;
      const capped = capitalizeWords(value);
      if (capped === value) return;
      // React-controlled input: set through the native prototype setter and
      // re-dispatch "input" so the framework's onChange sees the new value.
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      if (desc?.set) desc.set.call(el, capped);
      else el.value = capped;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    true // capture: even stopPropagation() inside a form cannot skip it
  );
}

installAutoCapitalize();

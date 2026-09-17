import { describe, it, expect } from "vitest";
import { clampPhone10 } from "./phone";

/**
 * Hostile-user sweep round 2: pasting numbers copied from contacts/WhatsApp
 * used to corrupt them silently ("+91 98470 12345" -> "9198470123").
 */
describe("clampPhone10", () => {
  it("keeps a plain 10-digit number", () => {
    expect(clampPhone10("9847012345")).toBe("9847012345");
  });

  it("keeps spaced typing as the user types", () => {
    expect(clampPhone10("98470 12345")).toBe("9847012345");
  });

  it("strips the +91 country code from a pasted number", () => {
    expect(clampPhone10("+91 98470 12345")).toBe("9847012345");
    expect(clampPhone10("919847012345")).toBe("9847012345");
  });

  it("strips a leading STD 0 from a pasted number", () => {
    expect(clampPhone10("098470 12345")).toBe("9847012345");
    expect(clampPhone10("09847012345")).toBe("9847012345");
  });

  it("still caps at 10 digits for garbage pastes", () => {
    expect(clampPhone10("1234567890123456")).toBe("1234567890");
  });

  it("ignores non-digits entirely", () => {
    expect(clampPhone10("abc")).toBe("");
    expect(clampPhone10("")).toBe("");
    expect(clampPhone10("+91 (98470) 12345")).toBe("9847012345");
  });

  it("handles undefined/null-ish input defensively", () => {
    expect(clampPhone10(undefined as unknown as string)).toBe("");
    expect(clampPhone10(null as unknown as string)).toBe("");
  });
});

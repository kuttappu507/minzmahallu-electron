import { describe, it, expect } from "vitest";
import { amountError, nonNegativeAmountError, MAX_AMOUNT } from "./amount";

const T = (key: string) => `[${key}]`;

describe("amountError (must be > 0)", () => {
  it("rejects negative amounts — the sweep found nothing stopped them", () => {
    expect(amountError(-500, T)).toBe("[amount_invalid]");
  });
  it("rejects zero and empty inputs", () => {
    expect(amountError(0, T)).toBe("[amount_invalid]");
    expect(amountError("", T)).toBe("[amount_invalid]");
    expect(amountError(undefined, T)).toBe("[amount_invalid]");
  });
  it("rejects non-numeric garbage", () => {
    expect(amountError("abc", T)).toBe("[amount_invalid]");
    expect(amountError(Number.NaN, T)).toBe("[amount_invalid]");
    expect(amountError(Number.POSITIVE_INFINITY, T)).toBe("[amount_invalid]");
  });
  it("accepts legitimate amounts", () => {
    expect(amountError(2500, T)).toBeNull();
    expect(amountError("1250.50", T)).toBeNull();
    expect(amountError(1, T)).toBeNull();
  });
  it("caps absurd magnitudes", () => {
    expect(amountError(MAX_AMOUNT, T)).toBeNull();
    expect(amountError(MAX_AMOUNT + 1, T)).toBe("[amount_too_large]");
    expect(amountError(1e11, T)).toBe("[amount_too_large]");
  });
});

describe("nonNegativeAmountError (0 allowed, e.g. volunteer salary)", () => {
  it("allows 0 but rejects negatives", () => {
    expect(nonNegativeAmountError(0, T)).toBeNull();
    expect(nonNegativeAmountError(-1, T)).toBe("[amount_negative]");
  });
  it("still caps absurd magnitudes", () => {
    expect(nonNegativeAmountError(1e11, T)).toBe("[amount_too_large]");
  });
});

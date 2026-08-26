import { describe, it, expect } from "vitest";
import { formatCurrency, formatDate, statusVariant } from "@/lib/utils";

describe("formatCurrency", () => {
  it("formats 0 as currency", () => {
    expect(formatCurrency(0)).toMatch(/0/);
  });
  it("formats 1500.50", () => {
    const result = formatCurrency(1500.5);
    expect(result).toMatch(/1,50/);
  });
});

describe("formatDate", () => {
  it("returns em dash for null", () => {
    expect(formatDate(null)).toBe("—");
  });
  it("returns em dash for undefined", () => {
    expect(formatDate(undefined)).toBe("—");
  });
  it("returns formatted date for valid string", () => {
    const result = formatDate("2026-01-15");
    expect(result).toContain("2026");
  });
});

describe("statusVariant", () => {
  it("returns active for Active", () => {
    expect(statusVariant("Active")).toBe("active");
  });
  it("returns inactive for Inactive", () => {
    expect(statusVariant("Inactive")).toBe("inactive");
  });
  it("returns active for Paid", () => {
    expect(statusVariant("Paid")).toBe("active");
  });
  it("returns pending for unknown", () => {
    expect(statusVariant("Unknown")).toBe("pending");
  });
  it("returns overdue for Overdue", () => {
    expect(statusVariant("Overdue")).toBe("overdue");
  });
});

/*
 * Tests for auto-update.ts pure helpers. The module's electron-updater
 * import stays inert (autoUpdater is only touched inside registerAutoUpdater,
 * which these tests never call), so everything here runs in plain Node.
 */
import { describe, it, expect } from "vitest";
import { classifyUpdaterError, isAutoUpdatePlatform, normalizePercent } from "./auto-update.js";

describe("isAutoUpdatePlatform", () => {
  it("accepts the platforms this repo ships artifacts for", () => {
    expect(isAutoUpdatePlatform("win32")).toBe(true);
    expect(isAutoUpdatePlatform("linux")).toBe(true);
    expect(isAutoUpdatePlatform("darwin")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isAutoUpdatePlatform("freebsd")).toBe(false);
    expect(isAutoUpdatePlatform("browser")).toBe(false);
    expect(isAutoUpdatePlatform("")).toBe(false);
  });
});

describe("normalizePercent", () => {
  it("rounds into 0–100", () => {
    expect(normalizePercent(45.4)).toBe(45);
    expect(normalizePercent(45.6)).toBe(46);
    expect(normalizePercent(0)).toBe(0);
    expect(normalizePercent(100)).toBe(100);
  });

  it("clamps out-of-range and junk values", () => {
    expect(normalizePercent(-5)).toBe(0);
    expect(normalizePercent(120)).toBe(100);
    expect(normalizePercent(Number.NaN)).toBe(0);
    expect(normalizePercent(undefined)).toBe(0);
    expect(normalizePercent("37")).toBe(37);
  });
});

describe("classifyUpdaterError", () => {
  it("recognises a stale feed (no update left to download)", () => {
    expect(classifyUpdaterError(new Error("No valid update available"))).toBe("no-update");
    expect(classifyUpdaterError(new Error("updateInfo version is equal to current"))).toBe("no-update");
  });

  it("recognises an updater that cannot run (missing manifests / unpackaged)", () => {
    expect(classifyUpdaterError(new Error("Cannot find app-update.yml in the resources"))).toBe("unsupported");
    expect(classifyUpdaterError(new Error("Cannot find latest.yml in the release assets"))).toBe("unsupported");
    expect(classifyUpdaterError(new Error("APPIMAGE env is not defined"))).toBe("unsupported");
  });

  it("recognises signature failures (unsigned macOS)", () => {
    expect(classifyUpdaterError(new Error("Could not get code signature for downloaded update"))).toBe("signature");
  });

  it("recognises network failures", () => {
    expect(classifyUpdaterError(new Error("getaddrinfo ENOTFOUND api.github.com"))).toBe("network");
    expect(classifyUpdaterError(new Error("Cannot download update asset: 404"))).toBe("network");
    expect(classifyUpdaterError(new Error("Request timed out"))).toBe("network");
    // A 404 FOR latest.yml means the release has no updater manifest at all —
    // that is "unsupported" (browser fallback), not a transient network slip.
    expect(classifyUpdaterError(new Error("Cannot download latest.yml (404)"))).toBe("unsupported");
  });

  it("falls back to generic", () => {
    expect(classifyUpdaterError(new Error("EPERM: operation not permitted, unlink ..."))).toBe("generic");
    expect(classifyUpdaterError(null)).toBe("generic");
  });

  it("reads the message off Error objects and raw strings", () => {
    expect(classifyUpdaterError("network unreachable")).toBe("network");
    expect(classifyUpdaterError(new Error("No valid update available")).length).toBeLessThanOrEqual(10);
  });
});

/*
 * update-check — pure-logic regression guard.
 *
 * Pins the monthly cadence contract: version comparison must be NUMERIC
 * (1.10.0 > 1.9.9), unparseable versions must never claim an update, the
 * due-gate must allow the first check and then stay quiet for the interval,
 * and a GitHub answer with a newer tag must flip updateAvailable only when
 * genuinely newer.
 */
import { describe, it, expect } from "vitest";
import {
  parseVersionParts,
  isNewerVersion,
  isCheckDue,
  checkLatestRelease,
  RELEASES_API_URL,
  RELEASES_PAGE_URL,
} from "./update-check.js";

const DAY = 24 * 60 * 60 * 1000;

describe("parseVersionParts", () => {
  it("strips the v prefix and parses the numeric core", () => {
    expect(parseVersionParts("v2.10.3")).toEqual([2, 10, 3]);
    expect(parseVersionParts("V1.2")).toEqual([1, 2]);
    expect(parseVersionParts("2.0.0")).toEqual([2, 0, 0]);
  });
  it("ignores pre-release/build suffixes", () => {
    expect(parseVersionParts("2.0.0-beta.2")).toEqual([2, 0, 0]);
    expect(parseVersionParts("1.2.3+build.7")).toEqual([1, 2, 3]);
  });
  it("rejects garbage", () => {
    expect(parseVersionParts("")).toBeNull();
    expect(parseVersionParts("abc")).toBeNull();
    expect(parseVersionParts("1.x.3")).toBeNull();
    expect(parseVersionParts("latest")).toBeNull();
  });
});

describe("isNewerVersion", () => {
  it("compares numerically, not lexicographically", () => {
    expect(isNewerVersion("2.0.0", "2.10.0")).toBe(true);   // 10 > 9 trap
    expect(isNewerVersion("1.9.9", "1.10.0")).toBe(true);
    expect(isNewerVersion("2.0.0", "2.0.10")).toBe(true);
    expect(isNewerVersion("1.9.9", "1.10.0")).toBe(true);
  });
  it("equal or older versions never claim an update", () => {
    expect(isNewerVersion("2.0.0", "v2.0.0")).toBe(false);
    expect(isNewerVersion("2.1.0", "2.0.9")).toBe(false);
    expect(isNewerVersion("2.1.0", "2.1")).toBe(false);       // missing part = 0
  });
  it("treats equal cores with pre-release tags as up to date", () => {
    expect(isNewerVersion("2.0.0", "2.0.0-beta.1")).toBe(false);
    expect(isNewerVersion("2.0.0-beta.1", "2.0.0")).toBe(false); // core equal
  });
  it("more parts win when the prefix matches", () => {
    expect(isNewerVersion("2.0", "2.0.1")).toBe(true);
  });
  it("unparseable input never claims an update", () => {
    expect(isNewerVersion("dev", "2.0.0")).toBe(false);
    expect(isNewerVersion("2.0.0", "")).toBe(false);
  });
});

describe("isCheckDue (monthly gate)", () => {
  it("checks when nothing was recorded yet", () => {
    expect(isCheckDue(1_000_000, null)).toBe(true);
    expect(isCheckDue(1_000_000, undefined)).toBe(true);
  });
  it("stays quiet inside the interval", () => {
    const now = 10 * DAY;
    expect(isCheckDue(now, now - 29 * DAY)).toBe(false);
    expect(isCheckDue(now, now - DAY)).toBe(false);
  });
  it("fires once the full interval elapsed", () => {
    const now = 40 * DAY;
    expect(isCheckDue(now, now - 30 * DAY)).toBe(true);
    expect(isCheckDue(now, now - 31 * DAY)).toBe(true);
  });
});

describe("checkLatestRelease (injected fetch)", () => {
  const jsonResponse = (body: unknown, status = 200) => async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

  it("flags a newer release and keeps the https release URL", async () => {
    const r = await checkLatestRelease("2.0.0", jsonResponse({ tag_name: "v2.1.0", html_url: `${RELEASES_PAGE_URL.replace(/latest$/, "tag/v2.1.0")}` }) as any);
    expect(r).toMatchObject({ ok: true, updateAvailable: true, latestVersion: "2.1.0" });
    expect(r.url?.startsWith("https://github.com/")).toBe(true);
  });
  it("stays quiet when the installed version is the latest", async () => {
    const r = await checkLatestRelease("2.1.0", jsonResponse({ tag_name: "v2.1.0", html_url: RELEASES_PAGE_URL }) as any);
    expect(r).toMatchObject({ ok: true, updateAvailable: false });
  });
  it("non-2xx answers do not claim an update", async () => {
    const r = await checkLatestRelease("2.0.0", jsonResponse({}, 404) as any);
    expect(r).toMatchObject({ ok: false });
    expect(r.updateAvailable).toBeFalsy();
  });
  it("missing tag_name is a controlled no-release-info", async () => {
    const r = await checkLatestRelease("2.0.0", jsonResponse({ foo: 1 }) as any);
    expect(r).toMatchObject({ ok: false, reason: "no-release-info" });
  });
  it("network errors resolve instead of throwing", async () => {
    const r = await checkLatestRelease("2.0.0", (async () => { throw new Error("offline"); }) as any);
    expect(r).toMatchObject({ ok: false, reason: "network-error" });
  });
  it("points at the repo's own releases page by default", () => {
    expect(RELEASES_API_URL).toContain("kuttappu507/minzmahallu-electron");
    expect(RELEASES_PAGE_URL).toBe("https://github.com/kuttappu507/minzmahallu-electron/releases/latest");
  });
});

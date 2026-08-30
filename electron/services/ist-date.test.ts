import { describe, it, expect } from "vitest";
import { istDateStr, todayIST, istMonth, istPlusDays } from "./ist-date.js";

describe("ist-date (Indian Standard Time, app is India-only)", () => {
  it("records the INDIAN date even when the machine runs on UTC", () => {
    // 2026-08-31 00:30 IST == 2026-08-30 19:00 UTC. A machine on UTC must
    // still record 2026-08-31, not the UTC date.
    process.env.TZ = "UTC";
    expect(istDateStr(new Date("2026-08-30T19:00:00Z"))).toBe("2026-08-31");
    expect(new Date("2026-08-30T19:00:00Z").toISOString().slice(0, 10)).toBe("2026-08-30"); // sanity: UTC is a day behind
  });

  it("returns the same IST date regardless of machine timezone", () => {
    process.env.TZ = "America/New_York";
    const ny = todayIST();
    process.env.TZ = "UTC";
    const utc = todayIST();
    process.env.TZ = "Asia/Kolkata";
    const ist = todayIST();
    expect(ny).toBe(utc);
    expect(utc).toBe(ist);
    expect(ny).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("istMonth is the yyyy-mm prefix of todayIST", () => {
    expect(istMonth()).toBe(todayIST().slice(0, 7));
  });

  it("istPlusDays crosses month boundaries correctly", () => {
    process.env.TZ = "UTC";
    // 2026-03-31 18:30 UTC == 2026-04-01 00:00 IST
    expect(istDateStr(new Date("2026-03-31T18:30:00Z"))).toBe("2026-04-01");
    expect(istPlusDays(30)).toMatch(/^\d{4}-\d{2}-\d{2}$/); // shape only (depends on real clock)
  });
});

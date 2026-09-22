import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, formatTimeIST, todayIST } from "./utils";

/**
 * The office reads every timestamp in INDIAN time. SQLite stores naive
 * UTC strings ("yyyy-mm-dd HH:MM:SS" from datetime('now')) and the UI used
 * to parse them as machine-local — on a non-IST machine the audit log etc.
 * showed the wrong time (user report). Business dates ("yyyy-mm-dd") must
 * never shift at all.
 */
describe("IST display helpers", () => {
  it("renders naive SQLite UTC datetimes as IST on ANY machine zone", () => {
    // 10:30 UTC == 16:00 IST == 04:00 PM — 12-hour with AM/PM, the office convention.
    expect(formatDateTime("2026-09-19 10:30:00")).toBe("19-09-2026 04:00 PM");
  });

  it("renders ISO-with-Z datetimes as IST", () => {
    expect(formatDateTime("2026-09-19T10:30:00Z")).toBe("19-09-2026 04:00 PM");
  });

  it("AM/PM boundary: midnight is 12:xx AM, noon is 12:xx PM", () => {
    // 04:30 UTC == 10:00 IST (AM) ; 07:30 UTC == 13:00 IST (PM)
    expect(formatDateTime("2026-09-19 07:30:00")).toBe("19-09-2026 01:00 PM");
  });

  it("never shifts business (date-only) values across midnight", () => {
    expect(formatDate("2026-09-19")).toBe("19-09-2026");
    // 2026-03-13T00:00:00Z in IST is still 13 March (offset is +5:30).
    expect(formatDate("2026-03-13")).toBe("13-03-2026");
  });

  it("passes unparseable junk through untouched", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
    expect(formatDateTime("")).toBe("—");
    expect(formatDate(null)).toBe("—");
  });

  it("formatTimeIST shows only HH:MM in IST", () => {
    expect(formatTimeIST("2026-09-19 04:15:00")).toBe("09:45");
  });

  it("todayIST() is a yyyy-mm-dd IST calendar date", () => {
    expect(todayIST()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

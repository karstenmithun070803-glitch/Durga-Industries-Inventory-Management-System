// ============================================================
// Phase: 1
// Category: Unit
// Tests: getCurrentFY() — current Indian financial year (April–March)
//        fyDateRange() — IST-safe date boundaries for a given FY
//        isDateInFY() — check if a date string falls within a FY
//        fyToMonthRange() — extract first/last month of a FY
//        getFYOptions() — list of recent FY strings for dropdowns
// Source: src/lib/fy.ts
// ============================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { getCurrentFY, fyDateRange, isDateInFY, fyToMonthRange, getFYOptions } from "@/lib/fy";

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// getCurrentFY() — depends on system time; must mock date in tests
// Indian FY: April 1 to March 31
// ---------------------------------------------------------------------------
describe("getCurrentFY()", () => {
  it("returns the correct FY when called in June (mid-year)", () => {
    vi.setSystemTime(new Date("2025-06-15T12:00:00+05:30"));
    expect(getCurrentFY()).toBe("2025-2026");
  });

  it("returns the correct FY for April 1 (first day of new FY)", () => {
    vi.setSystemTime(new Date("2025-04-01T00:00:00+05:30"));
    expect(getCurrentFY()).toBe("2025-2026");
  });

  it("returns the PREVIOUS FY for March 31 (last day of old FY)", () => {
    vi.setSystemTime(new Date("2025-03-31T23:59:59+05:30"));
    expect(getCurrentFY()).toBe("2024-2025");
  });

  it("returns the correct FY for January (early calendar year, still in old FY)", () => {
    vi.setSystemTime(new Date("2026-01-10T12:00:00+05:30"));
    expect(getCurrentFY()).toBe("2025-2026");
  });

  it("returns format YYYY-YYYY (start year hyphen end year)", () => {
    vi.setSystemTime(new Date("2026-06-01T12:00:00+05:30"));
    const fy = getCurrentFY();
    expect(fy).toMatch(/^\d{4}-\d{4}$/);
    const [start, end] = fy.split("-").map(Number);
    expect(end - start).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// fyDateRange() — hardcodes +05:30 IST offset; timezone-safe
// ---------------------------------------------------------------------------
describe("fyDateRange()", () => {
  it("returns April 1 of start year as start date (IST)", () => {
    const { start } = fyDateRange("2025-2026");
    expect(start).toEqual(new Date("2025-04-01T00:00:00+05:30"));
  });

  it("returns March 31 end-of-day of end year as end date (IST)", () => {
    const { end } = fyDateRange("2025-2026");
    expect(end).toEqual(new Date("2026-03-31T23:59:59+05:30"));
  });

  it("start is before end", () => {
    const { start, end } = fyDateRange("2025-2026");
    expect(start < end).toBe(true);
  });

  it("works for an older FY", () => {
    const { start, end } = fyDateRange("2023-2024");
    expect(start).toEqual(new Date("2023-04-01T00:00:00+05:30"));
    expect(end).toEqual(new Date("2024-03-31T23:59:59+05:30"));
  });
});

// ---------------------------------------------------------------------------
// isDateInFY() — pure string comparison; no timezone issues
// ---------------------------------------------------------------------------
describe("isDateInFY()", () => {
  it("returns true for April 1 (first day of FY)", () => {
    expect(isDateInFY("2025-04-01", "2025-2026")).toBe(true);
  });

  it("returns true for March 31 (last day of FY)", () => {
    expect(isDateInFY("2026-03-31", "2025-2026")).toBe(true);
  });

  it("returns true for a mid-year date", () => {
    expect(isDateInFY("2025-09-15", "2025-2026")).toBe(true);
  });

  it("returns true for January (early calendar year, still in FY)", () => {
    expect(isDateInFY("2026-01-20", "2025-2026")).toBe(true);
  });

  it("returns false for March 31 of the START year (day before FY begins)", () => {
    expect(isDateInFY("2025-03-31", "2025-2026")).toBe(false);
  });

  it("returns false for April 1 of the END year (day after FY ends)", () => {
    expect(isDateInFY("2026-04-01", "2025-2026")).toBe(false);
  });

  it("returns false for a date in the previous FY", () => {
    expect(isDateInFY("2024-06-01", "2025-2026")).toBe(false);
  });

  it("returns false for a date in the next FY", () => {
    expect(isDateInFY("2026-11-01", "2025-2026")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fyToMonthRange() — extracts first and last month of a FY
// ---------------------------------------------------------------------------
describe("fyToMonthRange()", () => {
  it("returns from=April of start year and to=March of end year", () => {
    const range = fyToMonthRange("2025-2026");
    expect(range.from).toBe("2025-04");
    expect(range.to).toBe("2026-03");
  });

  it("works for a different FY", () => {
    const range = fyToMonthRange("2023-2024");
    expect(range.from).toBe("2023-04");
    expect(range.to).toBe("2024-03");
  });

  it("returns the correct format YYYY-MM for both fields", () => {
    const range = fyToMonthRange("2025-2026");
    expect(range.from).toMatch(/^\d{4}-\d{2}$/);
    expect(range.to).toMatch(/^\d{4}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// getFYOptions() — returns N FY strings going back from current FY
// ---------------------------------------------------------------------------
describe("getFYOptions()", () => {
  it("returns the requested number of FY options", () => {
    vi.setSystemTime(new Date("2025-06-01T12:00:00+05:30")); // FY 2025-2026
    const opts = getFYOptions(3);
    expect(opts).toHaveLength(3);
  });

  it("returns most recent FY first", () => {
    vi.setSystemTime(new Date("2025-06-01T12:00:00+05:30")); // FY 2025-2026
    const opts = getFYOptions(3);
    expect(opts[0]).toBe("2025-2026");
    expect(opts[1]).toBe("2024-2025");
    expect(opts[2]).toBe("2023-2024");
  });

  it("defaults to 5 options when count is not provided", () => {
    vi.setSystemTime(new Date("2025-06-01T12:00:00+05:30"));
    const opts = getFYOptions();
    expect(opts).toHaveLength(5);
  });

  it("all options are in YYYY-YYYY format with consecutive years", () => {
    vi.setSystemTime(new Date("2025-06-01T12:00:00+05:30"));
    for (const fy of getFYOptions(5)) {
      const [start, end] = fy.split("-").map(Number);
      expect(end - start).toBe(1);
    }
  });
});

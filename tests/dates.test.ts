import { describe, it, expect } from "vitest";
import { addDays, weekDays, monthDays } from "../src/lib/dates";
describe("calendar date boundaries", () => {
  it("starts weeks on Monday across a year boundary", () => {
    expect(weekDays("2027-01-01")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });
  it("keeps calendar dates stable across daylight saving changes", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
  });
  it("includes leap day in the month grid", () => {
    expect(monthDays("2028-02-12")).toContain("2028-02-29");
    expect(monthDays("2028-02-12")).toHaveLength(42);
  });
});

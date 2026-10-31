import { describe, expect, it } from "vitest";
import { getMeridiem, to12HourClock, to24HourClock } from "../../src/lib/cloud-backup-time.js";

describe("12-hour cloud backup clock conversion", () => {
  it.each([
    [0, 12, "AM"],
    [2, 2, "AM"],
    [12, 12, "PM"],
    [14, 2, "PM"],
    [23, 11, "PM"],
  ] as const)("displays 24-hour value %i as %i %s", (hour24, hour12, meridiem) => {
    expect(to12HourClock(hour24)).toBe(hour12);
    expect(getMeridiem(hour24)).toBe(meridiem);
  });

  it.each([
    [12, "AM", 0],
    [2, "AM", 2],
    [12, "PM", 12],
    [2, "PM", 14],
    [11, "PM", 23],
  ] as const)("converts %i %s to 24-hour value %i", (hour12, meridiem, hour24) => {
    expect(to24HourClock(hour12, meridiem)).toBe(hour24);
  });

  it("rejects hours outside their clock ranges", () => {
    expect(() => to12HourClock(24)).toThrow(RangeError);
    expect(() => to24HourClock(0, "AM")).toThrow(RangeError);
    expect(() => to24HourClock(13, "PM")).toThrow(RangeError);
  });
});

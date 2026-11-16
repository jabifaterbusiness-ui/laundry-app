import { describe, expect, it } from "vitest";
import { formatBranchReadyTime, parseBranchReadyTime } from "../../src/lib/branch-ready-time.js";

describe("branch ready-time format", () => {
  it("validates 24-hour values", () => {
    expect(parseBranchReadyTime("14:30", "24H")).toBe("14:30");
    expect(parseBranchReadyTime("23:59", "24H")).toBe("23:59");
    expect(parseBranchReadyTime("24:00", "24H")).toBeNull();
    expect(parseBranchReadyTime("2:30 PM", "24H")).toBeNull();
  });

  it("requires an explicit AM/PM marker for 12-hour values", () => {
    expect(parseBranchReadyTime("02:30 PM", "12H")).toBe("14:30");
    expect(parseBranchReadyTime("12:00 AM", "12H")).toBe("00:00");
    expect(parseBranchReadyTime("12:00 PM", "12H")).toBe("12:00");
    expect(parseBranchReadyTime("02:30", "12H")).toBeNull();
  });

  it("formats stored 24-hour values for a branch's selected display format", () => {
    expect(formatBranchReadyTime("14:30", "12H")).toBe("02:30 PM");
    expect(formatBranchReadyTime("00:15", "12H")).toBe("12:15 AM");
    expect(formatBranchReadyTime("14:30", "24H")).toBe("14:30");
    expect(formatBranchReadyTime(null, "12H")).toBe("");
  });
});

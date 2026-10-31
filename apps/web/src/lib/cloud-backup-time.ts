export type Meridiem = "AM" | "PM";

function assert24Hour(hour: number): void {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError("Hour must be an integer between 0 and 23.");
  }
}

export function to12HourClock(hour24: number): number {
  assert24Hour(hour24);
  return hour24 % 12 || 12;
}

export function getMeridiem(hour24: number): Meridiem {
  assert24Hour(hour24);
  return hour24 >= 12 ? "PM" : "AM";
}

export function to24HourClock(hour12: number, meridiem: Meridiem): number {
  if (!Number.isInteger(hour12) || hour12 < 1 || hour12 > 12) {
    throw new RangeError("12-hour clock hour must be an integer between 1 and 12.");
  }
  if (meridiem !== "AM" && meridiem !== "PM") {
    throw new RangeError("Meridiem must be AM or PM.");
  }
  return (hour12 % 12) + (meridiem === "PM" ? 12 : 0);
}

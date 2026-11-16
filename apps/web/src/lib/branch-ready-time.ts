export type ReadyTimeFormat = "12H" | "24H";

export function parseBranchReadyTime(value: string, format: ReadyTimeFormat): string | null {
  const trimmed = value.trim().toUpperCase();
  if (format === "24H") {
    return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(trimmed) ? trimmed : null;
  }
  const match = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/.exec(trimmed);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3] === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

export function formatBranchReadyTime(value: string | null, format: ReadyTimeFormat): string {
  if (!value) return "";
  if (format === "24H") return value;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return "";
  const hour = Number(match[1]);
  return `${String(hour % 12 || 12).padStart(2, "0")}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
}

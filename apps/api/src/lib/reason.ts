import { AppError } from "../middleware/error-handler.js";

const MAX_REASON_LENGTH = 1000;

export function requireReason(reason: unknown): string {
  if (typeof reason !== "string") {
    throw new AppError("A reason is required for this action", 422);
  }

  const normalized = reason.trim();

  if (!normalized) {
    throw new AppError("A reason is required for this action", 422);
  }

  if (normalized.length > MAX_REASON_LENGTH) {
    throw new AppError(
      `Reason must not exceed ${MAX_REASON_LENGTH} characters`,
      422,
    );
  }

  return normalized;
}

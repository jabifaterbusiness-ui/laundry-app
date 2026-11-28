import { randomUUID } from "node:crypto";
import { logger } from "../../lib/logger.js";
import { config } from "../../config/index.js";
import { AppError } from "../../middleware/error-handler.js";
import { sendWithResend, type ProviderEmailAttachment } from "./providers/resend.provider.js";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Optional inline or downloadable attachments. */
  attachments?: ProviderEmailAttachment[];
  /** Business-facing name; the authenticated platform domain remains the sender address. */
  fromName?: string;
  /** Optional business email reply target. Never used as an unverified sender. */
  replyTo?: string | null;
  /** Stable feature event key; Resend deduplicates retries for this event. */
  idempotencyKey?: string;
  /** Non-sensitive feature label used only for diagnostics. */
  feature: "password_reset" | "receipt" | "statement" | "communication" | "subscription" | "purchase_order";
}

export interface SendEmailResult {
  status: "SUBMITTED";
  id: string;
}

export class EmailDeliveryError extends AppError {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message, retryable ? 502 : 503);
    this.name = "EmailDeliveryError";
    this.retryable = retryable;
  }
}

function validRecipient(value: string): boolean {
  return !/[\r\n\s<>]/.test(value) && /^[^@]+@[^@.]+(?:\.[^@.]+)+$/.test(value);
}

/** All application email sends pass through this provider-neutral service. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!validRecipient(input.to)) {
    throw new EmailDeliveryError("Email recipient address is invalid.", false);
  }

  const idempotencyKey = input.idempotencyKey ?? `email:${randomUUID()}`;
  for (let attempt = 1; attempt <= config.email.maxAttempts; attempt += 1) {
    let deliveryError: EmailDeliveryError;
    try {
      const result = await sendWithResend(input, { idempotencyKey });
      if (result.ok) return { status: "SUBMITTED", id: result.id };
      const retryable = result.timedOut || result.statusCode === null || result.statusCode === 429 || result.statusCode >= 500;
      deliveryError = new EmailDeliveryError(
        retryable ? "Email provider is temporarily unavailable." : "Email provider rejected the message.",
        retryable,
      );
      logger.warn({ feature: input.feature, attempt, retryable, providerStatusCode: result.statusCode }, "Email submission failed.");
    } catch (error) {
      if (error instanceof EmailDeliveryError) throw error;
      const configured = Boolean((error as Error)?.message?.includes("not configured"));
      const missingId = Boolean((error as Error)?.message?.includes("no message identifier"));
      const retryable = !configured && !missingId;
      const safeMessage = configured
        ? "Email delivery is not configured."
        : missingId
          ? "Email provider returned no message identifier."
          : "Email submission could not be confirmed.";
      deliveryError = new EmailDeliveryError(safeMessage, retryable);
      logger.warn({ feature: input.feature, attempt, retryable, errorType: error instanceof Error ? error.name : typeof error }, "Email submission failed.");
    }
    if (!deliveryError.retryable || attempt === config.email.maxAttempts) throw deliveryError;
    await new Promise((resolve) => setTimeout(resolve, config.email.retryDelayMs * attempt));
  }
  throw new EmailDeliveryError("Email submission could not be confirmed.", true);
}

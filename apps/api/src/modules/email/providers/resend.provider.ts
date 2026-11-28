import { Resend } from "resend";
import { config } from "../../../config/index.js";

export interface ProviderEmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  contentId?: string;
}

export interface ProviderEmailInput {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  replyTo?: string | null;
  attachments?: ProviderEmailAttachment[];
}

export type ProviderEmailResult =
  | { ok: true; id: string }
  | { ok: false; statusCode: number | null; timedOut: boolean; providerErrorCode: string | null };

function validSender(value: string): boolean {
  if (/[\r\n]/.test(value)) return false;
  const address = value.match(/<([^<>]+)>/)?.[1] ?? value;
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) &&
    (!value.includes("<") || /^[^<>]+<[^<>]+>$/.test(value));
}

/** Resend-only transport boundary. Provider diagnostics are deliberately not returned. */
export async function sendWithResend(
  input: ProviderEmailInput,
  options: { idempotencyKey?: string } = {},
): Promise<ProviderEmailResult> {
  const { apiKey, from } = config.email;
  if (!apiKey || !from || !validSender(from)) {
    throw new Error("Email delivery is not configured.");
  }

  const resend = new Resend(apiKey);
  // Resend logs raw provider error payloads to console in non-production builds.
  // Keep its request/response implementation but suppress that unsafe diagnostic.
  Object.defineProperty(resend, "logError", { value: () => undefined });
  const signal = AbortSignal.timeout(config.email.requestTimeoutMs);
  // The SDK forwards fetch RequestInit at runtime, but its options type omits signal.
  const requestOptions = {
    signal,
    ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
  } as NonNullable<Parameters<typeof resend.emails.send>[1]> & { signal: AbortSignal };
  const verifiedAddress = from.match(/<([^<>]+)>/)?.[1] ?? from;
  const safeName = input.fromName?.replace(/[\r\n<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  const replyTo = input.replyTo && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.replyTo) ? input.replyTo : undefined;
  const { data, error } = await resend.emails.send(
    { from: safeName ? `${safeName} <${verifiedAddress}>` : from, to: input.to, subject: input.subject, html: input.html, ...(replyTo ? { replyTo } : {}), ...(input.attachments?.length ? { attachments: input.attachments } : {}) },
    requestOptions,
  );

  if (error) {
    const statusCode = typeof error.statusCode === "number" ? error.statusCode : null;
    const rawErrorCode = typeof error.name === "string" ? error.name : "";
    const providerErrorCode = /^[a-z0-9_]{1,64}$/i.test(rawErrorCode)
      ? rawErrorCode
      : null;
    return { ok: false, statusCode, timedOut: signal.aborted, providerErrorCode };
  }

  if (!data?.id) {
    throw new Error("Email provider returned no message identifier.");
  }

  return { ok: true, id: data.id };
}

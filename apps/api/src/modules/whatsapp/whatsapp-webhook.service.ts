import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { config } from "../../config/index.js";
import { AppError } from "../../middleware/error-handler.js";

type WhatsAppStatus = {
  id?: unknown;
  status?: unknown;
  errors?: Array<{
    code?: unknown;
    title?: unknown;
    message?: unknown;
    error_data?: { details?: unknown };
  }>;
};

type WhatsAppWebhookPayload = {
  object?: unknown;
  entry?: Array<{
    changes?: Array<{
      value?: { statuses?: WhatsAppStatus[] };
    }>;
  }>;
};

function verifySignature(rawBody: Buffer, signature: string | undefined) {
  const appSecret = config.receiptDelivery.whatsappAppSecret;
  if (!appSecret) {
    throw new AppError("WhatsApp webhook signature verification is not configured", 503);
  }
  if (!signature || !signature.startsWith("sha256=")) {
    throw new AppError("Missing or invalid WhatsApp webhook signature", 401);
  }

  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature.slice(7), "hex");
  } catch {
    throw new AppError("Invalid WhatsApp webhook signature", 401);
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new AppError("Invalid WhatsApp webhook signature", 401);
  }
}

function parsePayload(rawBody: Buffer): WhatsAppWebhookPayload {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new AppError("Invalid WhatsApp webhook JSON", 400);
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("object" in payload) ||
    payload.object !== "whatsapp_business_account" ||
    !("entry" in payload) ||
    !Array.isArray(payload.entry)
  ) {
    throw new AppError("Invalid WhatsApp webhook payload", 400);
  }
  return payload as WhatsAppWebhookPayload;
}

function getFailureMessage(status: WhatsAppStatus): string {
  const error = status.errors?.[0];
  if (!error) return "WhatsApp reported message delivery failure";
  const parts = [
    typeof error.code === "number" || typeof error.code === "string" ? `code ${error.code}` : null,
    typeof error.title === "string" ? error.title : null,
    typeof error.message === "string" ? error.message : null,
    typeof error.error_data?.details === "string" ? error.error_data.details : null,
  ].filter(Boolean);
  return (parts.join(": ") || "WhatsApp reported message delivery failure").slice(0, 1000);
}

const allowedPreviousStatuses: Record<string, string[]> = {
  SENT: ["PENDING", "SENT"],
  DELIVERED: ["PENDING", "SENT", "DELIVERED"],
  READ: ["PENDING", "SENT", "DELIVERED", "READ"],
  FAILED: ["PENDING", "SENT", "DELIVERED"],
};

async function processStatus(status: WhatsAppStatus) {
  if (
    typeof status.id !== "string" ||
    !status.id ||
    typeof status.status !== "string" ||
    !Object.prototype.hasOwnProperty.call(allowedPreviousStatuses, status.status)
  ) return false;

  const nextStatus = status.status;
  await prisma.communicationDelivery.updateMany({
    where: {
      channel: "WHATSAPP",
      providerMessageId: status.id,
      status: { in: allowedPreviousStatuses[nextStatus]! },
    },
    data: {
      status: nextStatus,
      errorMessage: nextStatus === "FAILED" ? getFailureMessage(status) : null,
    },
  });
  return true;
}

export async function processWhatsAppWebhook(
  rawBody: Buffer,
  signature: string | undefined,
) {
  verifySignature(rawBody, signature);
  const payload = parsePayload(rawBody);
  let processedStatuses = 0;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        if (await processStatus(status)) processedStatuses += 1;
      }
    }
  }

  return { processedStatuses };
}

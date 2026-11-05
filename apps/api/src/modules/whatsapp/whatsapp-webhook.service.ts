import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
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
type WhatsAppMessageEvent = { id?: unknown; from?: unknown; timestamp?: unknown; type?: unknown; text?: { body?: unknown }; [key: string]: unknown };
type WhatsAppWebhookPayload = {
  object?: unknown;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        statuses?: WhatsAppStatus[];
        messages?: WhatsAppMessageEvent[];
      };
    }>;
  }>;
};

function verifySignature(rawBody: Buffer, signature: string | undefined) {
  const appSecret = config.receiptDelivery.whatsappAppSecret;
  if (!appSecret) throw new AppError("WhatsApp webhook signature verification is not configured", 503);
  if (!signature || !signature.startsWith("sha256=")) {
    throw new AppError("Missing or invalid WhatsApp webhook signature", 401);
  }
  const digest = createHmac("sha256", appSecret).update(rawBody).digest();
  let received: Buffer;
  try { received = Buffer.from(signature.slice(7), "hex"); } catch {
    throw new AppError("Invalid WhatsApp webhook signature", 401);
  }
  if (received.length !== digest.length || !timingSafeEqual(digest, received)) {
    throw new AppError("Invalid WhatsApp webhook signature", 401);
  }
}

function parsePayload(rawBody: Buffer): WhatsAppWebhookPayload {
  let payload: unknown;
  try { payload = JSON.parse(rawBody.toString("utf8")); } catch {
    throw new AppError("Invalid WhatsApp webhook JSON", 400);
  }
  if (typeof payload !== "object" || payload === null || !("object" in payload) ||
      payload.object !== "whatsapp_business_account" || !("entry" in payload) || !Array.isArray(payload.entry)) {
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
  FAILED: ["PENDING", "SENT"],
};

async function resolveWebhookConnection(context: { wabaId?: string; phoneNumberId?: string }) {
  if (!context.phoneNumberId) return null;
  const connection = await prisma.whatsAppBusinessConnection.findUnique({
    where: { phoneNumberId: context.phoneNumberId },
    select: { id: true, businessId: true, wabaId: true },
  });
  // A signed webhook must still identify the same WABA/phone pair that this
  // tenant connected. Never route a callback to a tenant on phone ID alone.
  if (context.wabaId && connection?.wabaId !== context.wabaId) return null;
  return connection;
}

async function persistEvent(input: {
  wabaId?: string; phoneNumberId?: string; providerMessageId?: string; contactPhone?: string;
  eventType: string; payload: object;
}) {
  const connection = await resolveWebhookConnection(input);
  const eventKey = createHash("sha256").update(JSON.stringify({
    wabaId: input.wabaId ?? null,
    phoneNumberId: input.phoneNumberId ?? null,
    eventType: input.eventType,
    payload: input.payload,
  })).digest("hex");
  return prisma.whatsAppWebhookEvent.upsert({
    where: { eventKey },
    create: {
      eventKey, businessId: connection?.businessId ?? null, connectionId: connection?.id ?? null,
      wabaId: input.wabaId ?? null, phoneNumberId: input.phoneNumberId ?? null,
      providerMessageId: input.providerMessageId ?? null, contactPhone: input.contactPhone ?? null, eventType: input.eventType,
      payload: input.payload as Prisma.InputJsonValue,
    },
    update: {},
    select: { id: true, processedAt: true },
  });
}

async function processStatus(status: WhatsAppStatus, context: { wabaId?: string; phoneNumberId?: string }) {
  if (typeof status.id !== "string" || !status.id || typeof status.status !== "string") return false;
  const nextStatus = status.status.toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(allowedPreviousStatuses, nextStatus)) return false;

  const event = await persistEvent({
    ...context, providerMessageId: status.id, eventType: `STATUS_${nextStatus}`, payload: status,
  });
  if (event.processedAt) return true;

  const connection = await resolveWebhookConnection(context);
  const result = await prisma.communicationDelivery.updateMany({
    where: {
      businessId: connection?.businessId ?? "__unmatched_whatsapp_business__",
      channel: "WHATSAPP",
      providerMessageId: status.id,
      status: { in: allowedPreviousStatuses[nextStatus]! },
    },
    data: {
      status: nextStatus,
      errorMessage: nextStatus === "FAILED" ? getFailureMessage(status) : null,
    },
  });
  if (result.count > 0) {
    await prisma.whatsAppWebhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), processingError: null } });
    return true;
  }
  // Keep unmatched callbacks pending until the corresponding send is persisted.
  return false;
}

export async function replayPendingWhatsAppStatusEvents(providerMessageId: string) {
  const events = await prisma.whatsAppWebhookEvent.findMany({
    where: { providerMessageId, processedAt: null, eventType: { startsWith: "STATUS_" } },
    orderBy: { receivedAt: "asc" },
  });
  for (const event of events) {
    const status = event.payload as unknown as WhatsAppStatus;
    await processStatus(status, {
      ...(event.wabaId ? { wabaId: event.wabaId } : {}),
      ...(event.phoneNumberId ? { phoneNumberId: event.phoneNumberId } : {}),
    });
  }
}

async function processCustomerWhatsAppOptOut(message: WhatsAppMessageEvent, context: { wabaId?: string; phoneNumberId?: string }) {
  if (message.type !== "text" || typeof message.text?.body !== "string" || typeof message.from !== "string") return;
  const command = message.text.body.trim().toUpperCase().replace(/[.!?]+$/g, "");
  if (!["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REMOVE"].includes(command)) return;
  const connection = await resolveWebhookConnection(context);
  if (!connection) return;
  const phone = message.from.replace(/\D/g, "");
  if (!phone) return;
  const variants = [phone, `+${phone}`];
  if (phone.startsWith("234") && phone.length === 13) variants.push(`0${phone.slice(3)}`);
  await prisma.customer.updateMany({
    where: { businessId: connection.businessId, phone: { in: variants }, whatsappOptIn: true },
    data: { whatsappOptIn: false, whatsappOptOutAt: new Date() },
  });
}

export async function processWhatsAppWebhook(rawBody: Buffer, signature: string | undefined) {
  verifySignature(rawBody, signature);
  const payload = parsePayload(rawBody);
  let processedStatuses = 0;
  let receivedMessages = 0;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      const context = {
        ...(entry.id ? { wabaId: entry.id } : {}),
        ...(value.metadata?.phone_number_id ? { phoneNumberId: value.metadata.phone_number_id } : {}),
      };
      for (const status of value.statuses ?? []) {
        if (await processStatus(status, context)) processedStatuses += 1;
      }
      for (const message of value.messages ?? []) {
        await persistEvent({
          ...context,
          ...(typeof message.id === "string" ? { providerMessageId: message.id } : {}),
          ...(typeof message.from === "string" ? { contactPhone: message.from.replace(/\D/g, "") } : {}),
          eventType: "MESSAGE_RECEIVED",
          payload: message,
        });
        await processCustomerWhatsAppOptOut(message, context);
        receivedMessages += 1;
      }
    }
  }
  return { processedStatuses, receivedMessages };
}

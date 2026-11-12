import { createHash } from "node:crypto";
import { config } from "../../../config/index.js";
import { logger } from "../../../lib/logger.js";
import { prisma } from "../../../lib/prisma.js";
import { decryptWhatsAppAccessToken } from "../../whatsapp/whatsapp-token-crypto.js";

export interface SendWhatsAppReceiptInput {
  businessId?: string;
  customerId?: string;
  to: string;
  image: Buffer;
  caption?: string;
}

interface WhatsAppApiResponse {
  messages?: Array<{ id?: string }>;
  media?: Array<{ id?: string }>;
  id?: string;
  error?: { message?: string };
}

export function normalizeWhatsAppRecipient(value: string): string {
  const normalized = value.replace(/\D/g, "");
  return normalized.length === 11 && normalized.startsWith("0") ? "234" + normalized.slice(1) : normalized;
}

async function assertWhatsAppServiceWindow(businessId: string | undefined, recipient: string) {
  if (!businessId) return; // Legacy platform sender is retained for internal migration only.
  const contactPhone = normalizeWhatsAppRecipient(recipient);
  const inbound = await prisma.whatsAppWebhookEvent.findFirst({
    where: { businessId, contactPhone, eventType: "MESSAGE_RECEIVED" },
    orderBy: { receivedAt: "desc" },
    select: { payload: true, receivedAt: true },
  });
  const timestamp = inbound?.payload && typeof inbound.payload === "object" &&
    "timestamp" in inbound.payload && typeof inbound.payload.timestamp === "string"
    ? Number(inbound.payload.timestamp) * 1000
    : inbound?.receivedAt.getTime() ?? 0;
  if (!Number.isFinite(timestamp) || !timestamp || timestamp > Date.now() + 5 * 60 * 1000 ||
      Date.now() - timestamp > 24 * 60 * 60 * 1000) {
    throw new Error("The 24-hour WhatsApp customer-service window is closed. Use an approved template for this customer instead.");
  }
}

async function resolveCredentials(businessId?: string) {
  const { whatsappApiVersion, whatsappPhoneNumberId, whatsappAccessToken } = config.receiptDelivery;
  if (!whatsappApiVersion) throw new Error("WhatsApp provider API version is not configured");
  if (businessId) {
    const connection = await prisma.whatsAppBusinessConnection.findUnique({
      where: { businessId },
      select: { phoneNumberId: true, encryptedAccessToken: true, status: true },
    });
    if (!connection || connection.status !== "CONNECTED") {
      throw new Error("Connect this business's WhatsApp Business Account before sending messages");
    }
    return {
      whatsappApiVersion,
      whatsappPhoneNumberId: connection.phoneNumberId,
      whatsappAccessToken: decryptWhatsAppAccessToken(connection.encryptedAccessToken),
    };
  }
  // Legacy platform sender remains available only to existing internal callers
  // that have not yet been migrated to an explicit business context.
  if (!whatsappPhoneNumberId || !whatsappAccessToken) {
    throw new Error("WhatsApp provider is not configured");
  }
  return { whatsappApiVersion, whatsappPhoneNumberId, whatsappAccessToken };
}

async function persistBusinessOutbound(input: { businessId?: string; to: string; providerMessageId: string; type: "text" | "image"; body?: string }) {
  if (!input.businessId) return;
  const contactPhone = normalizeWhatsAppRecipient(input.to);
  const payload = {
    id: input.providerMessageId, to: normalizeWhatsAppRecipient(input.to), timestamp: String(Math.floor(Date.now() / 1000)),
    type: input.type,
    ...(input.type === "text" ? { text: { body: input.body ?? "" } } : { image: { caption: input.body ?? "" }, text: { body: input.body ?? "Image sent" } }),
  };
  const eventKey = createHash("sha256").update("MESSAGE_SENT:" + input.businessId + ":" + input.providerMessageId).digest("hex");
  try {
    await prisma.whatsAppWebhookEvent.create({
      data: { eventKey, businessId: input.businessId, contactPhone, eventType: "MESSAGE_SENT", providerMessageId: input.providerMessageId, payload },
    });
  } catch {
    logger.warn({ businessId: input.businessId, providerMessageId: input.providerMessageId }, "WhatsApp message sent but inbox history could not be persisted");
  }
}
export async function sendWhatsAppReceipt(input: SendWhatsAppReceiptInput): Promise<{ id: string }> {
  if (input.businessId) {
    if (!input.customerId) {
      throw new Error("A customer ID is required to verify WhatsApp receipt consent.");
    }
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, businessId: input.businessId },
      select: { phone: true, whatsappOptIn: true },
    });
    if (!customer) {
      throw new Error("Customer not found in this business.");
    }
    if (!customer.whatsappOptIn) {
      throw new Error("This customer has not explicitly opted in to WhatsApp receipts. Record their consent before sending.");
    }
    if (normalizeWhatsAppRecipient(customer.phone) !== normalizeWhatsAppRecipient(input.to)) {
      throw new Error("The WhatsApp receipt destination does not match the selected customer.");
    }
  }
  await assertWhatsAppServiceWindow(input.businessId, input.to);
  const { whatsappApiVersion, whatsappPhoneNumberId, whatsappAccessToken } = await resolveCredentials(input.businessId);
  const mediaForm = new FormData();
  mediaForm.append("messaging_product", "whatsapp");
  mediaForm.append("file", new Blob([input.image], { type: "image/png" }), "receipt.png");
  mediaForm.append("type", "image/png");

  const mediaResponse = await fetch(
    `https://graph.facebook.com/${whatsappApiVersion}/${whatsappPhoneNumberId}/media`,
    { method: "POST", headers: { Authorization: `Bearer ${whatsappAccessToken}` }, body: mediaForm },
  );
  const mediaPayload = await mediaResponse.json() as WhatsAppApiResponse;
  if (!mediaResponse.ok) {
    throw new Error(`WhatsApp media upload failed: ${mediaPayload.error?.message ?? `HTTP ${mediaResponse.status}`}`);
  }
  const mediaId = mediaPayload.id ?? mediaPayload.media?.[0]?.id;
  if (!mediaId) throw new Error("WhatsApp media upload returned no media ID");

  const messageResponse = await fetch(
    `https://graph.facebook.com/${whatsappApiVersion}/${whatsappPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${whatsappAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", recipient_type: "individual", to: normalizeWhatsAppRecipient(input.to),
        type: "image", image: { id: mediaId, ...(input.caption ? { caption: input.caption } : {}) },
      }),
    },
  );
  const messagePayload = await messageResponse.json() as WhatsAppApiResponse;
  if (!messageResponse.ok) {
    throw new Error(`WhatsApp delivery failed: ${messagePayload.error?.message ?? `HTTP ${messageResponse.status}`}`);
  }
  const id = messagePayload.messages?.[0]?.id;
  if (!id) throw new Error("WhatsApp delivery returned no message ID");
  await persistBusinessOutbound({ ...(input.businessId ? { businessId: input.businessId } : {}), to: normalizeWhatsAppRecipient(input.to), providerMessageId: id, type: "image", ...(input.caption !== undefined ? { body: input.caption } : {}) });
  return { id };
}

export interface SendWhatsAppTextInput {
  businessId?: string;
  to: string;
  body: string;
}

export async function sendWhatsAppText(input: SendWhatsAppTextInput): Promise<{ id: string }> {
  await assertWhatsAppServiceWindow(input.businessId, input.to);
  const { whatsappApiVersion, whatsappPhoneNumberId, whatsappAccessToken } = await resolveCredentials(input.businessId);
  const response = await fetch(
    `https://graph.facebook.com/${whatsappApiVersion}/${whatsappPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${whatsappAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", recipient_type: "individual", to: normalizeWhatsAppRecipient(input.to),
        type: "text", text: { preview_url: false, body: input.body },
      }),
    },
  );
  const payload = await response.json() as WhatsAppApiResponse;
  if (!response.ok) {
    throw new Error(`WhatsApp delivery failed: ${payload.error?.message ?? `HTTP ${response.status}`}`);
  }
  const id = payload.messages?.[0]?.id;
  if (!id) throw new Error("WhatsApp delivery returned no message ID");
  await persistBusinessOutbound({ ...(input.businessId ? { businessId: input.businessId } : {}), to: normalizeWhatsAppRecipient(input.to), providerMessageId: id, type: "text", body: input.body });
  return { id };
}

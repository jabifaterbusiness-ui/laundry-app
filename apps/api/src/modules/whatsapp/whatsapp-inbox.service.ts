import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { normalizeWhatsAppRecipient, sendWhatsAppText } from "../invoices/providers/whatsapp.provider.js";

type MessageMedia = { id?: string; mime_type?: string; caption?: string; filename?: string };
type MessagePayload = {
  id?: string;
  from?: string;
  to?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: MessageMedia;
  video?: MessageMedia;
  audio?: MessageMedia;
  document?: MessageMedia;
  sticker?: MessageMedia;
  status?: string;
};

function digits(value: string) {
  return normalizeWhatsAppRecipient(value);
}

function messageText(payload: MessagePayload) {
  if (payload.text?.body) return payload.text.body;
  if (payload.type === "image") return payload.image?.caption || "Image received";
  if (payload.type === "audio" || payload.type === "voice") return "Audio message received";
  if (payload.type === "document") return payload.document?.caption || payload.document?.filename || "Document received";
  if (payload.type === "video") return payload.video?.caption || "Video received";
  if (payload.type === "location") return "Location received";
  return `${payload.type ?? "WhatsApp"} message received`;
}

function mediaDetails(payload: MessagePayload) {
  const media = payload.type === "image" ? payload.image
    : payload.type === "video" ? payload.video
      : payload.type === "audio" ? payload.audio
        : payload.type === "document" ? payload.document
          : payload.type === "sticker" ? payload.sticker : undefined;
  return {
    mediaId: media?.id ?? null,
    mediaMimeType: media?.mime_type ?? null,
    mediaCaption: media?.caption ?? null,
    mediaFilename: media?.filename ?? null,
  };
}

async function loadBusinessEvents(businessId: string) {
  return prisma.whatsAppWebhookEvent.findMany({
    where: { businessId, eventType: { in: ["MESSAGE_RECEIVED", "MESSAGE_SENT", "STATUS_SENT", "STATUS_DELIVERED", "STATUS_READ", "STATUS_FAILED"] } },
    orderBy: { receivedAt: "desc" },
    take: 1000,
    select: { id: true, eventType: true, payload: true, providerMessageId: true, receivedAt: true, processedAt: true },
  });
}

export async function listWhatsAppConversations(businessId: string) {
  const events = await loadBusinessEvents(businessId);
  const statusByMessageId = new Map<string, string>();
  // Apply callbacks in arrival order using the same monotonic transition rules
  // as the delivery updater. A late DELIVERED callback must not turn a FAILED
  // message into DELIVERED, just as a late FAILED callback cannot downgrade it.
  const statusEvents = events
    .filter((event) => event.eventType.startsWith("STATUS_") && event.providerMessageId)
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  for (const event of statusEvents) {
    const messageId = event.providerMessageId!;
    const next = event.eventType.slice(7);
    const current = statusByMessageId.get(messageId) ?? "SENT";
    if (next === "DELIVERED" && current === "SENT") statusByMessageId.set(messageId, "DELIVERED");
    else if (next === "READ" && (current === "SENT" || current === "DELIVERED")) statusByMessageId.set(messageId, "READ");
    else if (next === "FAILED" && current === "SENT") statusByMessageId.set(messageId, "FAILED");
  }

  const messages = events
    .filter((event) => event.eventType === "MESSAGE_RECEIVED" || event.eventType === "MESSAGE_SENT")
    .map((event) => {
      const payload = event.payload as MessagePayload;
      const direction = event.eventType === "MESSAGE_RECEIVED" ? "INBOUND" : "OUTBOUND";
      const phone = direction === "INBOUND" ? payload.from : payload.to;
      return {
        id: event.id,
        providerMessageId: event.providerMessageId ?? payload.id ?? null,
        direction,
        phone: phone ?? "",
        text: messageText(payload),
        messageType: payload.type ?? "text",
        ...mediaDetails(payload),
        timestamp: payload.timestamp ? new Date(Number(payload.timestamp) * 1000).toISOString() : event.receivedAt.toISOString(),
        status: event.providerMessageId ? (statusByMessageId.get(event.providerMessageId) ?? (direction === "OUTBOUND" ? "SENT" : "RECEIVED")) : direction === "OUTBOUND" ? "SENT" : "RECEIVED",
      };
    })
    .filter((message) => message.phone);

  const phones = [...new Set(messages.map((message) => digits(message.phone)).filter(Boolean))];
  const customers = phones.length
    ? await prisma.customer.findMany({ where: { businessId, phone: { in: [...phones, ...phones.map((phone) => "+" + phone), ...phones.filter((phone) => phone.startsWith("234") && phone.length === 13).map((phone) => "0" + phone.slice(3))] } }, select: { id: true, name: true, phone: true } })
    : [];
  const customerByPhone = new Map(customers.map((customer) => [digits(customer.phone), customer]));

  const conversations = new Map<string, {
    customerId: string | null; customerName: string; phone: string; lastMessage: string;
    lastMessageAt: string; lastDirection: string; lastStatus: string; unreadCount: number;
    messages: typeof messages;
  }>();

  for (const message of messages) {
    const key = digits(message.phone);
    const customer = customerByPhone.get(key);
    const current = conversations.get(key) ?? {
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? message.phone,
      phone: message.phone,
      lastMessage: message.text,
      lastMessageAt: message.timestamp,
      lastDirection: message.direction,
      lastStatus: message.status,
      unreadCount: 0,
      messages: [],
    };
    current.messages.push(message);
    if (message.direction === "INBOUND" && !events.find((event) => event.id === message.id)?.processedAt) current.unreadCount += 1;
    if (new Date(message.timestamp).getTime() > new Date(current.lastMessageAt).getTime()) {
      current.lastMessage = message.text;
      current.lastMessageAt = message.timestamp;
      current.lastDirection = message.direction;
      current.lastStatus = message.status;
    }
    conversations.set(key, current);
  }

  return [...conversations.values()]
    .map((conversation) => ({ ...conversation, messages: conversation.messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp)) }))
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export async function sendWhatsAppConversationReply(input: {
  businessId: string; customerId?: string | null; phone: string; body: string;
}) {
  const body = input.body.trim();
  if (!body || body.length > 4096) throw new AppError("Reply must contain between 1 and 4,096 characters", 422);

  let recipient = normalizeWhatsAppRecipient(input.phone);
  let customerName = recipient;
  let customerId: string | null = null;
  if (input.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, businessId: input.businessId },
      select: { id: true, name: true, phone: true },
    });
    if (!customer) throw new AppError("Customer not found in this business", 404);
    recipient = normalizeWhatsAppRecipient(customer.phone);
    customerName = customer.name;
    customerId = customer.id;
  }
  if (!recipient || recipient.length < 8 || recipient.length > 15) {
    throw new AppError("The WhatsApp contact number is invalid", 422);
  }

  const connection = await prisma.whatsAppBusinessConnection.findUnique({
    where: { businessId: input.businessId },
    select: { status: true },
  });
  if (!connection || connection.status !== "CONNECTED") {
    throw new AppError("Connect this business's WhatsApp number before replying", 409);
  }

  const lastInbound = await prisma.whatsAppWebhookEvent.findFirst({
    where: { businessId: input.businessId, contactPhone: recipient, eventType: "MESSAGE_RECEIVED" },
    orderBy: { receivedAt: "desc" },
    select: { payload: true, receivedAt: true },
  });
  const lastInboundAt = lastInbound?.payload && (lastInbound.payload as MessagePayload).timestamp
    ? Number((lastInbound.payload as MessagePayload).timestamp) * 1000
    : lastInbound?.receivedAt.getTime() ?? 0;
  if (!Number.isFinite(lastInboundAt) || !lastInboundAt || lastInboundAt > Date.now() + 5 * 60 * 1000 || Date.now() - lastInboundAt > 24 * 60 * 60 * 1000) {
    throw new AppError("The 24-hour customer-service window has expired. Send an approved WhatsApp template to restart the conversation.", 409);
  }

  const sent = await sendWhatsAppText({ businessId: input.businessId, to: recipient, body });
  return { id: sent.id, customerId, customerName, phone: recipient, body, sentAt: new Date().toISOString(), status: "SENT" };
}

export async function markWhatsAppConversationRead(input: { businessId: string; customerId?: string | null; phone: string }) {
  let contactPhone = normalizeWhatsAppRecipient(input.phone);
  if (input.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, businessId: input.businessId },
      select: { phone: true },
    });
    if (!customer) throw new AppError("Customer not found in this business", 404);
    contactPhone = normalizeWhatsAppRecipient(customer.phone);
  }
  const inbound = await prisma.whatsAppWebhookEvent.findMany({
    where: { businessId: input.businessId, contactPhone, eventType: "MESSAGE_RECEIVED", processedAt: null },
    select: { id: true },
  });
  const matchingIds = inbound.map((event) => event.id);
  if (matchingIds.length) {
    await prisma.whatsAppWebhookEvent.updateMany({
      where: { businessId: input.businessId, id: { in: matchingIds }, processedAt: null },
      data: { processedAt: new Date() },
    });
  }
  return { markedRead: matchingIds.length };
}

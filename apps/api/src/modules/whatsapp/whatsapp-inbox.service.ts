import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { sendWhatsAppText } from "../invoices/providers/whatsapp.provider.js";

type MessagePayload = {
  id?: string;
  from?: string;
  to?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  status?: string;
};

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function messageText(payload: MessagePayload) {
  if (payload.text?.body) return payload.text.body;
  if (payload.type === "image") return "Image received";
  if (payload.type === "audio" || payload.type === "voice") return "Audio message received";
  if (payload.type === "document") return "Document received";
  if (payload.type === "video") return "Video received";
  if (payload.type === "location") return "Location received";
  return `${payload.type ?? "WhatsApp"} message received`;
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
  for (const event of events) {
    if (event.eventType.startsWith("STATUS_") && event.providerMessageId && !statusByMessageId.has(event.providerMessageId)) {
      statusByMessageId.set(event.providerMessageId, event.eventType.slice(7));
    }
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
        timestamp: payload.timestamp ? new Date(Number(payload.timestamp) * 1000).toISOString() : event.receivedAt.toISOString(),
        status: event.providerMessageId ? statusByMessageId.get(event.providerMessageId) ?? (direction === "OUTBOUND" ? "SENT" : "RECEIVED") : direction === "OUTBOUND" ? "SENT" : "RECEIVED",
      };
    })
    .filter((message) => message.phone);

  const phones = [...new Set(messages.map((message) => digits(message.phone)).filter(Boolean))];
  const customers = phones.length
    ? await prisma.customer.findMany({ where: { businessId, phone: { in: [...phones, ...phones.map((phone) => "+" + phone)] } }, select: { id: true, name: true, phone: true } })
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
  businessId: string; customerId: string; body: string;
}) {
  const body = input.body.trim();
  if (!body || body.length > 4096) throw new AppError("Reply must contain between 1 and 4,096 characters", 422);

  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, businessId: input.businessId },
    select: { id: true, name: true, phone: true },
  });
  if (!customer) throw new AppError("Customer not found in this business", 404);

  const connection = await prisma.whatsAppBusinessConnection.findUnique({
    where: { businessId: input.businessId },
    select: { status: true },
  });
  if (!connection || connection.status !== "CONNECTED") {
    throw new AppError("Connect this business's WhatsApp number before replying", 409);
  }

  const customerDigits = digits(customer.phone);
  const lastInbound = await prisma.whatsAppWebhookEvent.findFirst({
    where: { businessId: input.businessId, contactPhone: customerDigits, eventType: "MESSAGE_RECEIVED" },
    orderBy: { receivedAt: "desc" },
    select: { payload: true, receivedAt: true },
  });
  const lastInboundAt = lastInbound?.payload && (lastInbound.payload as MessagePayload).timestamp
    ? Number((lastInbound.payload as MessagePayload).timestamp) * 1000
    : lastInbound?.receivedAt.getTime() ?? 0;
  if (!lastInboundAt || Date.now() - lastInboundAt > 24 * 60 * 60 * 1000) {
    throw new AppError("The 24-hour customer-service window has expired. Send an approved WhatsApp template to restart the conversation.", 409);
  }

  const sent = await sendWhatsAppText({ businessId: input.businessId, to: customer.phone, body });
  return { id: sent.id, customerId: customer.id, customerName: customer.name, phone: customer.phone, body, sentAt: new Date().toISOString(), status: "SENT" };
}

export async function markWhatsAppConversationRead(input: { businessId: string; customerId: string }) {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, businessId: input.businessId },
    select: { phone: true },
  });
  if (!customer) throw new AppError("Customer not found in this business", 404);
  const inbound = await prisma.whatsAppWebhookEvent.findMany({
    where: { businessId: input.businessId, contactPhone: digits(customer.phone), eventType: "MESSAGE_RECEIVED", processedAt: null },
    select: { id: true, payload: true },
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

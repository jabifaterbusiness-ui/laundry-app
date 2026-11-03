import { createHash } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { sendHtmlEmail } from "../invoices/providers/resend.provider.js";
import { sendWhatsAppText } from "../invoices/providers/whatsapp.provider.js";
import { assertWhatsAppMessagingEnabled } from "../platform/platform-controls.middleware.js";

type Channel = "WHATSAPP" | "EMAIL";
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");
}
async function recordMissingDestination(input: {
  businessId: string; customerId: string; orderId?: string; campaignId?: string;
  channel: Channel; messageType: string; dedupeKey: string; reason: string;
}) {
  try {
    const delivery = await prisma.communicationDelivery.create({
      data: {
        businessId: input.businessId, customerId: input.customerId,
        orderId: input.orderId ?? null, campaignId: input.campaignId ?? null,
        channel: input.channel, messageType: input.messageType,
        destination: "", status: "FAILED", errorMessage: input.reason,
        dedupeKey: input.dedupeKey,
      },
    });
    return { status: "FAILED" as const, deliveryId: delivery.id, error: input.reason };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return { status: "DUPLICATE" as const };
    throw error;
  }
}

async function deliverMessage(input: {
  businessId: string; customerId: string; orderId?: string; campaignId?: string;
  channel: Channel; messageType: string; destination: string; subject: string;
  body: string; dedupeKey: string;
}) {
  let delivery;
  try {
    delivery = await prisma.communicationDelivery.create({
      data: {
        businessId: input.businessId, customerId: input.customerId,
        orderId: input.orderId ?? null, campaignId: input.campaignId ?? null,
        channel: input.channel, messageType: input.messageType,
        destination: input.destination, dedupeKey: input.dedupeKey,
        status: "PENDING",
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return { status: "DUPLICATE" as const };
    }
    throw error;
  }
  try {
    let providerMessageId: string;
    if (input.channel === "EMAIL") {
      providerMessageId = (await sendHtmlEmail({
        to: input.destination,
        subject: input.subject,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;white-space:pre-wrap">${escapeHtml(input.body).replace(/\n/g, "<br>")}</div>`,
      })).id;
    } else {
      await assertWhatsAppMessagingEnabled();
      providerMessageId = (await sendWhatsAppText({ to: input.destination, body: input.body })).id;
    }
    await prisma.communicationDelivery.update({
      where: { id: delivery.id },
      data: { status: "SENT", providerMessageId, sentAt: new Date() },
    });
    return { status: "SENT" as const, deliveryId: delivery.id, providerMessageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Message delivery failed";
    await prisma.communicationDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", errorMessage: message.slice(0, 1000) },
    });
    return { status: "FAILED" as const, deliveryId: delivery.id, error: message };
  }
}

export async function notifyOrderStatus(input: { orderId: string; businessId: string; branchId: string; status: string }) {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, businessId: input.businessId, branchId: input.branchId },
    include: { customer: true, business: { select: { name: true } } },
  });
  if (!order) return [];
  const rule = await prisma.orderStatusNotificationRule.findFirst({
    where: { businessId: input.businessId, status: input.status, enabled: true },
  });
  if (!rule) return [];
  const values = {
    customerName: order.customer.name,
    orderNumber: order.orderNumber,
    companyName: order.business.name,
    status: input.status.replaceAll("_", " ").toLowerCase(),
  };
  const channels: Channel[] = rule.channel === "BOTH" ? ["WHATSAPP", "EMAIL"] : [rule.channel as Channel];
  const results = [];
  for (const channel of channels) {
    const destination = channel === "EMAIL" ? order.customer.email : order.customer.phone;
    if (!destination) {
      results.push(await recordMissingDestination({
        businessId: input.businessId, customerId: order.customerId, orderId: order.id,
        channel, messageType: "ORDER_STATUS",
        dedupeKey: `order-status:${order.id}:${rule.id}:${input.status}:${channel}`,
        reason: channel === "EMAIL" ? "Customer email is missing" : "Customer phone is missing",
      }));
      continue;
    }
    const fallback = channel === "WHATSAPP"
      ? "Hello {{customerName}}, your order {{orderNumber}} is now {{status}}. Thank you for choosing {{companyName}}."
      : "Hello {{customerName}},\n\nYour order {{orderNumber}} is now {{status}}.\n\nThank you for choosing {{companyName}}.";
    results.push(await deliverMessage({
      businessId: input.businessId, customerId: order.customerId, orderId: order.id,
      channel, messageType: "ORDER_STATUS", destination,
      subject: renderTemplate(rule.emailSubject || "Order update from {{companyName}}", values),
      body: renderTemplate((channel === "EMAIL" ? rule.emailMessage : rule.whatsappMessage) || fallback, values),
      dedupeKey: `order-status:${order.id}:${rule.id}:${input.status}:${channel}`,
    }));
  }
  return results;
}

export async function listOrderStatusRules(businessId: string) {
  return prisma.orderStatusNotificationRule.findMany({ where: { businessId }, orderBy: { status: "asc" } });
}
export async function saveOrderStatusRule(input: {
  businessId: string; status: string; enabled: boolean; channel: "WHATSAPP" | "EMAIL" | "BOTH";
  whatsappMessage?: string | null; emailSubject?: string | null; emailMessage?: string | null;
}) {
  return prisma.orderStatusNotificationRule.upsert({
    where: { businessId_status: { businessId: input.businessId, status: input.status } },
    create: input,
    update: {
      enabled: input.enabled, channel: input.channel,
      whatsappMessage: input.whatsappMessage ?? null,
      emailSubject: input.emailSubject ?? null,
      emailMessage: input.emailMessage ?? null,
    },
  });
}
export async function removeOrderStatusRule(id: string, businessId: string) {
  const result = await prisma.orderStatusNotificationRule.deleteMany({ where: { id, businessId } });
  if (!result.count) throw new AppError("Notification rule not found", 404);
}

export async function createAnnouncement(input: {
  businessId: string; createdByUserId: string; title: string; message: string;
  channels: Channel[]; audience: "ALL_CUSTOMERS" | "SELECTED_CUSTOMERS"; customerIds?: string[];
}) {
  if (!input.channels.length) throw new AppError("Choose at least one delivery channel", 422);
  const customers = input.audience === "ALL_CUSTOMERS"
    ? await prisma.customer.findMany({ where: { businessId: input.businessId, lifecycleStatus: "ACTIVE" }, select: { id: true, name: true, email: true, phone: true } })
    : await prisma.customer.findMany({ where: { businessId: input.businessId, id: { in: [...new Set(input.customerIds ?? [])] }, lifecycleStatus: "ACTIVE" }, select: { id: true, name: true, email: true, phone: true } });
  if (input.audience === "SELECTED_CUSTOMERS" && customers.length !== new Set(input.customerIds ?? []).size) {
    throw new AppError("One or more selected customers are unavailable", 422);
  }
  if (!customers.length) throw new AppError("No active customers match this announcement", 422);
  if (customers.length > 2000) throw new AppError("An announcement is limited to 2,000 customers per campaign", 422);
  const campaign = await prisma.announcementCampaign.create({
    data: {
      businessId: input.businessId, createdByUserId: input.createdByUserId,
      title: input.title, message: input.message, channels: input.channels,
      audience: input.audience, status: "SENDING",
      recipients: { create: customers.map((customer) => ({ customerId: customer.id })) },
    },
  });
  const jobs = customers.flatMap((customer) => input.channels.map((channel) => async () => {
    const destination = channel === "EMAIL" ? customer.email : customer.phone;
    if (!destination) {
      const result = await recordMissingDestination({
        businessId: input.businessId, customerId: customer.id, campaignId: campaign.id,
        channel, messageType: "ANNOUNCEMENT",
        dedupeKey: `announcement:${campaign.id}:${customer.id}:${channel}`,
        reason: channel === "EMAIL" ? "Missing email address" : "Missing phone number",
      });
      return { ...result, customerId: customer.id, channel };
    }
    const result = await deliverMessage({
      businessId: input.businessId, customerId: customer.id, campaignId: campaign.id,
      channel, messageType: "ANNOUNCEMENT", destination, subject: input.title,
      body: renderTemplate(input.message, { customerName: customer.name, companyName: "" }),
      dedupeKey: `announcement:${campaign.id}:${customer.id}:${channel}`,
    });
    return { ...result, customerId: customer.id, channel };
  }));
  const results: Array<{ status: string; customerId: string; channel: Channel; error?: string }> = [];
  for (let offset = 0; offset < jobs.length; offset += 10) {
    results.push(...await Promise.all(jobs.slice(offset, offset + 10).map((job) => job())));
  }
  const failed = results.filter((result) => result.status === "FAILED").length;
  await prisma.announcementCampaign.update({
    where: { id: campaign.id },
    data: { status: failed === results.length ? "FAILED" : failed ? "PARTIAL" : "SENT" },
  });
  return { campaignId: campaign.id, recipientCount: customers.length, results };
}

export async function getUnpickedOrderReminderConfig(businessId: string) {
  return prisma.unpickedOrderReminderConfig.upsert({
    where: { businessId },
    create: { businessId },
    update: {},
  });
}
export async function saveUnpickedOrderReminderConfig(businessId: string, input: { enabled: boolean; thresholdMonths: number }) {
  return prisma.unpickedOrderReminderConfig.upsert({
    where: { businessId }, create: { businessId, ...input }, update: input,
  });
}
export async function listUnpickedOrders(businessId: string) {
  const config = await getUnpickedOrderReminderConfig(businessId);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - config.thresholdMonths);
  if (!config.enabled) return [];
  return prisma.order.findMany({
    where: { businessId, status: "READY_FOR_PICKUP", readyAt: { lte: cutoff } },
    include: { customer: true, branch: true, items: true, invoice: true },
    orderBy: { createdAt: "asc" },
  });
}
export async function sendUnpickedReminders(input: {
  businessId: string; orderIds: string[]; channels: Channel[]; message: string;
}) {
  if (!input.channels.length) throw new AppError("Choose at least one delivery channel", 422);
  const config = await getUnpickedOrderReminderConfig(input.businessId);
  if (!config.enabled) throw new AppError("Unpicked-order reminders are disabled for this business", 422);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - config.thresholdMonths);
  const orders = await prisma.order.findMany({
    where: { businessId: input.businessId, id: { in: [...new Set(input.orderIds)] }, status: "READY_FOR_PICKUP", readyAt: { lte: cutoff } },
    include: { customer: true, business: { select: { name: true } } },
  });
  if (orders.length !== new Set(input.orderIds).size) throw new AppError("One or more selected unpicked orders are unavailable", 422);
  const jobs = orders.flatMap((order) => input.channels.map((channel) => async () => {
    const destination = channel === "EMAIL" ? order.customer.email : order.customer.phone;
    const dedupeKey = `unpicked-reminder:${order.id}:${channel}:${new Date().toISOString().slice(0, 10)}:${createHash("sha256").update(input.message).digest("hex")}`;
    if (!destination) {
      const result = await recordMissingDestination({
        businessId: input.businessId, customerId: order.customerId, orderId: order.id,
        channel, messageType: "UNPICKED_REMINDER", dedupeKey,
        reason: "Customer contact is missing",
      });
      return { ...result, orderId: order.id, channel };
    }
    const body = renderTemplate(input.message, { customerName: order.customer.name, orderNumber: order.orderNumber, companyName: order.business.name, status: "ready for pickup" });
    const result = await deliverMessage({
      businessId: input.businessId, customerId: order.customerId, orderId: order.id,
      channel, messageType: "UNPICKED_REMINDER", destination, subject: `Unpicked order ${order.orderNumber}`,
      body, dedupeKey,
    });
    return { ...result, orderId: order.id, channel };
  }));
  const results = [];
  for (let offset = 0; offset < jobs.length; offset += 10) {
    results.push(...await Promise.all(jobs.slice(offset, offset + 10).map((job) => job())));
  }
  return { orderCount: orders.length, results };
}


export async function listCommunicationDeliveries(businessId: string) {
  return prisma.communicationDelivery.findMany({
    where: { businessId },
    include: {
      customer: { select: { id: true, name: true } },
      order: { select: { id: true, orderNumber: true } },
      campaign: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

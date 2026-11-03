import { createHash } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { sendHtmlEmail } from "../invoices/providers/resend.provider.js";
import { sendWhatsAppText } from "../invoices/providers/whatsapp.provider.js";
import { assertWhatsAppMessagingEnabled } from "../platform/platform-controls.middleware.js";

type Channel = "WHATSAPP" | "EMAIL";
const DEFAULT_READY_WHATSAPP_MESSAGE = "Hello {{customerName}}, your order {{orderNumber}} is ready for pickup. Thank you for choosing {{companyName}}.";

async function ensureDefaultReadyRule(businessId: string) {
  return prisma.orderStatusNotificationRule.upsert({
    where: { businessId_status: { businessId, status: "READY_FOR_PICKUP" } },
    create: {
      businessId, status: "READY_FOR_PICKUP", enabled: true, channel: "WHATSAPP",
      whatsappMessage: DEFAULT_READY_WHATSAPP_MESSAGE,
      emailSubject: "Your laundry is ready for pickup",
      emailMessage: "Hello {{customerName}}, your order {{orderNumber}} is ready for pickup. Thank you for choosing {{companyName}}.",
    },
    update: {},
  });
}
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
  const configuredRule = input.status === "READY_FOR_PICKUP"
    ? await ensureDefaultReadyRule(input.businessId)
    : await prisma.orderStatusNotificationRule.findFirst({
        where: { businessId: input.businessId, status: input.status },
      });
  const rule = configuredRule?.enabled ? configuredRule : null;
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
  await ensureDefaultReadyRule(businessId);
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

export async function listCustomerGroups(businessId: string) {
  return prisma.customerGroup.findMany({
    where: { businessId },
    include: { _count: { select: { members: true } }, members: { select: { customerId: true } } },
    orderBy: { name: "asc" },
  });
}

export async function saveCustomerGroup(input: {
  businessId: string; name: string; description?: string | null; customerIds: string[];
}) {
  const ids = [...new Set(input.customerIds)];
  const customers = ids.length ? await prisma.customer.findMany({
    where: { businessId: input.businessId, id: { in: ids } },
    select: { id: true },
  }) : [];
  if (customers.length !== ids.length) throw new AppError("One or more selected customers are unavailable", 422);
  const existing = await prisma.customerGroup.findFirst({
    where: { businessId: input.businessId, name: input.name },
    select: { id: true },
  });
  if (existing) throw new AppError("A customer group with this name already exists", 409);
  try {
    return await prisma.customerGroup.create({
      data: {
        businessId: input.businessId, name: input.name, description: input.description ?? null,
        members: { create: ids.map((customerId) => ({ businessId: input.businessId, customerId })) },
      },
      include: { _count: { select: { members: true } }, members: { select: { customerId: true } } },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new AppError("A customer group with this name already exists", 409);
    }
    throw error;
  }
}

export async function updateCustomerGroup(input: {
  businessId: string; groupId: string; name: string; description?: string | null; customerIds: string[];
}) {
  const ids = [...new Set(input.customerIds)];
  const [group, customers] = await Promise.all([
    prisma.customerGroup.findFirst({ where: { id: input.groupId, businessId: input.businessId }, select: { id: true } }),
    ids.length ? prisma.customer.findMany({ where: { businessId: input.businessId, id: { in: ids } }, select: { id: true } }) : [],
  ]);
  if (!group) throw new AppError("Customer group not found", 404);
  if (customers.length !== ids.length) throw new AppError("One or more selected customers are unavailable", 422);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.customerGroup.update({ where: { id: group.id }, data: { name: input.name, description: input.description ?? null } });
      await tx.customerGroupMember.deleteMany({ where: { businessId: input.businessId, groupId: group.id } });
      if (ids.length) await tx.customerGroupMember.createMany({ data: ids.map((customerId) => ({ businessId: input.businessId, groupId: group.id, customerId })) });
      return tx.customerGroup.findUniqueOrThrow({
        where: { id: group.id },
        include: { _count: { select: { members: true } }, members: { select: { customerId: true } } },
      });
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new AppError("A customer group with this name already exists", 409);
    throw error;
  }
}

export async function deleteCustomerGroup(groupId: string, businessId: string) {
  const result = await prisma.customerGroup.deleteMany({ where: { id: groupId, businessId } });
  if (!result.count) throw new AppError("Customer group not found", 404);
}

export async function createAnnouncement(input: {
  businessId: string; createdByUserId: string; title: string; message: string;
  channels: Channel[]; audience: "ALL_CUSTOMERS" | "SELECTED_CUSTOMERS" | "CUSTOMER_GROUP"; customerIds?: string[]; groupId?: string;
}) {
  if (!input.channels.length) throw new AppError("Choose at least one delivery channel", 422);
  let customers;
  if (input.audience === "ALL_CUSTOMERS") {
    customers = await prisma.customer.findMany({
      where: { businessId: input.businessId, lifecycleStatus: "ACTIVE" },
      select: { id: true, name: true, email: true, phone: true },
    });
  } else if (input.audience === "SELECTED_CUSTOMERS") {
    const ids = [...new Set(input.customerIds ?? [])];
    customers = await prisma.customer.findMany({
      where: { businessId: input.businessId, id: { in: ids }, lifecycleStatus: "ACTIVE" },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (customers.length !== ids.length) throw new AppError("One or more selected customers are unavailable", 422);
  } else {
    const group = await prisma.customerGroup.findFirst({
      where: { id: input.groupId, businessId: input.businessId },
      include: { members: { where: { businessId: input.businessId, customer: { lifecycleStatus: "ACTIVE" } }, include: { customer: { select: { id: true, name: true, email: true, phone: true } } } } },
    });
    if (!group) throw new AppError("Customer group not found", 404);
    customers = group.members.map((member) => member.customer);
  }
  if (!customers.length) throw new AppError("No active customers match this announcement", 422);
  if (customers.length > 2000) throw new AppError("An announcement is limited to 2,000 customers per campaign", 422);
  const companyName = (await prisma.business.findUnique({ where: { id: input.businessId }, select: { name: true } }))?.name ?? "";
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
      body: renderTemplate(input.message, { customerName: customer.name, companyName }),
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
export async function listUnpickedOrders(businessId: string, branchId: string) {
  const config = await getUnpickedOrderReminderConfig(businessId);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - config.thresholdMonths);
  if (!config.enabled) return [];
  return prisma.order.findMany({
    where: { businessId, branchId, status: "READY_FOR_PICKUP", OR: [{ readyAt: { lte: cutoff } }, { readyAt: null, createdAt: { lte: cutoff } }] },
    include: { customer: true, branch: true, items: true, invoice: true },
    orderBy: { createdAt: "asc" },
  });
}
export async function sendUnpickedReminders(input: {
  businessId: string; branchId: string; orderIds: string[]; channels: Channel[]; message: string;
}) {
  if (!input.channels.length) throw new AppError("Choose at least one delivery channel", 422);
  const config = await getUnpickedOrderReminderConfig(input.businessId);
  if (!config.enabled) throw new AppError("Unpicked-order reminders are disabled for this business", 422);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - config.thresholdMonths);
  const orders = await prisma.order.findMany({
    where: { businessId: input.businessId, branchId: input.branchId, id: { in: [...new Set(input.orderIds)] }, status: "READY_FOR_PICKUP", OR: [{ readyAt: { lte: cutoff } }, { readyAt: null, createdAt: { lte: cutoff } }] },
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

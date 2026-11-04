import { createHash } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { config } from "../../config/index.js";
import { AppError } from "../../middleware/error-handler.js";
import { decryptWhatsAppAccessToken } from "./whatsapp-token-crypto.js";
import { normalizeWhatsAppRecipient } from "../invoices/providers/whatsapp.provider.js";
import { replayPendingWhatsAppStatusEvents } from "./whatsapp-webhook.service.js";

type TemplateComponent = { type?: string; text?: string; format?: string; buttons?: Array<{ type?: string; url?: string }> };
type MetaTemplate = { id: string; name: string; status: string; language: string; category: string; components?: TemplateComponent[] };
type TemplateListResponse = { data?: MetaTemplate[]; paging?: { next?: string }; error?: { message?: string } };

async function getConnection(businessId: string) {
  const connection = await prisma.whatsAppBusinessConnection.findUnique({
    where: { businessId },
    select: { wabaId: true, phoneNumberId: true, encryptedAccessToken: true, status: true },
  });
  if (!connection || connection.status !== "CONNECTED") throw new AppError("Connect this business's WhatsApp number first", 409);
  const apiVersion = config.receiptDelivery.whatsappApiVersion;
  if (!apiVersion) throw new AppError("WhatsApp API version is not configured by the platform", 503);
  return { ...connection, apiVersion, token: decryptWhatsAppAccessToken(connection.encryptedAccessToken) };
}

function bodyVariableCount(template: MetaTemplate) {
  const body = template.components?.find((component) => component.type === "BODY")?.text ?? "";
  return [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].length;
}

export async function listApprovedWhatsAppTemplates(businessId: string) {
  const connection = await getConnection(businessId);
  const url = new URL(`https://graph.facebook.com/${connection.apiVersion}/${connection.wabaId}/message_templates`);
  url.searchParams.set("fields", "id,name,status,language,category,components");
  url.searchParams.set("limit", "100");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${connection.token}` } });
  const payload = await response.json() as TemplateListResponse;
  if (!response.ok) throw new AppError(payload.error?.message ?? "Unable to load WhatsApp templates from Meta", 502);
  return (payload.data ?? [])
    .filter((template) => template.status === "APPROVED")
    // The inbox composer currently supports BODY text variables. Hide templates
    // requiring dynamic header or URL-button parameters rather than offering
    // a send action that Meta would reject.
    .filter((template) => !(template.components ?? []).some((component) =>
      (component.type === "HEADER" && ((component.format && component.format !== "TEXT") || (typeof component.text === "string" && /\{\{\s*\d+\s*\}\}/.test(component.text)))) ||
      (component.type === "BUTTONS" && (component.buttons ?? []).some((button) => typeof button.url === "string" && /\{\{\s*\d+\s*\}\}/.test(button.url)))
    ))
    .map((template) => ({
      id: template.id, name: template.name, language: template.language, category: template.category,
      bodyVariableCount: bodyVariableCount(template),
    }));
}

export async function sendApprovedWhatsAppTemplate(input: {
  businessId: string; customerId?: string; phone: string; templateName: string; language: string; variables: string[];
}) {
  const connection = await getConnection(input.businessId);
  let recipient = normalizeWhatsAppRecipient(input.phone);
  let customerId: string | null = null;
  if (input.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, businessId: input.businessId },
      select: { id: true, phone: true },
    });
    if (!customer) throw new AppError("Customer not found in this business", 404);
    recipient = normalizeWhatsAppRecipient(customer.phone);
    customerId = customer.id;
  } else {
    const priorInbound = await prisma.whatsAppWebhookEvent.findFirst({
      where: { businessId: input.businessId, contactPhone: recipient, eventType: "MESSAGE_RECEIVED" },
      select: { id: true },
    });
    if (!priorInbound) throw new AppError("This number has not contacted this business on WhatsApp. Add it as a customer and confirm consent before sending a template.", 422);
  }

  const templates = await listApprovedWhatsAppTemplates(input.businessId);
  const template = templates.find((item) => item.name === input.templateName && item.language === input.language);
  if (!template) throw new AppError("Choose an approved WhatsApp template belonging to this business", 422);
  if (input.variables.length !== template.bodyVariableCount || input.variables.some((value) => !value.trim() || value.length > 1024)) {
    throw new AppError(`This template requires ${template.bodyVariableCount} non-empty body variable(s)`, 422);
  }

  const components = template.bodyVariableCount ? [{
    type: "body",
    parameters: input.variables.map((text) => ({ type: "text", text })),
  }] : undefined;
  const response = await fetch(`https://graph.facebook.com/${connection.apiVersion}/${connection.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", recipient_type: "individual", to: recipient, type: "template",
      template: { name: template.name, language: { code: template.language }, ...(components ? { components } : {}) },
    }),
  });
  const result = await response.json() as { messages?: Array<{ id?: string }>; error?: { message?: string } };
  const providerMessageId = result.messages?.[0]?.id;
  if (!response.ok || !providerMessageId) throw new AppError(result.error?.message ?? "WhatsApp template message could not be sent", 502);

  const payload = {
    id: providerMessageId, to: recipient, timestamp: String(Math.floor(Date.now() / 1000)),
    type: "template", template: { name: template.name, language: { code: template.language } },
    text: { body: `Template: ${template.name}` },
  };
  const eventKey = createHash("sha256").update(`MESSAGE_SENT:${input.businessId}:${providerMessageId}`).digest("hex");
  try {
    await prisma.whatsAppWebhookEvent.create({
      data: { eventKey, businessId: input.businessId, contactPhone: recipient, eventType: "MESSAGE_SENT", providerMessageId, payload },
    });
    await replayPendingWhatsAppStatusEvents(providerMessageId);
  } catch {
    logger.warn({ businessId: input.businessId, providerMessageId }, "WhatsApp template sent but inbox history could not be persisted");
  }
  return { providerMessageId, customerId, phone: recipient, template: template.name, status: "SENT" };
}

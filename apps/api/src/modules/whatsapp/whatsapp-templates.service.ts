import { createHash } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { config } from "../../config/index.js";
import { AppError } from "../../middleware/error-handler.js";
import { decryptWhatsAppAccessToken } from "./whatsapp-token-crypto.js";
import { normalizeWhatsAppRecipient } from "../invoices/providers/whatsapp.provider.js";

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

function bodyVariableIndexes(template: MetaTemplate): number[] | null {
  const body = template.components?.find((component) => component.type === "BODY")?.text ?? "";
  const placeholders = [...body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)];
  const openingCount = (body.match(/\{\{/g) ?? []).length;
  const closingCount = (body.match(/\}\}/g) ?? []).length;
  if (openingCount !== closingCount || openingCount !== placeholders.length) return null;
  const indexes = placeholders.map((match) => /^\d+$/.test(match[1] ?? "") ? Number(match[1]) : NaN);
  if (indexes.some((index) => !Number.isSafeInteger(index) || index < 1)) return null;
  const unique = [...new Set(indexes)].sort((a, b) => a - b);
  // Meta expects positional BODY parameters numbered contiguously from 1.
  if (unique.some((index, position) => index !== position + 1)) return null;
  return unique;
}

function bodyVariableCount(template: MetaTemplate) {
  return bodyVariableIndexes(template)?.length ?? 0;
}

export async function listApprovedWhatsAppTemplates(businessId: string) {
  const connection = await getConnection(businessId);
  const url = new URL(`https://graph.facebook.com/${connection.apiVersion}/${connection.wabaId}/message_templates`);
  url.searchParams.set("fields", "id,name,status,language,category,components");
  url.searchParams.set("limit", "100");
  const templatesFromMeta: MetaTemplate[] = [];
  let nextUrl: URL | null = url;
  // WABAs with many approved templates can span multiple Graph API pages.
  // Follow only Meta Graph URLs and cap pagination to avoid unbounded requests.
  let pagesFetched = 0;
  while (nextUrl && pagesFetched < 10) {
    if (nextUrl.protocol !== "https:" || nextUrl.hostname !== "graph.facebook.com") {
      throw new AppError("Meta returned an unexpected template pagination URL", 502);
    }
    const response = await fetch(nextUrl, { headers: { Authorization: `Bearer ${connection.token}` } });
    const payload = await response.json() as TemplateListResponse;
    if (!response.ok) throw new AppError(payload.error?.message ?? "Unable to load WhatsApp templates from Meta", 502);
    templatesFromMeta.push(...(payload.data ?? []));
    pagesFetched += 1;
    if (!payload.paging?.next) {
      nextUrl = null;
    } else {
      try {
        nextUrl = new URL(payload.paging.next);
      } catch {
        throw new AppError("Meta returned an invalid template pagination URL", 502);
      }
    }
  }
  if (nextUrl) {
    throw new AppError("This WhatsApp account has more than 1,000 templates. Refine the template catalogue or contact support.", 502);
  }
  const uniqueTemplates = [...new Map(templatesFromMeta.map((template) => [template.id, template])).values()];
  return uniqueTemplates
    .filter((template) => template.status === "APPROVED")
    // The inbox composer currently supports BODY text variables. Hide templates
    // requiring dynamic header or URL-button parameters rather than offering
    // a send action that Meta would reject.
    .filter((template) => {
      const body = template.components?.find((component) => component.type === "BODY")?.text ?? "";
      const unsupportedBodyVariables = bodyVariableIndexes(template) === null;
      const unsupportedComponents = (template.components ?? []).some((component) =>
        (component.type === "HEADER" && ((component.format && !["TEXT", "IMAGE"].includes(component.format)) || (typeof component.text === "string" && component.text.includes("{{")))) ||
        (component.type === "BUTTONS" && (component.buttons ?? []).some((button) => button.type === "URL" || button.type === "OTP" || (typeof button.url === "string" && /\{\{\s*\d+\s*\}\}/.test(button.url))))
      );
      return !unsupportedBodyVariables && !unsupportedComponents;
    })
    .map((template) => ({
      id: template.id, name: template.name, language: template.language, category: template.category,
      bodyVariableCount: bodyVariableCount(template),
      headerFormat: template.components?.find((component) => component.type === "HEADER")?.format ?? null,
    }));
}

export async function sendApprovedWhatsAppTemplate(input: {
  businessId: string; customerId?: string | null; phone: string; templateName: string; language: string; variables: string[];
  headerImageId?: string;
  requireInboundConversation?: boolean;
}) {
  const connection = await getConnection(input.businessId);
  let recipient = normalizeWhatsAppRecipient(input.phone);
  let customerId: string | null = null;
  if (input.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, businessId: input.businessId },
      select: {
        id: true,
        phone: true,
        whatsappOptIn: true,
        whatsappOptInAt: true,
        whatsappOptInSource: true,
      },
    });
    if (!customer) throw new AppError("Customer not found in this business", 404);
    recipient = normalizeWhatsAppRecipient(customer.phone);
    customerId = customer.id;
    if (
      input.requireInboundConversation === false &&
      (!customer.whatsappOptIn || !customer.whatsappOptInAt || !customer.whatsappOptInSource)
    ) {
      throw new AppError("Customer has no complete recorded WhatsApp consent (source and timestamp). Record consent before business-initiated delivery.", 422);
    }
  }
  if (input.requireInboundConversation === false && !customerId) {
    throw new AppError("A saved customer with recorded WhatsApp consent is required for automated template delivery", 422);
  }
  if (input.requireInboundConversation !== false) {
    const priorInbound = await prisma.whatsAppWebhookEvent.findFirst({
      where: {
        businessId: input.businessId,
        phoneNumberId: connection.phoneNumberId,
        contactPhone: recipient,
        eventType: "MESSAGE_RECEIVED",
      },
      select: { id: true },
    });
    if (!priorInbound) {
      throw new AppError("A customer-initiated WhatsApp conversation is required before sending a template from this inbox.", 422);
    }
  }

  const templates = await listApprovedWhatsAppTemplates(input.businessId);
  const template = templates.find((item) => item.name === input.templateName && item.language === input.language);
  if (!template) throw new AppError("Choose an approved WhatsApp template belonging to this business", 422);
  if (template.headerFormat === "IMAGE" && !input.headerImageId) {
    throw new AppError("This approved template requires a receipt image in its IMAGE header", 422);
  }
  if (input.headerImageId && template.headerFormat !== "IMAGE") {
    throw new AppError("The selected template does not support an IMAGE header", 422);
  }
  if (input.variables.length !== template.bodyVariableCount || input.variables.some((value) => !value.trim() || value.length > 1024)) {
    throw new AppError(`This template requires ${template.bodyVariableCount} non-empty body variable(s)`, 422);
  }

  const components = [
    ...(input.headerImageId ? [{
      type: "header",
      parameters: [{ type: "image", image: { id: input.headerImageId } }],
    }] : []),
    ...(template.bodyVariableCount ? [{
      type: "body",
      parameters: input.variables.map((text) => ({ type: "text", text })),
    }] : []),
  ];

  const response = await fetch(`https://graph.facebook.com/${connection.apiVersion}/${connection.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", recipient_type: "individual", to: recipient, type: "template",
      template: { name: template.name, language: { code: template.language }, ...(components.length ? { components } : {}) },
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
  } catch {
    logger.warn({ businessId: input.businessId, providerMessageId }, "WhatsApp template sent but inbox history could not be persisted");
  }
  return { providerMessageId, customerId, phone: recipient, template: template.name, status: "SENT" };
}


export async function sendAutomatedWhatsAppTemplate(input: {
  businessId: string; customerId: string; phone: string; templateName: string; language: string; variableValues: string[];
  templateCategory?: "UTILITY" | "MARKETING";
  headerImageId?: string;
}) {
  const templates = await listApprovedWhatsAppTemplates(input.businessId);
  const template = templates.find((item) => item.name === input.templateName && item.language === input.language);
  if (!template) throw new AppError("The configured WhatsApp notification template is not approved or is no longer available", 422);
  const requiredCategory = input.templateCategory ?? "UTILITY";
  if (template.category !== requiredCategory) {
    throw new AppError(`This notification must use an approved ${requiredCategory} WhatsApp template`, 422);
  }
  if (requiredCategory === "MARKETING" && template.bodyVariableCount !== 3) {
    throw new AppError("Announcement marketing templates must have exactly three BODY variables: customer name, company name, and announcement message", 422);
  }
  if (template.bodyVariableCount > input.variableValues.length) {
    throw new AppError("The configured WhatsApp template needs more body variables than this notification can provide", 422);
  }
  const variables = input.variableValues.slice(0, template.bodyVariableCount);
  return sendApprovedWhatsAppTemplate({
    businessId: input.businessId,
    customerId: input.customerId,
    phone: input.phone,
    templateName: input.templateName,
    language: input.language,
    variables,
    ...(input.headerImageId ? { headerImageId: input.headerImageId } : {}),
    requireInboundConversation: false,
  });
}

export async function uploadWhatsAppTemplateImage(businessId: string, image: Buffer) {
  const connection = await getConnection(businessId);
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([image], { type: "image/png" }), "receipt.png");
  form.append("type", "image/png");
  const response = await fetch(
    `https://graph.facebook.com/${connection.apiVersion}/${connection.phoneNumberId}/media`,
    { method: "POST", headers: { Authorization: `Bearer ${connection.token}` }, body: form },
  );
  const payload = await response.json() as { id?: string; error?: { message?: string } };
  if (!response.ok || !payload.id) {
    throw new AppError(payload.error?.message ?? "WhatsApp could not upload the receipt image for its approved template", 502);
  }
  return payload.id;
}

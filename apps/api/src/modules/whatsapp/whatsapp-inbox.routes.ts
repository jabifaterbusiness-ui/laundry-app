import { Router, type Request } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/permissions.js";
import { AppError } from "../../middleware/error-handler.js";
import { listWhatsAppConversations, markWhatsAppConversationRead, sendWhatsAppConversationReply } from "./whatsapp-inbox.service.js";
import { listApprovedWhatsAppTemplates, sendApprovedWhatsAppTemplate } from "./whatsapp-templates.service.js";

export const whatsappInboxRouter = Router();

function businessId(req: Request): string {
  const id = req.user?.businessId;
  if (!id) throw new AppError("This action requires an account scoped to a business", 403);
  return id;
}

whatsappInboxRouter.get("/conversations", requirePermission("customers.view"), asyncHandler(async (req, res) => {
  res.status(200).json({ data: await listWhatsAppConversations(businessId(req)) });
}));

whatsappInboxRouter.post("/conversations/replies", requirePermission("customers.update"), asyncHandler(async (req, res) => {
  const input = z.object({
    customerId: z.string().uuid().nullable().optional(),
    phone: z.string().min(8).max(32),
    body: z.string().trim().min(1).max(4096),
  }).strict().parse(req.body);
  const result = await sendWhatsAppConversationReply({ businessId: businessId(req), ...(input.customerId !== undefined ? { customerId: input.customerId } : {}), phone: input.phone, body: input.body });
  res.status(201).json(result);
}));

whatsappInboxRouter.post("/conversations/read", requirePermission("customers.view"), asyncHandler(async (req, res) => {
  const input = z.object({ customerId: z.string().uuid().nullable().optional(), phone: z.string().min(8).max(32) }).strict().parse(req.body);
  const result = await markWhatsAppConversationRead({ businessId: businessId(req), ...(input.customerId !== undefined ? { customerId: input.customerId } : {}), phone: input.phone });
  res.status(200).json(result);
}));

whatsappInboxRouter.get("/templates", requirePermission("customers.view"), asyncHandler(async (req, res) => {
  res.status(200).json({ data: await listApprovedWhatsAppTemplates(businessId(req)) });
}));

whatsappInboxRouter.post("/templates/send", requirePermission("customers.update"), asyncHandler(async (req, res) => {
  const input = z.object({
    customerId: z.string().uuid().nullable().optional(),
    phone: z.string().min(8).max(32),
    templateName: z.string().min(1).max(512),
    language: z.string().min(2).max(32),
    variables: z.array(z.string().max(1024)).max(20).default([]),
  }).strict().parse(req.body);
  const result = await sendApprovedWhatsAppTemplate({ businessId: businessId(req), ...(input.customerId !== undefined ? { customerId: input.customerId } : {}), phone: input.phone, templateName: input.templateName, language: input.language, variables: input.variables });
  res.status(201).json(result);
}));

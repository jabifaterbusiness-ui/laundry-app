import { Router, type Request } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/permissions.js";
import { AppError } from "../../middleware/error-handler.js";
import { listWhatsAppConversations, sendWhatsAppConversationReply } from "./whatsapp-inbox.service.js";

export const whatsappInboxRouter = Router();

function businessId(req: Request): string {
  const id = req.user?.businessId;
  if (!id) throw new AppError("This action requires an account scoped to a business", 403);
  return id;
}

whatsappInboxRouter.get("/conversations", requirePermission("customers.view"), asyncHandler(async (req, res) => {
  res.status(200).json({ data: await listWhatsAppConversations(businessId(req)) });
}));

whatsappInboxRouter.post("/conversations/:customerId/replies", requirePermission("customers.update"), asyncHandler(async (req, res) => {
  const params = z.object({ customerId: z.string().uuid() }).parse(req.params);
  const input = z.object({ body: z.string().trim().min(1).max(4096) }).strict().parse(req.body);
  const result = await sendWhatsAppConversationReply({ businessId: businessId(req), customerId: params.customerId, body: input.body });
  res.status(201).json(result);
}));

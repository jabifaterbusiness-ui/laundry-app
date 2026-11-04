import { Router, type Request } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/permissions.js";
import { AppError } from "../../middleware/error-handler.js";
import {
  completeWhatsAppEmbeddedSignup,
  disconnectWhatsAppBusiness,
  getWhatsAppConnectionStatus,
} from "./whatsapp-connections.service.js";

export const whatsappConnectionsRouter = Router();

function businessId(req: Request): string {
  const id = req.user?.businessId;
  if (!id) throw new AppError("This action requires an account scoped to a business", 403);
  return id;
}

whatsappConnectionsRouter.get("/", requirePermission("business.view"), asyncHandler(async (req, res) => {
  res.status(200).json(await getWhatsAppConnectionStatus(businessId(req)));
}));

whatsappConnectionsRouter.post("/embedded-signup", requirePermission("business.update"), asyncHandler(async (req, res) => {
  const input = z.object({
    code: z.string().min(1).max(4096),
    wabaId: z.string().regex(/^[0-9]{5,30}$/),
    phoneNumberId: z.string().regex(/^[0-9]{5,30}$/),
  }).strict().parse(req.body);
  const connection = await completeWhatsAppEmbeddedSignup({ businessId: businessId(req), ...input });
  res.status(201).json({ connection });
}));

whatsappConnectionsRouter.delete("/", requirePermission("business.update"), asyncHandler(async (req, res) => {
  await disconnectWhatsAppBusiness(businessId(req));
  res.status(204).send();
}));

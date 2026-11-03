import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { customerPriceIdSchema, customerPriceListSchema, customerPriceSchema } from "./customer-pricing.validation.js";
import { listCustomerServicePrices, removeCustomerServicePrice, setCustomerServicePrice } from "./customer-pricing.service.js";
function businessId(req: Request): string {
  if (!req.user?.businessId) throw new AppError("This action requires an account scoped to a business", 403);
  return req.user.businessId;
}
export async function list(req: Request, res: Response) {
  const id = businessId(req);
  const { customerId } = customerPriceListSchema.parse(req.query);
  res.status(200).json({ data: await listCustomerServicePrices(id, customerId) });
}
export async function save(req: Request, res: Response) {
  const id = businessId(req);
  const input = customerPriceSchema.parse(req.body);
  const result = await setCustomerServicePrice({ businessId: id, ...input });
  await recordAuditEvent({ action: "customer.service_price_set", entityType: "CustomerServicePrice", entityId: result.id, businessId: id, actorUserId: req.user!.id, correlationId: req.correlationId ?? null, metadata: { customerId: input.customerId, serviceId: input.serviceId, unitPrice: input.unitPrice } });
  res.status(200).json(result);
}
export async function remove(req: Request, res: Response) {
  const id = businessId(req);
  const { id: priceId } = customerPriceIdSchema.parse(req.params);
  await removeCustomerServicePrice(priceId, id);
  await recordAuditEvent({ action: "customer.service_price_removed", entityType: "CustomerServicePrice", entityId: priceId, businessId: id, actorUserId: req.user!.id, correlationId: req.correlationId ?? null });
  res.status(204).send();
}

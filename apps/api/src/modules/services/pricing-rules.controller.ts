import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { createAdjustmentSchema, createTaxRuleSchema, pricingRuleIdSchema } from "./pricing-rules.validation.js";
import { createPriceAdjustment, createTaxRule, deletePriceAdjustment, deleteTaxRule, listPricingRules } from "./pricing-rules.service.js";

function businessId(req: Request): string {
  if (!req.user?.businessId) throw new AppError("This action requires an account scoped to a business", 403);
  return req.user.businessId;
}

export async function list(req: Request, res: Response) {
  res.status(200).json(await listPricingRules(businessId(req)));
}

export async function createAdjustment(req: Request, res: Response) {
  const id = businessId(req);
  const input = createAdjustmentSchema.parse(req.body);
  const result = await createPriceAdjustment({ businessId: id, ...input });
  await recordAuditEvent({ action: "pricing.adjustment_created", entityType: "PriceAdjustment", entityId: result.id, businessId: id, actorUserId: req.user!.id, correlationId: req.correlationId ?? null });
  res.status(201).json(result);
}

export async function removeAdjustment(req: Request, res: Response) {
  const id = businessId(req);
  const { id: ruleId } = pricingRuleIdSchema.parse(req.params);
  await deletePriceAdjustment(ruleId, id);
  await recordAuditEvent({ action: "pricing.adjustment_deleted", entityType: "PriceAdjustment", entityId: ruleId, businessId: id, actorUserId: req.user!.id, correlationId: req.correlationId ?? null });
  res.status(204).send();
}

export async function createTax(req: Request, res: Response) {
  const id = businessId(req);
  const input = createTaxRuleSchema.parse(req.body);
  const result = await createTaxRule({ businessId: id, ...input });
  await recordAuditEvent({ action: "pricing.tax_created", entityType: "TaxRule", entityId: result.id, businessId: id, actorUserId: req.user!.id, correlationId: req.correlationId ?? null });
  res.status(201).json(result);
}

export async function removeTax(req: Request, res: Response) {
  const id = businessId(req);
  const { id: ruleId } = pricingRuleIdSchema.parse(req.params);
  await deleteTaxRule(ruleId, id);
  await recordAuditEvent({ action: "pricing.tax_deleted", entityType: "TaxRule", entityId: ruleId, businessId: id, actorUserId: req.user!.id, correlationId: req.correlationId ?? null });
  res.status(204).send();
}

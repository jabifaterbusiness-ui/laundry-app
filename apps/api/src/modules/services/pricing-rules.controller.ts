import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { createAdjustmentSchema, createTaxRuleSchema, listPricingRulesQuerySchema, pricingRuleIdSchema, updateAdjustmentStatusSchema } from "./pricing-rules.validation.js";
import { createPriceAdjustment, createTaxRule, deletePriceAdjustment, deleteTaxRule, listPricingRules, setPriceAdjustmentActive } from "./pricing-rules.service.js";

function branchId(req: Request): string { if (!req.branchId) throw new AppError("A valid branch context is required", 400); return req.branchId; }
function businessId(req: Request): string {
  if (!req.user?.businessId) throw new AppError("This action requires an account scoped to a business", 403);
  return req.user.businessId;
}

export async function list(req: Request, res: Response) {
  const query = listPricingRulesQuerySchema.parse(req.query);
  res.status(200).json(await listPricingRules(
    businessId(req),
    branchId(req),
    req.user!.id,
    query.customerId,
  ));
}

export async function createAdjustment(req: Request, res: Response) {
  const id = businessId(req);
  const branch = branchId(req);
  const input = createAdjustmentSchema.parse(req.body);
  const result = await createPriceAdjustment({
    businessId: id,
    branchId: branch,
    userId: req.user!.id,
    name: input.name,
    percentage: input.percentage,
    targetScope: input.targetScope,
    allowStacking: input.allowStacking,
    excludedServiceIds: input.excludedServiceIds,
    ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
    ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
    ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
    ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
  });
  await recordAuditEvent({ action: "pricing.adjustment_created", entityType: "PriceAdjustment", entityId: result.id, businessId: id, branchId: branch, actorUserId: req.user!.id, correlationId: req.correlationId ?? null });
  res.status(201).json(result);
}

export async function updateAdjustmentStatus(req: Request, res: Response) {
  const id = businessId(req);
  const branch = branchId(req);
  const { id: ruleId } = pricingRuleIdSchema.parse(req.params);
  const input = updateAdjustmentStatusSchema.parse(req.body);
  const result = await setPriceAdjustmentActive(ruleId, id, branch, req.user!.id, input.isActive);
  await recordAuditEvent({
    action: input.isActive ? "pricing.adjustment_activated" : "pricing.adjustment_paused",
    entityType: "PriceAdjustment",
    entityId: ruleId,
    businessId: id,
    branchId: branch,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
  });
  res.status(200).json(result);
}

export async function removeAdjustment(req: Request, res: Response) {
  const id = businessId(req);
  const branch = branchId(req);
  const { id: ruleId } = pricingRuleIdSchema.parse(req.params);
  await deletePriceAdjustment(ruleId, id, branch, req.user!.id);
  await recordAuditEvent({ action: "pricing.adjustment_deleted", entityType: "PriceAdjustment", entityId: ruleId, businessId: id, branchId: branch, actorUserId: req.user!.id, correlationId: req.correlationId ?? null });
  res.status(204).send();
}

export async function createTax(req: Request, res: Response) {
  const id = businessId(req);
  const branch = branchId(req);
  const input = createTaxRuleSchema.parse(req.body);
  const result = await createTaxRule({ businessId: id, branchId: branch, ...input });
  await recordAuditEvent({ action: "pricing.tax_created", entityType: "TaxRule", entityId: result.id, businessId: id, branchId: branch, actorUserId: req.user!.id, correlationId: req.correlationId ?? null });
  res.status(201).json(result);
}

export async function removeTax(req: Request, res: Response) {
  const id = businessId(req);
  const branch = branchId(req);
  const { id: ruleId } = pricingRuleIdSchema.parse(req.params);
  await deleteTaxRule(ruleId, id, branch, req.user!.id);
  await recordAuditEvent({ action: "pricing.tax_deleted", entityType: "TaxRule", entityId: ruleId, businessId: id, branchId: branch, actorUserId: req.user!.id, correlationId: req.correlationId ?? null });
  res.status(204).send();
}

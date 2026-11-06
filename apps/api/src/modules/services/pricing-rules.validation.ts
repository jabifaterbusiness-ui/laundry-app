import { z } from "zod";

export const listPricingRulesQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  purpose: z.enum(["order", "management"]).default("management"),
}).strict();

export const createAdjustmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  percentage: z.number().finite().min(-100).max(1000),
  targetScope: z.enum(["MANUAL", "CUSTOMER", "GROUP", "ALL_CUSTOMERS"]).default("MANUAL"),
  customerId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  allowStacking: z.boolean().default(false),
  excludedServiceIds: z.array(z.string().uuid()).max(100).default([]),
}).strict();

export const updateAdjustmentStatusSchema = z.object({
  isActive: z.boolean(),
}).strict();

export const createTaxRuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["PERCENTAGE", "FIXED"]),
  value: z.number().finite().min(0).max(100000000),
  treatment: z.enum(["ADDITIVE", "WITHHOLDING"]),
  enabledByDefault: z.boolean().default(false),
  allowWithOtherTaxes: z.boolean().default(true),
}).strict();

export const pricingRuleIdSchema = z.object({ id: z.string().uuid() });

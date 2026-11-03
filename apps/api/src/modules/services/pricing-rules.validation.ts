import { z } from "zod";

export const createAdjustmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  percentage: z.number().finite().min(-100).max(1000),
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

import { z } from "zod";
const uuid = z.string().uuid();
export const updateInvoiceFinancialRulesSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
  confirmed: z.literal(true),
  adjustments: z.array(z.object({
    adjustmentId: uuid,
    scope: z.enum(["INVOICE", "ITEMS"]),
    itemIndexes: z.array(z.number().int().nonnegative()).optional(),
  }).strict()).default([]),
  taxRuleIds: z.array(uuid).default([]),
}).strict();

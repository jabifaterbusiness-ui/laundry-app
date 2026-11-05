import { z } from "zod";

export const branchResourceTypeSchema = z.enum([
  "CUSTOMERS",
  "SERVICES",
  "CUSTOMER_PRICING",
  "CUSTOMER_ACCOUNTS",
  "DISCOUNTS",
  "TAX_RULES",
  "INVENTORY",
]);

export const createBranchResourceShareSchema = z.object({
  ownerBranchId: z.string().uuid(),
  targetBranchId: z.string().uuid(),
  resourceType: branchResourceTypeSchema,
  resourceId: z.string().uuid().nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  accessLevel: z.enum(["READ", "EDIT"]),
}).refine((value) => value.ownerBranchId !== value.targetBranchId, {
  message: "Choose two different branches",
  path: ["targetBranchId"],
});

export const branchResourceShareIdSchema = z.object({
  id: z.string().uuid(),
});

import { z } from "zod";

export const branchResourceTypeSchema = z.enum([
  "CUSTOMERS",
  "SERVICES",
  "CUSTOMER_PRICING",
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
  customerAccountMode: z.enum(["SHARED", "SEPARATE"]).optional(),
}).refine((value) => value.customerAccountMode !== "SEPARATE" || (value.resourceType === "CUSTOMERS" && value.resourceId == null && value.userId == null), {
  message: "Separate customer accounts can only be configured for all customers shared with the whole target branch",
  path: ["customerAccountMode"],
}).refine((value) => value.ownerBranchId !== value.targetBranchId, {
  message: "Choose two different branches",
  path: ["targetBranchId"],
});

export const branchResourceShareIdSchema = z.object({
  id: z.string().uuid(),
});

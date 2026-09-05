import { z } from "zod";

const branchNameSchema = z
  .string()
  .trim()
  .min(1, "Branch name is required")
  .max(120, "Branch name is too long");

const branchAddressSchema = z
  .string()
  .trim()
  .max(300, "Branch address is too long")
  .optional();

export const createBranchSchema = z.object({
  name: branchNameSchema,
  address: branchAddressSchema,
});

export const updateBranchSchema = z
  .object({
    name: branchNameSchema.optional(),
    address: branchAddressSchema,
  })
  .refine(
    (data) => data.name !== undefined || data.address !== undefined,
    { message: "At least one field must be provided" },
  );

export const listBranchesQuerySchema = z.object({
  status: z.enum(["active", "inactive", "all"]).default("active"),
});

export const branchIdParamSchema = z.object({
  branchId: z.string().uuid("Invalid branch id"),
});

export const branchUserParamsSchema = z.object({
  branchId: z.string().uuid("Invalid branch id"),
  userId: z.string().uuid("Invalid user id"),
});

import { z } from "zod";

export const permissionCodeParamSchema = z.object({
  permissionCode: z.string().trim().min(1).max(150),
});

export const roleParamSchema = z.object({
  role: z.enum([
    "PLATFORM_ADMIN",
    "BUSINESS_OWNER",
    "BRANCH_MANAGER",
    "STAFF",
  ]),
});

export const rolePermissionParamsSchema = roleParamSchema.merge(
  permissionCodeParamSchema,
);

export const userIdParamSchema = z.object({
  userId: z.string().uuid(),
});

export const userPermissionParamsSchema = z.object({
  userId: z.string().uuid(),
  permissionCode: z.string().trim().min(1).max(150),
});

export const permissionReasonSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required").max(1000),
});

export const permissionValueSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().trim().min(1, "Reason is required").max(1000),
});

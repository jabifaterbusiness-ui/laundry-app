import { z } from "zod";

const userRoleSchema = z
  .string()
  .trim()
  .min(1, "Role is required")
  .max(120, "Role must be 120 characters or less");

const userIdSchema = z.string().uuid("Invalid user id");
const branchIdSchema = z.string().uuid("Invalid branch id");

export const listUsersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["active", "inactive", "all"]).default("active"),
  role: userRoleSchema.optional(),
});

export const userIdParamSchema = z.object({
  userId: userIdSchema,
});

export const userBranchParamsSchema = z.object({
  userId: userIdSchema,
  branchId: branchIdSchema,
});

export const userActionReasonSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required").max(1000),
});

const fullNameSchema = z.string().trim().min(1, "Full name is required").max(120);
const emailSchema = z.string().trim().email("Invalid email address").max(254);
const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(128);

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(50, "Username must be 50 characters or less")
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "Username may contain only letters, numbers, periods, underscores, and hyphens",
  );

export const createUserSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  username: usernameSchema.optional(),
  password: passwordSchema,
  role: userRoleSchema,
  branchIds: z.array(branchIdSchema).max(100).default([]),
});

export const updateUserSchema = z.object({
  fullName: fullNameSchema.optional(),
  email: emailSchema.optional(),
  username: usernameSchema.nullable().optional(),
  password: passwordSchema.optional(),
  role: userRoleSchema.optional(),
  branchIds: z.array(branchIdSchema).max(100).optional(),
}).refine(
  (data) =>
    data.fullName !== undefined ||
    data.email !== undefined ||
    data.username !== undefined ||
    data.password !== undefined ||
    data.role !== undefined ||
    data.branchIds !== undefined,
  { message: "At least one field must be provided" },
);

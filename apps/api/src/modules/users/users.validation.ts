import { z } from "zod";

const userRoleSchema = z.enum([
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
  "STAFF",
]);

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

const fullNameSchema = z.string().trim().min(1, "Full name is required").max(120);
const emailSchema = z.string().trim().email("Invalid email address").max(254);
const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(128);
const positionSchema = z.string().trim().max(120, "Position must be 120 characters or less").nullable().optional();

export const createUserSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: userRoleSchema,
  position: positionSchema,
  branchIds: z.array(branchIdSchema).max(100).default([]),
});

export const updateUserSchema = z.object({
  fullName: fullNameSchema.optional(),
  email: emailSchema.optional(),
  password: passwordSchema.optional(),
  role: userRoleSchema.optional(),
  position: positionSchema,
  branchIds: z.array(branchIdSchema).max(100).optional(),
}).refine(
  (data) =>
    data.fullName !== undefined ||
    data.email !== undefined ||
    data.password !== undefined ||
    data.role !== undefined ||
    data.position !== undefined ||
    data.branchIds !== undefined,
  { message: "At least one field must be provided" },
);

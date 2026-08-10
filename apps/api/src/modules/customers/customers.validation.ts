import { z } from "zod";

// Accepts common human phone formatting (spaces, dashes, parens, a
// leading +) but requires 7-15 digits once normalized - loose enough for
// varied real-world local formats, tight enough to reject garbage.
const PHONE_INPUT_PATTERN = /^\+?[0-9()\-\s]{7,20}$/;

export function normalizePhone(raw: string): string {
  const hasPlus = raw.trim().startsWith("+");
  const digits = raw.replace(/[^0-9]/g, "");
  return hasPlus ? `+${digits}` : digits;
}

const phoneSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .regex(PHONE_INPUT_PATTERN, "Phone number format is invalid")
  .refine((v) => {
    const digitCount = v.replace(/[^0-9]/g, "").length;
    return digitCount >= 7 && digitCount <= 15;
  }, "Phone number must have between 7 and 15 digits");

const nameSchema = z.string().trim().min(1, "Customer name is required").max(120, "Customer name is too long");

const emailSchema = z.string().trim().email("Email is invalid").max(254).optional().or(z.literal("").transform(() => undefined));

const addressSchema = z.string().trim().max(300, "Address is too long").optional();

const notesSchema = z.string().trim().max(2000, "Notes are too long").optional();

export const createCustomerSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  email: emailSchema,
  address: addressSchema,
  notes: notesSchema,
  // If a likely duplicate is found, the API responds 409 with the
  // matches. The caller resubmits with confirmDuplicate: true to create
  // anyway (see docs/CUSTOMERS.md section E). Never used to bypass any
  // other validation.
  confirmDuplicate: z.boolean().optional().default(false),
});

export const updateCustomerSchema = z
  .object({
    name: nameSchema.optional(),
    phone: phoneSchema.optional(),
    email: emailSchema,
    address: addressSchema,
    notes: notesSchema,
    // Mirrors the create flow's duplicate-override flag (see
    // docs/CUSTOMERS.md section E). Deliberately has no `default()` -
    // giving it a default would make it always present in the parsed
    // output and silently satisfy the "at least one field" refinement
    // below even when the caller sent an empty body. It is never a
    // stored Customer field: customers.controller.ts strips it out
    // before calling updateCustomer().
    confirmDuplicate: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.phone !== undefined ||
      data.email !== undefined ||
      data.address !== undefined ||
      data.notes !== undefined,
    { message: "At least one field must be provided" },
  );

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  search: z.string().trim().max(120).optional(),
  status: z.enum(["active", "inactive", "all"]).default("active"),
});

export const customerIdParamSchema = z.object({
  id: z.string().uuid("Invalid customer id"),
});

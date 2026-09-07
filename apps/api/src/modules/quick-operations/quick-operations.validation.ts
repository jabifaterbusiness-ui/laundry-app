import { z } from "zod";

const uuidSchema = z.string().uuid();

export const executeQuickOperationSchema = z
  .object({
    code: z.string().trim().min(1).max(10),
    input: z.record(z.string(), z.unknown()).default({}),
    confirmed: z.boolean().default(false),
  })
  .strict();

export const manualUpdateQuickOperationSchema = z
  .object({
    orderId: uuidSchema,
    status: z.enum([
      "RECEIVED",
      "IN_PROGRESS",
      "READY_FOR_PICKUP",
      "COMPLETED",
      "CANCELLED",
    ]),
  })
  .strict();

export const transferInvoiceQuickOperationSchema = z
  .object({
    orderId: uuidSchema,
    customerId: uuidSchema,
  })
  .strict();

export const transferCustomerQuickOperationSchema = z
  .object({
    customerId: uuidSchema,
    targetCustomerId: uuidSchema,
  })
  .strict();

export const mergeCustomerQuickOperationSchema = z
  .object({
    customerId: uuidSchema,
    targetCustomerId: uuidSchema,
  })
  .strict();

export const voidPaymentQuickOperationSchema = z
  .object({
    paymentId: uuidSchema,
  })
  .strict();

export const stockQuickOperationSchema = z
  .object({
    inventoryItemId: uuidSchema,
    quantity: z.coerce
      .number()
      .int()
      .positive("Quantity must be a positive whole number"),
    reason: z
      .string()
      .trim()
      .max(1000, "Movement reason is too long")
      .optional(),
    reference: z
      .string()
      .trim()
      .max(200, "Movement reference is too long")
      .optional(),
  })
  .strict();

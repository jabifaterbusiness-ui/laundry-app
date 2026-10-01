import { z } from "zod";

export const paymentIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const invoicePaymentParamSchema = z.object({
  invoiceId: z.string().uuid(),
});

export const createPaymentSchema = z
  .object({
    invoiceId: z.string().uuid(),
    amount: z.coerce
      .number()
      .int()
      .positive("Payment amount must be a positive whole number"),
    method: z.enum(["CASH", "TRANSFER", "POS", "PAY_FROM_ACCOUNT"]),
    reference: z
      .string()
      .trim()
      .max(200, "Payment reference is too long")
      .optional(),
    note: z
      .string()
      .trim()
      .max(1000, "Payment note is too long")
      .optional(),
  })
  .strict();

export const listPaymentsQuerySchema = z.object({
  invoiceId: z.string().uuid().optional(),
  status: z.enum(["POSTED", "VOID"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

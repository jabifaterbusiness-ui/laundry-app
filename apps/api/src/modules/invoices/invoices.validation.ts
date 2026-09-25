import { z } from "zod";

export const invoiceIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const createInvoiceSchema = z.object({
  orderId: z.string().uuid(),
  customerAgreement: z.string().trim().min(1).max(2000),
});

export const listInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["ISSUED", "VOID"]).optional(),
  customerId: z.string().uuid().optional(),
});

export const invoiceOrderParamSchema = z.object({
  orderId: z.string().uuid(),
});

export const updateInvoiceCorrectionSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
  confirmed: z.literal(true),
  garmentNote: z.string().max(2000).nullable().optional(),
  internalNote: z.string().max(2000).nullable().optional(),
  customerAgreement: z.string().trim().min(1).max(2000).optional(),
  items: z.array(
    z.object({
      itemName: z.string().trim().min(1).max(500),
      colors: z.array(z.string().trim().max(100)).default([]),
      piecesPerUnit: z.coerce.number().int().positive(),
      quantity: z.coerce.number().int().positive(),
      unitPrice: z.coerce.number().int().nonnegative(),
    }).strict(),
  ).min(1).optional(),
}).strict();

export const voidInvoiceCorrectionSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
  confirmed: z.literal(true),
}).strict();

export const transferInvoiceCorrectionSchema = z.object({
  customerId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
  confirmed: z.literal(true),
}).strict();

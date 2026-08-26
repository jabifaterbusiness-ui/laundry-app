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

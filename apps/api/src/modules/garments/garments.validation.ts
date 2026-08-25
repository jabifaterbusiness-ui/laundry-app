import { z } from "zod";

export const garmentIdParamSchema = z.object({
  id: z.string().uuid("Invalid garment ID"),
});

export const orderIdParamSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
});

export const listGarmentsQuerySchema = z.object({
  orderId: z.string().uuid().optional(),
  orderItemId: z.string().uuid().optional(),
  status: z.enum([
    "RECEIVED",
    "PROCESSING",
    "READY",
    "PICKED_UP",
    "DAMAGED",
    "LOST",
  ]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export const updateGarmentStatusSchema = z.object({
  status: z.enum([
    "RECEIVED",
    "PROCESSING",
    "READY",
    "PICKED_UP",
    "DAMAGED",
    "LOST",
  ]),
  note: z.string().trim().max(1000).optional(),
});

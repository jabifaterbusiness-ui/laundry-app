import { z } from "zod";

const uuidSchema = z.string().uuid("Invalid ID");

const orderItemSchema = z
  .object({
    serviceId: uuidSchema,
    quantity: z.coerce
      .number()
      .int()
      .positive("Quantity must be a positive whole number"),
    colors: z
      .array(z.string().trim().min(1).max(100))
      .max(50)
      .default([]),
  })
  .strict();

export const createOrderSchema = z
  .object({
    customerId: uuidSchema,
    items: z
      .array(orderItemSchema)
      .min(1, "An order must contain at least one item"),
    garmentNote: z
      .string()
      .trim()
      .max(2000, "Garment note is too long")
      .optional(),
    internalNote: z
      .string()
      .trim()
      .max(2000, "Internal note is too long")
      .optional(),
    expectedReadyAt: z.coerce.date().optional(),
  })
  .strict();

export const listOrdersQuerySchema = z.object({
  customerId: uuidSchema.optional(),
  status: z.enum([
    "RECEIVED",
    "IN_PROGRESS",
    "READY_FOR_PICKUP",
    "COMPLETED",
    "CANCELLED",
  ]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export const orderIdParamSchema = z.object({
  id: uuidSchema,
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    "RECEIVED",
    "IN_PROGRESS",
    "READY_FOR_PICKUP",
    "COMPLETED",
    "CANCELLED",
  ]),
});


export const transferOrderSchema = z
  .object({
    customerId: uuidSchema,
  })
  .strict();

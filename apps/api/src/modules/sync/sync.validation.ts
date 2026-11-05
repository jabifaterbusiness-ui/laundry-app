import { z } from "zod";

const uuid = z.string().uuid();

const customerCreatePayloadSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(7).max(20),
    email: z.string().trim().email().max(254).optional(),
    address: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(2000).optional(),
    whatsappOptIn: z.boolean().optional(),
    whatsappOptInSource: z.enum(["CUSTOMER_VERBAL", "CUSTOMER_WRITTEN", "CUSTOMER_WEBSITE", "CUSTOMER_OTHER"]).optional(),
  })
  .strict()
  .refine((data) => data.whatsappOptIn !== true || Boolean(data.whatsappOptInSource), {
    message: "Record how the customer gave WhatsApp consent",
  });

const customerUpdateDataSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().min(7).max(20).optional(),
    email: z.string().trim().email().max(254).optional(),
    address: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(2000).optional(),
    whatsappOptIn: z.boolean().optional(),
    whatsappOptInSource: z.enum(["CUSTOMER_VERBAL", "CUSTOMER_WRITTEN", "CUSTOMER_WEBSITE", "CUSTOMER_OTHER"]).optional(),
  })
  .strict()
  .refine(
    (data) => data.whatsappOptIn !== true || Boolean(data.whatsappOptInSource),
    { message: "Record how the customer gave WhatsApp consent" },
  )
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    {
      message: "At least one customer field must be provided",
    },
  );

const customerUpdatePayloadSchema = z
  .object({
    customerId: uuid,
    data: customerUpdateDataSchema,
  })
  .strict();

const orderItemSchema = z
  .object({
    serviceId: uuid,
    quantity: z.number().int().positive(),
  })
  .strict();

const orderCreatePayloadSchema = z
  .object({
    customerId: uuid,
    items: z.array(orderItemSchema).min(1),
    expectedReadyAt: z.string().datetime().optional(),
    garmentNote: z.string().trim().max(2000).optional(),
    internalNote: z.string().trim().max(2000).optional(),
  })
  .strict();

const orderUpdatePayloadSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("TRANSFER_CUSTOMER"),
      orderId: uuid,
      customerId: uuid,
    })
    .strict(),

  z
    .object({
      action: z.literal("UPDATE_STATUS"),
      orderId: uuid,
      status: z.enum([
        "RECEIVED",
        "IN_PROGRESS",
        "READY_FOR_PICKUP",
        "COMPLETED",
        "CANCELLED",
      ]),
    })
    .strict(),
]);

export const syncOperationTypeSchema = z.enum([
  "ORDER_CREATE",
  "ORDER_UPDATE",
  "CUSTOMER_CREATE",
  "CUSTOMER_UPDATE",
]);

export const syncPayloadSchema = z.discriminatedUnion("operationType", [
  z.object({
    operationType: z.literal("CUSTOMER_CREATE"),
    payload: customerCreatePayloadSchema,
  }),

  z.object({
    operationType: z.literal("CUSTOMER_UPDATE"),
    payload: customerUpdatePayloadSchema,
  }),

  z.object({
    operationType: z.literal("ORDER_CREATE"),
    payload: orderCreatePayloadSchema,
  }),

  z.object({
    operationType: z.literal("ORDER_UPDATE"),
    payload: orderUpdatePayloadSchema,
  }),
]);

export const enqueueSyncOperationSchema = z
  .object({
    clientOperationId: z.string().trim().min(1).max(200),
    operationType: syncOperationTypeSchema,
    payloadVersion: z.number().int().positive().max(100).optional(),
    payload: z.unknown(),
    correlationId: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

export const syncOperationIdParamSchema = z.object({
  id: uuid,
});

export const listSyncOperationsQuerySchema = z.object({
  status: z
    .enum([
      "PENDING",
      "PROCESSING",
      "APPLIED",
      "CONFLICT",
      "REJECTED",
      "FAILED",
    ])
    .optional(),

  page: z.coerce.number().int().positive().default(1),

  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

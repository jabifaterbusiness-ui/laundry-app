import { z } from "zod";

export const createSubscriptionPaymentIntentSchema = z
  .object({
    plan: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
    origin: z.enum(["ONLINE", "OFFLINE"]).default("ONLINE"),
    idempotencyKey: z
      .string()
      .trim()
      .min(8, "Idempotency key must be at least 8 characters")
      .max(200, "Idempotency key is too long"),
    providerKey: z.string().trim().min(1).max(100).optional(),
    paymentMethodKey: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type CreateSubscriptionPaymentIntentInput = z.infer<
  typeof createSubscriptionPaymentIntentSchema
>;

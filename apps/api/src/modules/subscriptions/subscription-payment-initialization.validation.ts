import { z } from "zod";

export const initializeSubscriptionPaymentSchema = z
  .object({
    intentId: z.string().uuid(),
  })
  .strict();

export type InitializeSubscriptionPaymentInput = z.infer<
  typeof initializeSubscriptionPaymentSchema
>;

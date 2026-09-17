import { z } from "zod";

export const verifySubscriptionPaymentSchema = z
  .object({
    intentId: z.string().uuid(),
  })
  .strict();

export type VerifySubscriptionPaymentInput = z.infer<
  typeof verifySubscriptionPaymentSchema
>;

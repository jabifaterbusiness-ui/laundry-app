import { z } from "zod";

export const reconcileOfflineSubscriptionPaymentSchema = z
  .object({
    intentId: z.string().uuid(),
    providerKey: z.string().trim().min(1).max(100),
    paymentMethodKey: z.string().trim().min(1).max(100),
  })
  .strict();

export type ReconcileOfflineSubscriptionPaymentInput = z.infer<
  typeof reconcileOfflineSubscriptionPaymentSchema
>;

export const subscriptionPaymentIntentIdParamSchema = z.object({
  intentId: z.string().uuid(),
});

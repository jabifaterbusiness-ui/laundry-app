import { z } from "zod";

export const reconcileOfflineSubscriptionPaymentSchema = z
  .object({
    intentId: z.string().uuid(),
    providerKey: z.string().trim().min(1).max(100),
    paymentMethodKey: z.string().trim().min(1).max(100),
    // Optional for compatibility with already-open older clients; never required.
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

export type ReconcileOfflineSubscriptionPaymentInput = z.infer<
  typeof reconcileOfflineSubscriptionPaymentSchema
>;

export const subscriptionPaymentIntentIdParamSchema = z.object({
  intentId: z.string().uuid(),
});

import { z } from "zod";

export const subscriptionPricingSchema = z.object({
  plan: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
  countryCode: z.string().trim().min(2).max(3),
  currencyCode: z.string().trim().min(3).max(3),
  amount: z.number().int().positive(),
  isActive: z.boolean().optional(),
});

export const subscriptionPriceStatusSchema = z.object({
  isActive: z.boolean(),
});

export type SubscriptionPricingRequest = z.infer<
  typeof subscriptionPricingSchema
>;

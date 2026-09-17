import { z } from "zod";

const codeListSchema = z
  .array(z.string().trim().min(2).max(10))
  .max(100)
  .default([]);

const methodListSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(100)
  .default([]);

export const paymentProviderSchema = z.object({
  providerKey: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(1).max(200),
  enabled: z.boolean().optional(),
  supportedCountries: codeListSchema,
  supportedCurrencies: codeListSchema,
  supportedMethods: methodListSchema,
  displayOrder: z.number().int().min(0).optional(),
});

export const paymentProviderStatusSchema = z.object({
  enabled: z.boolean(),
});

export const paymentMethodSchema = z.object({
  methodKey: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(1).max(200),
  providerKey: z.string().trim().min(1).max(100).nullable().optional(),
  enabled: z.boolean().optional(),
  supportedCountries: codeListSchema,
  supportedCurrencies: codeListSchema,
  displayOrder: z.number().int().min(0).optional(),
});

export const paymentMethodStatusSchema = z.object({
  enabled: z.boolean(),
});

export type PaymentProviderInput = z.infer<typeof paymentProviderSchema>;
export type PaymentMethodInput = z.infer<typeof paymentMethodSchema>;

import { z } from "zod";

export const updateBusinessBrandingSchema = z
  .object({
    receiptPrimaryColor: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid 6-digit hex color")
      .nullable()
      .optional(),

    receiptAccentColor: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid 6-digit hex color")
      .nullable()
      .optional(),

    receiptBackgroundColor: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid 6-digit hex color")
      .nullable()
      .optional(),

    receiptTextColor: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid 6-digit hex color")
      .nullable()
      .optional(),

    receiptHeaderStyle: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .nullable()
      .optional(),

    defaultCustomerAgreement: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .optional(),
  })
  .strict();

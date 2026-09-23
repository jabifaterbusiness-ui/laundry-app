import { z } from "zod";

export const financialStatementConfigSchema = z.object({
  enabled: z.boolean(),
  dayOfMonth: z.number().int().min(1).max(28),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  emailEnabled: z.boolean(),
  whatsappEnabled: z.boolean(),
  dailyEnabled: z.boolean(),
  dailyHour: z.number().int().min(0).max(23),
  dailyMinute: z.number().int().min(0).max(59),
  dailyEmailEnabled: z.boolean(),
  dailyWhatsappEnabled: z.boolean(),
}).superRefine((value, ctx) => {
  if (
    value.enabled &&
    !value.emailEnabled &&
    !value.whatsappEnabled
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["emailEnabled"],
      message: "At least one delivery channel must be enabled when monthly statements are enabled",
    });
  }

  if (
    value.dailyEnabled &&
    !value.dailyEmailEnabled &&
    !value.dailyWhatsappEnabled
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dailyEmailEnabled"],
      message: "At least one delivery channel must be enabled when daily statements are enabled",
    });
  }
});

export const createFinancialStatementRecipientSchema = z.object({
  userId: z.string().uuid(),
  whatsappNumber: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "WhatsApp number must use E.164 format")
    .optional(),
});

export const updateFinancialStatementRecipientSchema = z.object({
  whatsappNumber: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "WhatsApp number must use E.164 format")
    .nullable()
    .optional(),
  enabled: z.boolean().optional(),
});

export const financialStatementRecipientIdParamSchema = z.object({
  recipientId: z.string().uuid(),
});

export type FinancialStatementConfigInput = z.infer<
  typeof financialStatementConfigSchema
>;

export type CreateFinancialStatementRecipientInput = z.infer<
  typeof createFinancialStatementRecipientSchema
>;

export type UpdateFinancialStatementRecipientInput = z.infer<
  typeof updateFinancialStatementRecipientSchema
>;

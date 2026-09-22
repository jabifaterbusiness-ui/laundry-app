import { z } from "zod";
import { ExpenseCategory } from "@prisma/client";

export const createExpenseSchema = z.object({
  category: z.nativeEnum(ExpenseCategory),
  description: z.string().trim().min(1).max(500),
  amount: z.number().int().positive(),
  incurredAt: z.coerce.date(),
  reference: z.string().trim().max(200).optional(),
  note: z.string().trim().max(1000).optional(),
});

export const rejectExpenseSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

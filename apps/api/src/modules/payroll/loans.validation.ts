import { z } from "zod";

export const createLoanSchema = z.object({
  employeeId: z.string().uuid(),
  principalAmount: z.number().int().positive(),
  reason: z.string().trim().max(500).optional(),
});

export const rejectLoanSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export type CreateLoanInput = z.infer<typeof createLoanSchema>;

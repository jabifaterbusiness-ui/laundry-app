import { z } from "zod";

export const createIOUSchema = z.object({
  employeeId: z.string().uuid(),
  amount: z.number().int().positive(),
  reason: z.string().trim().max(500).optional(),
});

export const rejectIOUSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export type CreateIOUInput = z.infer<typeof createIOUSchema>;

import { z } from "zod";

export const createCompensationSchema = z.object({
  employeeId: z.string().uuid(),
  basicSalary: z.number().int().positive(),
  effectiveFrom: z.coerce.date(),
});

export type CreateCompensationInput = z.infer<typeof createCompensationSchema>;

import { z } from "zod";

export const createPayrollPeriodSchema = z
  .object({
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
  })
  .refine((data) => data.periodStart < data.periodEnd, {
    message: "Payroll period start must be before payroll period end",
    path: ["periodEnd"],
  });

export type CreatePayrollPeriodInput = z.infer<
  typeof createPayrollPeriodSchema
>;

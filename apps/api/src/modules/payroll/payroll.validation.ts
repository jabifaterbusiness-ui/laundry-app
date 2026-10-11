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

export const updatePayrollEarningsSchema = z.object({
  basicSalary: z.number().int().nonnegative(),
  allowances: z.number().int().nonnegative(),
  bonuses: z.number().int().nonnegative(),
});

export const createOtherPayrollDeductionSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000),
});

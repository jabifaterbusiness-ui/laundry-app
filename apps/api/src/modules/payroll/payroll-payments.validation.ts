import { z } from "zod";

export const payrollPaymentIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const payrollRecordPaymentParamSchema = z.object({
  payrollRecordId: z.string().uuid(),
});

export const createPayrollPaymentSchema = z
  .object({
    payrollRecordId: z.string().uuid(),
    employeeId: z.string().uuid(),
    amount: z.coerce
      .number()
      .int()
      .positive("Payroll payment amount must be a positive whole number"),
    method: z.enum(["CASH", "TRANSFER", "POS"]),
    reference: z
      .string()
      .trim()
      .max(200, "Payroll payment reference is too long")
      .optional(),
    note: z
      .string()
      .trim()
      .max(1000, "Payroll payment note is too long")
      .optional(),
  })
  .strict();

export const listPayrollPaymentsQuerySchema = z.object({
  payrollRecordId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  status: z.enum(["POSTED", "VOID"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

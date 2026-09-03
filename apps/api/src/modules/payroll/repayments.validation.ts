import { FinancialRepaymentMethod, FinancialRepaymentType } from "@prisma/client";
import { z } from "zod";

export const createRepaymentSchema = z
  .object({
    employeeId: z.string().uuid(),
    type: z.nativeEnum(FinancialRepaymentType),
    iouId: z.string().uuid().optional(),
    loanId: z.string().uuid().optional(),
    amount: z.number().int().positive(),
    method: z.nativeEnum(FinancialRepaymentMethod),
    reference: z.string().trim().max(200).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === FinancialRepaymentType.IOU) {
      if (!value.iouId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["iouId"],
          message: "IOU repayment requires an iouId",
        });
      }

      if (value.loanId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["loanId"],
          message: "IOU repayment cannot include a loanId",
        });
      }
    }

    if (value.type === FinancialRepaymentType.LOAN) {
      if (!value.loanId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["loanId"],
          message: "Loan repayment requires a loanId",
        });
      }

      if (value.iouId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["iouId"],
          message: "Loan repayment cannot include an iouId",
        });
      }
    }
  });

export type CreateRepaymentInput = z.infer<typeof createRepaymentSchema>;

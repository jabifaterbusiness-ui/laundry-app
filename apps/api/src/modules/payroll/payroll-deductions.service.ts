import { IOUStatus, LoanStatus, PayrollApprovalStatus, PayrollDeductionType, Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";

type ProcessPayrollDeductionsArgs = {
  businessId: string;
  branchId: string;
  payrollPeriodId: string;
  actorUserId: string;
};

const DEDUCTIBLE_IOU_STATUSES: IOUStatus[] = [
  IOUStatus.APPROVED,
  IOUStatus.PARTIALLY_DEDUCTED,
];

const DEDUCTIBLE_LOAN_STATUSES: LoanStatus[] = [
  LoanStatus.APPROVED,
  LoanStatus.ACTIVE,
  LoanStatus.PARTIALLY_REPAID,
];

export async function processPayrollDeductions({
  businessId,
  branchId,
  payrollPeriodId,
  actorUserId,
}: ProcessPayrollDeductionsArgs) {
  const runTransaction = () => prisma.$transaction(async (tx) => {
    const period = await tx.payrollPeriod.findFirst({
      where: {
        id: payrollPeriodId,
        businessId,
        branchId,
      },
    });

    if (!period) {
      throw new AppError("Payroll period not found", 404);
    }

    if (period.status !== "PROCESSING") {
      throw new AppError(
        "Payroll deductions can only be processed for a processing payroll period",
        400,
      );
    }

    if (
      period.approvalStatus === PayrollApprovalStatus.PENDING ||
      period.approvalStatus === PayrollApprovalStatus.APPROVED
    ) {
      throw new AppError(
        "Payroll deductions cannot be changed while approval is pending or approved",
        400,
      );
    }

    const payrollRecords = await tx.payrollRecord.findMany({
      where: {
        businessId,
        branchId,
        payrollPeriodId,
      },
      orderBy: {
        employeeId: "asc",
      },
    });

    if (payrollRecords.length === 0) {
      throw new AppError(
        "No payroll records exist for this payroll period",
        400,
      );
    }

    const processedRecords = [];

    for (const payrollRecord of payrollRecords) {
      let remainingPay = Math.max(
        0,
        payrollRecord.grossPay - payrollRecord.totalDeductions,
      );

      if (remainingPay === 0) {
        processedRecords.push(payrollRecord);
        continue;
      }

      const existingDeductions = await tx.payrollDeduction.findMany({
        where: {
          businessId,
          branchId,
          payrollRecordId: payrollRecord.id,
        },
        select: {
          iouId: true,
          loanId: true,
        },
      });

      const deductedIOUs = new Set(
        existingDeductions
          .map((deduction) => deduction.iouId)
          .filter((id): id is string => Boolean(id)),
      );

      const deductedLoans = new Set(
        existingDeductions
          .map((deduction) => deduction.loanId)
          .filter((id): id is string => Boolean(id)),
      );

      const ious = await tx.iOU.findMany({
        where: {
          businessId,
          branchId,
          employeeId: payrollRecord.employeeId,
          status: {
            in: DEDUCTIBLE_IOU_STATUSES,
          },
          outstandingAmount: {
            gt: 0,
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      for (const iou of ious) {
        if (remainingPay <= 0 || deductedIOUs.has(iou.id)) {
          continue;
        }

        const deductionAmount = Math.min(
          remainingPay,
          iou.outstandingAmount,
        );

        if (deductionAmount <= 0) {
          continue;
        }

        const outstandingAmount =
          iou.outstandingAmount - deductionAmount;

        await tx.payrollDeduction.create({
          data: {
            businessId,
            branchId,
            payrollRecordId: payrollRecord.id,
            type: PayrollDeductionType.IOU,
            iouId: iou.id,
            amount: deductionAmount,
            description: `IOU deduction for payroll period ${period.id}`,
          },
        });

        await tx.iOU.update({
          where: {
            id: iou.id,
          },
          data: {
            outstandingAmount,
            status:
              outstandingAmount === 0
                ? IOUStatus.FULLY_DEDUCTED
                : IOUStatus.PARTIALLY_DEDUCTED,
          },
        });

        remainingPay -= deductionAmount;
      }

      if (remainingPay > 0) {
        const loans = await tx.loan.findMany({
          where: {
            businessId,
            branchId,
            employeeId: payrollRecord.employeeId,
            status: {
              in: DEDUCTIBLE_LOAN_STATUSES,
            },
            outstandingAmount: {
              gt: 0,
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        });

        for (const loan of loans) {
          if (remainingPay <= 0 || deductedLoans.has(loan.id)) {
            continue;
          }

          const deductionAmount = Math.min(
            remainingPay,
            loan.outstandingAmount,
          );

          if (deductionAmount <= 0) {
            continue;
          }

          const outstandingAmount =
            loan.outstandingAmount - deductionAmount;

          await tx.payrollDeduction.create({
            data: {
              businessId,
              branchId,
              payrollRecordId: payrollRecord.id,
              type: PayrollDeductionType.LOAN,
              loanId: loan.id,
              amount: deductionAmount,
              description: `Loan repayment for payroll period ${period.id}`,
            },
          });

          await tx.loan.update({
            where: {
              id: loan.id,
            },
            data: {
              outstandingAmount,
              status:
                outstandingAmount === 0
                  ? LoanStatus.FULLY_REPAID
                  : LoanStatus.PARTIALLY_REPAID,
            },
          });

          remainingPay -= deductionAmount;
        }
      }

      const availablePayBeforeDeductions =
        Math.max(
          0,
          payrollRecord.grossPay - payrollRecord.totalDeductions,
        );

      const totalDeducted =
        availablePayBeforeDeductions - remainingPay;

      if (totalDeducted === 0) {
        processedRecords.push(payrollRecord);
        continue;
      }

      const totalDeductions =
        payrollRecord.totalDeductions + totalDeducted;

      const netPay = Math.max(
        0,
        payrollRecord.grossPay - totalDeductions,
      );

      const updatedRecord = await tx.payrollRecord.update({
        where: {
          id: payrollRecord.id,
        },
        data: {
          totalDeductions,
          netPay,
        },
      });

      processedRecords.push(updatedRecord);
    }

    return processedRecords;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  const result = await (async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await runTransaction();
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034";

        if (!retryable || attempt === 2) {
          throw error;
        }
      }
    }

    throw new Error("Payroll deduction transaction exhausted retries");
  })();

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "payroll_deductions.processed",
    entityType: "PAYROLL_PERIOD",
    entityId: payrollPeriodId,
    metadata: {
      payrollPeriodId,
      recordCount: result.length,
    },
  });

  return {
    payrollPeriodId,
    records: result,
  };
}

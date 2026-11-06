import { PayrollApprovalStatus, PayrollPeriodStatus } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";

type CreatePayrollPeriodArgs = {
  businessId: string;
  branchId: string;
  periodStart: Date;
  periodEnd: Date;
  actorUserId: string;
};

type GeneratePayrollArgs = {
  businessId: string;
  branchId: string;
  payrollPeriodId: string;
  actorUserId: string;
};

type FinalizePayrollArgs = {
  businessId: string;
  branchId: string;
  payrollPeriodId: string;
  actorUserId: string;
};
type SubmitPayrollForApprovalArgs = {
  businessId: string;
  branchId: string;
  payrollPeriodId: string;
  actorUserId: string;
};

type ApprovePayrollArgs = {
  businessId: string;
  branchId: string;
  payrollPeriodId: string;
  actorUserId: string;
};

type DeclinePayrollArgs = {
  businessId: string;
  branchId: string;
  payrollPeriodId: string;
  actorUserId: string;
  reason: string;
};


export async function submitPayrollForApproval({
  businessId,
  branchId,
  payrollPeriodId,
  actorUserId,
}: SubmitPayrollForApprovalArgs) {
  const result = await prisma.$transaction(async (tx) => {
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

    if (period.status !== PayrollPeriodStatus.PROCESSING) {
      throw new AppError(
        "Only a processing payroll period can be submitted for approval",
        400,
      );
    }

    if (
      period.approvalStatus !== PayrollApprovalStatus.NOT_SUBMITTED &&
      period.approvalStatus !== PayrollApprovalStatus.DECLINED
    ) {
      throw new AppError(
        "Payroll period is not eligible for approval submission",
        400,
      );
    }

    const existingRecord = await tx.payrollRecord.findFirst({
      where: {
        businessId,
        branchId,
        payrollPeriodId,
      },
      select: {
        id: true,
      },
    });

    if (!existingRecord) {
      throw new AppError(
        "Payroll records must exist before submitting for approval",
        400,
      );
    }

    const updated = await tx.payrollPeriod.updateMany({
      where: {
        id: period.id,
        businessId,
        branchId,
        status: PayrollPeriodStatus.PROCESSING,
        approvalStatus: {
          in: [
            PayrollApprovalStatus.NOT_SUBMITTED,
            PayrollApprovalStatus.DECLINED,
          ],
        },
      },
      data: {
        approvalStatus: PayrollApprovalStatus.PENDING,
        approvalSubmittedAt: new Date(),
        approvalSubmittedById: actorUserId,
        approvalDecidedAt: null,
        approvalDecidedById: null,
        approvalReason: null,
      },
    });

    if (updated.count !== 1) {
      throw new AppError(
        "Payroll approval submission could not be completed because its state changed",
        409,
      );
    }

    return tx.payrollPeriod.findFirst({
      where: {
        id: period.id,
        businessId,
        branchId,
      },
    });
  });

  if (!result) {
    throw new AppError("Payroll period not found", 404);
  }

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "payroll_period.submitted_for_approval",
    entityType: "PAYROLL_PERIOD",
    entityId: result.id,
    metadata: {
      payrollPeriodId: result.id,
      approvalStatus: result.approvalStatus,
      submittedAt: result.approvalSubmittedAt?.toISOString() ?? null,
    },
  });

  return result;
}

export async function approvePayroll({
  businessId,
  branchId,
  payrollPeriodId,
  actorUserId,
}: ApprovePayrollArgs) {
  const result = await prisma.$transaction(async (tx) => {
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

    if (period.status !== PayrollPeriodStatus.PROCESSING) {
      throw new AppError(
        "Only a processing payroll period can be approved",
        400,
      );
    }

    if (period.approvalStatus !== PayrollApprovalStatus.PENDING) {
      throw new AppError(
        "Only a pending payroll approval can be approved",
        400,
      );
    }

    if (period.approvalSubmittedById === actorUserId) {
      throw new AppError(
        "The person who submitted the payroll cannot approve the same payroll",
        403,
      );
    }

    const updated = await tx.payrollPeriod.updateMany({
      where: {
        id: period.id,
        businessId,
        branchId,
        status: PayrollPeriodStatus.PROCESSING,
        approvalStatus: PayrollApprovalStatus.PENDING,
      },
      data: {
        approvalStatus: PayrollApprovalStatus.APPROVED,
        approvalDecidedAt: new Date(),
        approvalDecidedById: actorUserId,
        approvalReason: null,
      },
    });

    if (updated.count !== 1) {
      throw new AppError(
        "Payroll approval could not be completed because its state changed",
        409,
      );
    }

    return tx.payrollPeriod.findFirst({
      where: {
        id: period.id,
        businessId,
        branchId,
      },
    });
  });

  if (!result) {
    throw new AppError("Payroll period not found", 404);
  }

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "payroll_period.approved",
    entityType: "PAYROLL_PERIOD",
    entityId: result.id,
    metadata: {
      payrollPeriodId: result.id,
      approvalStatus: result.approvalStatus,
      submittedById: result.approvalSubmittedById,
    },
  });

  return result;
}

export async function declinePayroll({
  businessId,
  branchId,
  payrollPeriodId,
  actorUserId,
  reason,
}: DeclinePayrollArgs) {
  const cleanReason = reason.trim();

  if (!cleanReason) {
    throw new AppError("A decline reason is required", 400);
  }

  const result = await prisma.$transaction(async (tx) => {
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

    if (period.status !== PayrollPeriodStatus.PROCESSING) {
      throw new AppError(
        "Only a processing payroll period can be declined",
        400,
      );
    }

    if (period.approvalStatus !== PayrollApprovalStatus.PENDING) {
      throw new AppError(
        "Only a pending payroll approval can be declined",
        400,
      );
    }

    if (period.approvalSubmittedById === actorUserId) {
      throw new AppError(
        "The person who submitted the payroll cannot decide the same payroll",
        403,
      );
    }

    const updated = await tx.payrollPeriod.updateMany({
      where: {
        id: period.id,
        businessId,
        branchId,
        status: PayrollPeriodStatus.PROCESSING,
        approvalStatus: PayrollApprovalStatus.PENDING,
      },
      data: {
        approvalStatus: PayrollApprovalStatus.DECLINED,
        approvalDecidedAt: new Date(),
        approvalDecidedById: actorUserId,
        approvalReason: cleanReason,
      },
    });

    if (updated.count !== 1) {
      throw new AppError(
        "Payroll decline could not be completed because its state changed",
        409,
      );
    }

    return tx.payrollPeriod.findFirst({
      where: {
        id: period.id,
        businessId,
        branchId,
      },
    });
  });

  if (!result) {
    throw new AppError("Payroll period not found", 404);
  }

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "payroll_period.declined",
    entityType: "PAYROLL_PERIOD",
    entityId: result.id,
    metadata: {
      payrollPeriodId: result.id,
      approvalStatus: result.approvalStatus,
      reason: cleanReason,
      submittedById: result.approvalSubmittedById,
    },
  });

  return result;
}

export async function finalizePayroll({
  businessId,
  branchId,
  payrollPeriodId,
  actorUserId,
}: FinalizePayrollArgs) {
  const result = await prisma.$transaction(async (tx) => {
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

    if (period.status !== PayrollPeriodStatus.PROCESSING) {
      throw new AppError(
        "Only a processing payroll period can be finalized",
        400,
      );
    }

    if (period.approvalStatus !== PayrollApprovalStatus.APPROVED) {
      throw new AppError(
        "Payroll period must be approved before finalization",
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

    for (const record of payrollRecords) {
      if (
        record.grossPay < 0 ||
        record.totalDeductions < 0 ||
        record.netPay < 0
      ) {
        throw new AppError(
          `Invalid payroll totals for employee ${record.employeeId}`,
          400,
        );
      }

      if (record.totalDeductions > record.grossPay) {
        throw new AppError(
          `Payroll deductions exceed gross pay for employee ${record.employeeId}`,
          400,
        );
      }

      const expectedNetPay = record.grossPay - record.totalDeductions;

      if (record.netPay !== expectedNetPay) {
        throw new AppError(
          `Payroll net pay is inconsistent for employee ${record.employeeId}`,
          400,
        );
      }
    }

    const updateResult = await tx.payrollPeriod.updateMany({
      where: {
        id: payrollPeriodId,
        businessId,
        branchId,
        status: PayrollPeriodStatus.PROCESSING,
        approvalStatus: PayrollApprovalStatus.APPROVED,
      },
      data: {
        status: PayrollPeriodStatus.FINALIZED,
      },
    });

    if (updateResult.count !== 1) {
      throw new AppError(
        "Payroll period could not be finalized because its status changed",
        409,
      );
    }

    return {
      payrollPeriodId,
      status: PayrollPeriodStatus.FINALIZED,
      recordCount: payrollRecords.length,
    };
  });

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "payroll_period.finalized",
    entityType: "PAYROLL_PERIOD",
    entityId: payrollPeriodId,
    metadata: {
      payrollPeriodId,
      recordCount: result.recordCount,
    },
  });

  return result;
}

export async function createPayrollPeriod({
  businessId,
  branchId,
  periodStart,
  periodEnd,
  actorUserId,
}: CreatePayrollPeriodArgs) {
  if (periodStart >= periodEnd) {
    throw new AppError(
      "Payroll period start must be before payroll period end",
      400,
    );
  }

  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      businessId,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (!branch) {
    throw new AppError("Branch not found in this business", 404);
  }

  const existing = await prisma.payrollPeriod.findFirst({
    where: {
      businessId,
      branchId,
      periodStart,
      periodEnd,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    throw new AppError(
      "A payroll period already exists for this branch and date range",
      409,
    );
  }

  const period = await prisma.payrollPeriod.create({
    data: {
      businessId,
      branchId,
      periodStart,
      periodEnd,
      status: PayrollPeriodStatus.OPEN,
    },
  });

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "payroll_period.created",
    entityType: "PAYROLL_PERIOD",
    entityId: period.id,
    metadata: {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    },
  });

  return period;
}

export async function getPayrollPeriod({
  businessId,
  branchId,
  id,
}: {
  businessId: string;
  branchId: string;
  id: string;
}) {
  const period = await prisma.payrollPeriod.findFirst({
    where: {
      id,
      businessId,
      branchId,
    },
    include: {
      payrollRecords: {
        orderBy: {
          employeeId: "asc",
        },
        include: {
          employee: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
          deductions: true,
        },
      },
    },
  });

  if (!period) {
    throw new AppError("Payroll period not found", 404);
  }

  return period;
}

export async function listPayrollPeriods({
  businessId,
  branchId,
}: {
  businessId: string;
  branchId: string;
}) {
  return prisma.payrollPeriod.findMany({
    where: {
      businessId,
      branchId,
    },
    orderBy: [
      {
        periodStart: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });
}

export async function generatePayroll({
  businessId,
  branchId,
  payrollPeriodId,
  actorUserId,
}: GeneratePayrollArgs) {
  const period = await prisma.payrollPeriod.findFirst({
    where: {
      id: payrollPeriodId,
      businessId,
      branchId,
    },
  });

  if (!period) {
    throw new AppError("Payroll period not found", 404);
  }

  if (period.status !== PayrollPeriodStatus.OPEN) {
    throw new AppError(
      "Payroll can only be generated for an open payroll period",
      400,
    );
  }

  const employees = await prisma.user.findMany({
    where: {
      businessId,
      isActive: true,
      branches: {
        some: {
          branchId,
        },
      },
    },
    select: {
      id: true,
      fullName: true,
      role: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  if (employees.length === 0) {
    throw new AppError(
      "No active employees are assigned to this branch",
      400,
    );
  }

  const existingRecords = await prisma.payrollRecord.findMany({
    where: {
      businessId,
      branchId,
      payrollPeriodId,
    },
    select: {
      employeeId: true,
    },
  });

  const existingEmployeeIds = new Set(
    existingRecords.map((record) => record.employeeId),
  );

  const recordsToCreate: Array<{
    businessId: string;
    branchId: string;
    payrollPeriodId: string;
    employeeId: string;
    basicSalary: number;
    allowances: number;
    bonuses: number;
    grossPay: number;
    totalDeductions: number;
    netPay: number;
  }> = [];

  for (const employee of employees) {
    if (existingEmployeeIds.has(employee.id)) {
      continue;
    }

    const effectiveWindow = {
      effectiveFrom: { lte: period.periodEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: period.periodEnd } }],
    };
    const compensation = await prisma.employeeCompensation.findFirst({
      where: { businessId, branchId, employeeId: employee.id, ...effectiveWindow },
      orderBy: { effectiveFrom: "desc" },
    });

    if (!compensation) {
      throw new AppError(
        `No compensation record found for employee ${employee.fullName} as of the payroll period end`,
        400,
      );
    }

    const grossPay = compensation.basicSalary;

    recordsToCreate.push({
      businessId,
      branchId,
      payrollPeriodId,
      employeeId: employee.id,
      basicSalary: compensation.basicSalary,
      allowances: 0,
      bonuses: 0,
      grossPay,
      totalDeductions: 0,
      netPay: grossPay,
    });
  }

  if (recordsToCreate.length === 0) {
    throw new AppError(
      "Payroll records have already been generated for this period",
      409,
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.payrollPeriod.update({
      where: {
        id: period.id,
      },
      data: {
        status: PayrollPeriodStatus.PROCESSING,
      },
    });

    const createdRecords = [];

    for (const data of recordsToCreate) {
      const record = await tx.payrollRecord.create({
        data,
      });

      createdRecords.push(record);
    }

    return createdRecords;
  });

  await recordAuditEvent({
    businessId,
    branchId,
    actorUserId,
    action: "payroll_records.generated",
    entityType: "PAYROLL_PERIOD",
    entityId: period.id,
    metadata: {
      recordCount: result.length,
      payrollPeriodId: period.id,
    },
  });

  return {
    payrollPeriodId: period.id,
    status: PayrollPeriodStatus.PROCESSING,
    records: result,
  };
}

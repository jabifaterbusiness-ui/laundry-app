import { prisma } from "../../lib/prisma.js";
import {
  getBusinessFinancialStatement,
  type BusinessFinancialStatementDateRange,
} from "./business-financial-statement.service.js";

export interface GenerateBusinessFinancialStatementInput
  extends BusinessFinancialStatementDateRange {
  businessId: string;
}

export async function generateBusinessFinancialStatement(
  input: GenerateBusinessFinancialStatementInput,
) {
  if (input.from > input.to) {
    throw new Error("Financial statement start date cannot be after end date");
  }

  const business = await prisma.business.findUnique({
    where: {
      id: input.businessId,
    },
    select: {
      id: true,
      currencyCode: true,
    },
  });

  if (!business) {
    throw new Error("Business not found");
  }

  const report = await getBusinessFinancialStatement(input.businessId, {
    from: input.from,
    to: input.to,
  });

  const statement = await prisma.financialStatement.upsert({
    where: {
      businessId_periodStart_periodEnd: {
        businessId: business.id,
        periodStart: input.from,
        periodEnd: input.to,
      },
    },
    create: {
      businessId: business.id,
      periodStart: input.from,
      periodEnd: input.to,
      currencyCode: business.currencyCode,
      grossRevenue: report.revenue.grossInvoiced,
      refundAmount: report.revenue.refunds,
      netRevenue: report.revenue.netRevenue,
      explicitExpenses: report.expenses.explicit,
      salaryExpense: report.expenses.salary,
      totalExpenses: report.expenses.total,
      profitOrLoss: report.profitOrLoss.amount,
    },
    update: {
      currencyCode: business.currencyCode,
      grossRevenue: report.revenue.grossInvoiced,
      refundAmount: report.revenue.refunds,
      netRevenue: report.revenue.netRevenue,
      explicitExpenses: report.expenses.explicit,
      salaryExpense: report.expenses.salary,
      totalExpenses: report.expenses.total,
      profitOrLoss: report.profitOrLoss.amount,
      generatedAt: new Date(),
    },
  });

  return {
    statement,
    report,
  };
}

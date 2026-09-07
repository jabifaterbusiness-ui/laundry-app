import { prisma } from "../../lib/prisma.js";

export interface ReportsScope {
  businessId: string;
  branchId: string;
}

export interface ReportsDateRange {
  from?: Date;
  to?: Date;
}

function buildDateWhere(range: ReportsDateRange) {
  return {
    ...(range.from || range.to
      ? {
          createdAt: {
            ...(range.from ? { gte: range.from } : {}),
            ...(range.to ? { lte: range.to } : {}),
          },
        }
      : {}),
  };
}

export async function getDashboardReport(
  scope: ReportsScope,
  range: ReportsDateRange,
) {
  const dateWhere = buildDateWhere(range);

  const [
    ordersTotal,
    invoicesTotal,
    invoiceAmount,
    postedPayments,
    postedRefunds,
    customersActive,
    inventoryItems,
    inventoryMovements,
  ] = await Promise.all([
    prisma.order.count({
      where: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        ...dateWhere,
      },
    }),

    prisma.invoice.count({
      where: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        ...dateWhere,
      },
    }),

    prisma.invoice.aggregate({
      where: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        ...dateWhere,
      },
      _sum: {
        totalAmount: true,
      },
    }),

    prisma.payment.aggregate({
      where: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        status: "POSTED",
        type: "PAYMENT",
        ...dateWhere,
      },
      _sum: {
        amount: true,
      },
    }),

    prisma.payment.aggregate({
      where: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        status: "POSTED",
        type: "REFUND",
        ...dateWhere,
      },
      _sum: {
        amount: true,
      },
    }),

    prisma.customer.count({
      where: {
        businessId: scope.businessId,
        isActive: true,
      },
    }),

    prisma.inventoryStock.count({
      where: {
        businessId: scope.businessId,
        branchId: scope.branchId,
      },
    }),

    prisma.inventoryMovement.count({
      where: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        ...dateWhere,
      },
    }),
  ]);

  const invoiceTotalAmount = invoiceAmount._sum.totalAmount ?? 0;
  const paymentAmount = postedPayments._sum.amount ?? 0;
  const refundAmount = postedRefunds._sum.amount ?? 0;

  return {
    period: {
      from: range.from ?? null,
      to: range.to ?? null,
    },
    orders: {
      total: ordersTotal,
    },
    invoices: {
      total: invoicesTotal,
      totalAmount: invoiceTotalAmount,
      outstandingAmount: Math.max(
        0,
        invoiceTotalAmount - paymentAmount + refundAmount,
      ),
    },
    payments: {
      received: paymentAmount,
      refunded: refundAmount,
      netReceived: paymentAmount - refundAmount,
    },
    customers: {
      active: customersActive,
    },
    inventory: {
      stockItems: inventoryItems,
      movements: inventoryMovements,
    },
  };
}

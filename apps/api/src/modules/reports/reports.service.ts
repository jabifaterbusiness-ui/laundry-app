import { prisma } from "../../lib/prisma.js";
import { getBranchResourceScope } from "../branches/branch-resource-scope.service.js";

export interface ReportsScope {
  businessId: string;
  branchId: string;
  userId: string;
}

export interface ReportsDateRange {
  from?: Date;
  to?: Date;
}

function buildDateWhere(
  range: ReportsDateRange,
  field = "createdAt",
) {
  return {
    ...(range.from || range.to
      ? {
          [field]: {
            ...(range.from ? { gte: range.from } : {}),
            ...(range.to ? { lte: range.to } : {}),
          },
        }
      : {}),
  };
}

function buildPaymentEndWhere(range: ReportsDateRange) {
  return range.to
    ? { createdAt: { lte: range.to } }
    : {};
}

const MONTHS: [
  string, string, string, string, string, string,
  string, string, string, string, string, string,
] = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export async function getDashboardReport(
  scope: ReportsScope,
  range: ReportsDateRange,
) {
  const dateWhere = buildDateWhere(range);
  const pickupDateWhere = buildDateWhere(range, "pickedUpAt");
  const [customerScope, inventoryScope] = await Promise.all([
    getBranchResourceScope({
      businessId: scope.businessId,
      branchId: scope.branchId,
      userId: scope.userId,
      resourceType: "CUSTOMERS",
    }),
    getBranchResourceScope({
      businessId: scope.businessId,
      branchId: scope.branchId,
      userId: scope.userId,
      resourceType: "INVENTORY",
    }),
  ]);
  const inventoryItemVisibility = {
    OR: [
      { ownerBranchId: null },
      { ownerBranchId: { in: inventoryScope.ownerBranchIds } },
      { id: { in: inventoryScope.resourceIds } },
    ],
  };

  const [
    ordersTotal,
    invoices,
    customersActive,
    inventoryItems,
    inventoryMovements,
    garments,
  ] = await Promise.all([
    prisma.order.count({
      where: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        ...dateWhere,
      },
    }),

    prisma.invoice.findMany({
      where: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        status: "ISSUED",
        ...dateWhere,
      },
      select: {
        id: true,
        invoiceNumber: true,
        totalAmount: true,
        createdAt: true,
        status: true,
        orderId: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),

    prisma.customer.count({
      where: {
        businessId: scope.businessId,
        isActive: true,
        OR: [
          { ownerBranchId: null },
          { ownerBranchId: { in: customerScope.ownerBranchIds } },
          { id: { in: customerScope.resourceIds } },
        ],
      },
    }),

    prisma.inventoryStock.count({
      where: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        inventoryItem: { is: inventoryItemVisibility },
      },
    }),

    prisma.inventoryMovement.count({
      where: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        inventoryItem: { is: inventoryItemVisibility },
        ...dateWhere,
      },
    }),

    prisma.garment.findMany({
      where: {
        businessId: scope.businessId,
        branchId: scope.branchId,
        OR: [
          {
            ...dateWhere,
          },
          {
            status: "PICKED_UP",
            ...pickupDateWhere,
          },
        ],
      },
      select: {
        id: true,
        status: true,
        orderId: true,
        pickedUpAt: true,
        createdAt: true,
      },
    }),
  ]);

  const invoiceIds = invoices.map((invoice) => invoice.id);

  const [payments, refunds] = await Promise.all([
    invoiceIds.length
      ? prisma.payment.findMany({
          where: {
            businessId: scope.businessId,
            branchId: scope.branchId,
            invoiceId: { in: invoiceIds },
            status: "POSTED",
            ...buildPaymentEndWhere(range),
          },
          select: {
            invoiceId: true,
            amount: true,
            type: true,
          },
        })
      : Promise.resolve([]),

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
  ]);

  const netPaidByInvoice = new Map<string, number>();

  for (const payment of payments) {
    const current = netPaidByInvoice.get(payment.invoiceId) ?? 0;

    netPaidByInvoice.set(
      payment.invoiceId,
      current + (payment.type === "REFUND" ? -payment.amount : payment.amount),
    );
  }

  const invoiceRows = invoices.map((invoice) => {
    const collected = Math.max(
      0,
      Math.min(
        invoice.totalAmount,
        netPaidByInvoice.get(invoice.id) ?? 0,
      ),
    );

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.totalAmount,
      collected,
      outstanding: Math.max(0, invoice.totalAmount - collected),
      date: invoice.createdAt,
      status: invoice.status,
    };
  });

  const collected = invoiceRows.reduce(
    (sum, row) => sum + row.collected,
    0,
  );

  const invoiced = invoiceRows.reduce(
    (sum, row) => sum + row.amount,
    0,
  );

  const outstanding = invoiceRows.reduce(
    (sum, row) => sum + row.outstanding,
    0,
  );

  const pickupGarments = garments.filter(
    (garment) =>
      garment.status === "PICKED_UP" &&
      garment.pickedUpAt !== null &&
      (!range.from || garment.pickedUpAt >= range.from) &&
      (!range.to || garment.pickedUpAt <= range.to),
  );

  const unpickedGarments = garments.filter(
    (garment) =>
      garment.status !== "PICKED_UP" &&
      (!range.from || garment.createdAt >= range.from) &&
      (!range.to || garment.createdAt <= range.to),
  );

  const totalGarments = garments.filter(
    (garment) =>
      (!range.from || garment.createdAt >= range.from) &&
      (!range.to || garment.createdAt <= range.to),
  ).length;

  const refundAmount = refunds._sum.amount ?? 0;

  const outstandingByYearMonth: Record<
    string,
    Record<
      string,
      {
        invoiceCount: number;
        outstandingAmount: number;
        invoices: Array<{
          invoiceId: string;
          invoiceNumber: string;
          amount: number;
          outstanding: number;
          date: Date;
        }>;
      }
    >
  > = {};

  for (const row of invoiceRows.filter((item) => item.outstanding > 0)) {
    const date = new Date(row.date);
    const year = String(date.getFullYear());
    const month = MONTHS[date.getMonth()]!;

    outstandingByYearMonth[year] ??= {};
    outstandingByYearMonth[year][month] ??= {
      invoiceCount: 0,
      outstandingAmount: 0,
      invoices: [],
    };

    const bucket = outstandingByYearMonth[year][month];

    bucket.invoiceCount += 1;
    bucket.outstandingAmount += row.outstanding;
    bucket.invoices.push({
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber,
      amount: row.amount,
      outstanding: row.outstanding,
      date: row.date,
    });
  }

  const sortedOutstandingByYearMonth = Object.fromEntries(
    Object.entries(outstandingByYearMonth)
      .sort(([yearA], [yearB]) => Number(yearA) - Number(yearB))
      .map(([year, months]) => [
        year,
        Object.fromEntries(
          Object.entries(months).sort(
            ([monthA], [monthB]) =>
              MONTHS.indexOf(monthA) - MONTHS.indexOf(monthB),
          ),
        ),
      ]),
  );

  const collectionRate =
    invoiced > 0 ? (collected / invoiced) * 100 : 0;

  const managementInsights = [
    outstanding > 0
      ? `Outstanding customer balances total ₦${outstanding.toLocaleString()}.`
      : "There are no outstanding customer balances.",

    unpickedGarments.length > 0
      ? `${unpickedGarments.length.toLocaleString()} garments remain unpicked from the selected order period.`
      : "There are no unpicked garments from the selected order period.",

    invoiced > 0
      ? `Collection performance is ${collectionRate.toFixed(1)}%.`
      : "No issued invoices exist for the selected period.",

    pickupGarments.length > 0
      ? `${pickupGarments.length.toLocaleString()} garments were picked up during the selected period.`
      : "No garment pickup events were recorded during the selected period.",
  ];

  return {
    period: {
      from: range.from ?? null,
      to: range.to ?? null,
    },

    orders: {
      total: ordersTotal,
    },

    invoices: {
      total: invoices.length,
      totalAmount: invoiced,
      collectedAmount: collected,
      outstandingAmount: outstanding,
      collectionRate,
      collectionStatement: invoiceRows,
      outstandingByYearMonth: sortedOutstandingByYearMonth,
    },

    payments: {
      received: collected,
      refunded: refundAmount,
      netReceived: collected - refundAmount,
    },

    pickup: {
      pickedUpCount: pickupGarments.length,
      unpickedCount: unpickedGarments.length,
      totalGarments,
    },

    customers: {
      active: customersActive,
    },

    inventory: {
      stockItems: inventoryItems,
      movements: inventoryMovements,
    },

    managementInsights,
  };
}

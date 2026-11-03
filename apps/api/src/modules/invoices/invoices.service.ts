import type { InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { calculateInvoice } from "./invoice-calculator.js";

async function calculateNewInvoiceDefaults(
  tx: Prisma.TransactionClient,
  businessId: string,
  items: Array<{ id: string; lineTotal: number }>,
  options: {
    adjustments?: Array<{ adjustmentId: string; scope: "INVOICE" | "ITEMS"; itemIndexes?: number[] }>;
    taxRuleIds?: string[];
    automaticAdjustmentIds?: string[];
  } = {},
) {
  // Real Prisma order items always have IDs. Lightweight service/test fixtures may omit
  // them, so give those lines stable per-invoice IDs before resolving item-scoped rules.
  const calculationLines = items.map((item, index) => ({
    ...item,
    id: typeof item.id === "string" && item.id.trim() ? item.id : `invoice-line-${index + 1}`,
  }));
  const adjustmentSelections = options.adjustments ?? [];
  const selectedAdjustmentIds = [...new Set(adjustmentSelections.map((item) => item.adjustmentId))];
  if (selectedAdjustmentIds.length !== adjustmentSelections.length) {
    throw new AppError("An adjustment cannot be selected more than once", 422);
  }
  const adjustmentRecords = selectedAdjustmentIds.length
    ? await tx.priceAdjustment.findMany({
        where: {
          businessId,
          id: { in: selectedAdjustmentIds },
          isActive: true,
          OR: [
            { targetScope: "MANUAL" },
            ...(options.automaticAdjustmentIds?.length
              ? [{ id: { in: options.automaticAdjustmentIds }, targetScope: { in: ["CUSTOMER", "GROUP", "ALL_CUSTOMERS"] } }]
              : []),
          ],
        },
        include: {
          customer: { select: { name: true } },
          group: { select: { name: true } },
        },
      })
    : [];
  if (adjustmentRecords.length !== selectedAdjustmentIds.length) {
    throw new AppError("One or more selected price adjustments are unavailable", 422);
  }
  const adjustmentMap = new Map(adjustmentRecords.map((rule) => [rule.id, rule]));
  const adjustments = (options.adjustments ?? []).map((selection) => {
    const rule = adjustmentMap.get(selection.adjustmentId)!;
    const itemIds = (selection.itemIndexes ?? []).map((index) => {
      if (!Number.isInteger(index) || index < 0 || index >= items.length) {
        throw new AppError("A selected adjustment contains an invalid order item", 422);
      }
      return calculationLines[index]!.id;
    });
    if (selection.scope === "ITEMS" && itemIds.length === 0) {
      throw new AppError("Select at least one item for an item-specific adjustment", 422);
    }
    const targetLabel =
      rule.targetScope === "CUSTOMER"
        ? `Individual customer: ${rule.customer?.name ?? "customer"}`
        : rule.targetScope === "GROUP"
          ? `Customer group: ${rule.group?.name ?? "group"}`
          : rule.targetScope === "ALL_CUSTOMERS"
            ? "Promotion: all customers"
            : null;
    return {
      id: rule.id,
      name: targetLabel ? `${rule.name} — ${targetLabel}` : rule.name,
      percentage: rule.percentage,
      scope: selection.scope,
      itemIds,
    };
  });
  const explicitTaxIds = [...new Set(options.taxRuleIds ?? [])];
  const rules = tx.taxRule
    ? await tx.taxRule.findMany({
        where: {
          businessId,
          isActive: true,
          OR: [
            { enabledByDefault: true },
            ...(explicitTaxIds.length ? [{ id: { in: explicitTaxIds } }] : []),
          ],
        },
        orderBy: { createdAt: "asc" },
      })
    : [];
  if (explicitTaxIds.some((id) => !rules.some((rule) => rule.id === id))) {
    throw new AppError("One or more selected tax rules are unavailable", 422);
  }
  return calculateInvoice(
    calculationLines.map((item) => ({ id: item.id, amount: item.lineTotal })),
    adjustments,
    rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      kind: rule.kind as "PERCENTAGE" | "FIXED",
      value: rule.value,
      treatment: rule.treatment as "ADDITIVE" | "WITHHOLDING",
      enabled: true,
      allowWithOtherTaxes: rule.allowWithOtherTaxes,
    })),
  );
}

export async function resolveAutomaticDiscountSelections(
  tx: Prisma.TransactionClient,
  businessId: string,
  customerId: string,
  items: Array<{ serviceId: string }>,
  manualSelections: Array<{ adjustmentId: string; scope: "INVOICE" | "ITEMS"; itemIndexes?: number[] }>,
) {
  // The delegates are always present on a generated Prisma transaction client.
  // Optional guards keep isolated service tests and legacy lightweight adapters
  // compatible while treating an absent delegate as having no automatic rules.
  const memberships = tx.customerGroupMember
    ? await tx.customerGroupMember.findMany({
        where: { businessId, customerId },
        select: { groupId: true },
      })
    : [];
  const groupIds = memberships.map((membership) => membership.groupId);
  const now = new Date();
  const rules = tx.priceAdjustment
    ? await tx.priceAdjustment.findMany({
        where: {
          businessId,
          isActive: true,
          targetScope: { in: ["CUSTOMER", "GROUP", "ALL_CUSTOMERS"] },
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
            {
              OR: [
                { targetScope: "ALL_CUSTOMERS" },
                { targetScope: "CUSTOMER", customerId },
                ...(groupIds.length ? [{ targetScope: "GROUP", groupId: { in: groupIds } }] : []),
              ],
            },
          ],
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  // A manually selected discount is an explicit choice. Positive surcharges
  // do not count as discount stacking and must not suppress customer benefits.
  const manualDiscounts = manualSelections.length && tx.priceAdjustment
    ? await tx.priceAdjustment.findMany({
        where: {
          businessId,
          id: { in: manualSelections.map((selection) => selection.adjustmentId) },
          isActive: true,
          percentage: { lt: 0 },
          targetScope: "MANUAL",
        },
        select: { id: true },
      })
    : [];
  let eligibleRules = manualDiscounts.length
    ? rules.filter((rule) => rule.allowStacking)
    : rules;

  if (eligibleRules.length > 1 && eligibleRules.some((rule) => !rule.allowStacking)) {
    eligibleRules = [eligibleRules.slice().sort((a, b) => a.percentage - b.percentage)[0]!];
  }

  return eligibleRules.flatMap((rule) => {
    const itemIndexes = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !rule.excludedServiceIds.includes(item.serviceId))
      .map(({ index }) => index);
    if (!itemIndexes.length) return [];
    return [{
      adjustmentId: rule.id,
      scope: itemIndexes.length === items.length ? "INVOICE" as const : "ITEMS" as const,
      ...(itemIndexes.length === items.length ? {} : { itemIndexes }),
    }];
  });
}

export interface CreateInvoiceData {
  businessId: string;
  branchId: string;
  orderId: string;
  customerAgreement: string;
}

export interface ListInvoicesParams {
  businessId: string;
  branchId: string;
  page: number;
  pageSize: number;
  status?: InvoiceStatus;
  customerId?: string;
}

/**
 * Creates an invoice from an existing order.
 *
 * IMPORTANT:
 * - businessId and branchId come from authenticated/request-scoped context.
 * - Prices, quantities, pieces and totals are NEVER accepted from the client.
 * - Customer/company data is snapshotted at invoice creation time.
 * - InvoiceItem rows are historical snapshots of OrderItem.
 * - Creation is atomic.
 */
export async function createInvoice(data: CreateInvoiceData) {
  return prisma.$transaction(async (tx) =>
    createInvoiceWithTx(
      tx,
      data.orderId,
      data.businessId,
      data.branchId,
      data.customerAgreement,
    ),
  );
}

export async function createInvoiceWithTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  businessId: string,
  branchId: string,
  customerAgreement: string,
) {
  const order = await tx.order.findFirst({
    where: {
      id: orderId,
      businessId,
      branchId,
    },
    include: {
      customer: true,
      branch: true,
      items: true,
      business: true,
      invoice: true,
    },
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  if (order.invoice) {
    throw new AppError(
      "An invoice already exists for this order",
      409,
    );
  }

  if (order.items.length === 0) {
    throw new AppError(
      "An invoice cannot be created for an order with no items",
      422,
    );
  }

  const agreement = customerAgreement.trim();

  if (!agreement) {
    throw new AppError(
      "A customer agreement is required to create an invoice",
      422,
    );
  }

  const invoiceItems: Prisma.InvoiceItemCreateWithoutInvoiceInput[] =
    order.items.map((item) => ({
      itemName: item.serviceName,
      colors: item.colors,
      piecesPerUnit: item.piecesPerUnit,
      quantity: item.quantity,
      totalPieces: item.totalPieces,
      unitPrice: item.unitPrice,
      totalPrice: item.lineTotal,
    }));

  const automaticAdjustments = await resolveAutomaticDiscountSelections(
    tx,
    businessId,
    order.customerId,
    order.items,
    [],
  );
  const calculation = await calculateNewInvoiceDefaults(tx, businessId, order.items, {
    adjustments: automaticAdjustments,
    automaticAdjustmentIds: automaticAdjustments.map((selection) => selection.adjustmentId),
  });

  const invoice = await tx.invoice.create({
    data: {
      subtotal: calculation.subtotal,
      adjustedSubtotal: calculation.adjustedSubtotal,
      adjustmentTotal: calculation.adjustmentTotal,
      additiveTaxTotal: calculation.additiveTaxTotal,
      withholdingTaxTotal: calculation.withholdingTaxTotal,
      appliedAdjustments: calculation.adjustments as unknown as Prisma.InputJsonValue,
      appliedTaxes: calculation.taxes as unknown as Prisma.InputJsonValue,
      business: {
        connect: { id: businessId },
      },
      branch: {
        connect: { id: branchId },
      },
      order: {
        connect: { id: order.id },
      },
      invoiceNumber: order.orderNumber,
      status: "ISSUED",
      customerName: order.customer.name,
      companyName: order.business.name,
      companyPhone: order.business.phone,
      companyEmail: order.business.email,
      companyWebsite: order.business.website,
      companyAddress: order.business.address,
      logoUrl: order.business.logoUrl,
      receiptPrimaryColor: order.business.receiptPrimaryColor,
      receiptAccentColor: order.business.receiptAccentColor,
      receiptBackgroundColor: order.business.receiptBackgroundColor,
      receiptTextColor: order.business.receiptTextColor,
      receiptHeaderStyle: order.business.receiptHeaderStyle,
      totalAmount: calculation.totalAmount,
      garmentNote: order.garmentNote,
      internalNote: order.internalNote,
      customerAgreement: agreement,
      items: {
        create: invoiceItems,
      },
    },
    include: {
      items: true,
      order: {
        include: {
          customer: true,
          branch: true,
        },
      },
    },
  });

  // Keep the order list total aligned when an invoice is issued separately
  // for an existing order and an automatic discount is applied.
  await tx.order.update({
    where: { id: order.id },
    data: { orderTotal: invoice.totalAmount },
  });
  return invoice;
}

export async function createInvoiceFromOrderWithTx(
  tx: Prisma.TransactionClient,
  order: Prisma.OrderGetPayload<{
    include: {
      customer: true;
      branch: true;
      items: true;
    };
  }>,
  business: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    website: string | null;
    address: string | null;
    logoUrl: string | null;
    receiptPrimaryColor: string | null;
    receiptAccentColor: string | null;
    receiptBackgroundColor: string | null;
    receiptTextColor: string | null;
    receiptHeaderStyle: string | null;
  },
  customerAgreement: string,
  pricingOptions: {
    adjustments?: Array<{ adjustmentId: string; scope: "INVOICE" | "ITEMS"; itemIndexes?: number[] }>;
    taxRuleIds?: string[];
  } = {},
) {
  const agreement = customerAgreement.trim();

  if (!agreement) {
    throw new AppError(
      "A customer agreement is required to create an invoice",
      422,
    );
  }

  const invoiceItems: Prisma.InvoiceItemCreateWithoutInvoiceInput[] =
    order.items.map((item) => ({
      itemName: item.serviceName,
      colors: item.colors,
      piecesPerUnit: item.piecesPerUnit,
      quantity: item.quantity,
      totalPieces: item.totalPieces,
      unitPrice: item.unitPrice,
      totalPrice: item.lineTotal,
    }));

  const automaticAdjustments = await resolveAutomaticDiscountSelections(
    tx,
    business.id,
    order.customerId,
    order.items,
    pricingOptions.adjustments ?? [],
  );
  const calculation = await calculateNewInvoiceDefaults(tx, business.id, order.items, {
    ...pricingOptions,
    adjustments: [...(pricingOptions.adjustments ?? []), ...automaticAdjustments],
    automaticAdjustmentIds: automaticAdjustments.map((selection) => selection.adjustmentId),
  });

  const invoice = await tx.invoice.create({
    data: {
      subtotal: calculation.subtotal,
      adjustedSubtotal: calculation.adjustedSubtotal,
      adjustmentTotal: calculation.adjustmentTotal,
      additiveTaxTotal: calculation.additiveTaxTotal,
      withholdingTaxTotal: calculation.withholdingTaxTotal,
      appliedAdjustments: calculation.adjustments as unknown as Prisma.InputJsonValue,
      appliedTaxes: calculation.taxes as unknown as Prisma.InputJsonValue,
      business: {
        connect: { id: business.id },
      },
      branch: {
        connect: { id: order.branchId },
      },
      order: {
        connect: { id: order.id },
      },
      invoiceNumber: order.orderNumber,
      status: "ISSUED",
      customerName: order.customer.name,
      companyName: business.name,
      companyPhone: business.phone,
      companyEmail: business.email,
      companyWebsite: business.website,
      companyAddress: business.address,
      logoUrl: business.logoUrl,
      receiptPrimaryColor: business.receiptPrimaryColor,
      receiptAccentColor: business.receiptAccentColor,
      receiptBackgroundColor: business.receiptBackgroundColor,
      receiptTextColor: business.receiptTextColor,
      receiptHeaderStyle: business.receiptHeaderStyle,
      totalAmount: calculation.totalAmount,
      garmentNote: order.garmentNote,
      internalNote: order.internalNote,
      customerAgreement: agreement,
      items: {
        create: invoiceItems,
      },
    },
    include: {
      items: true,
      order: {
        include: {
          customer: true,
          branch: true,
        },
      },
    },
  });

  // Keep the order list total aligned with the discounted invoice created
  // in this same transaction.
  await tx.order.update({
    where: { id: order.id },
    data: { orderTotal: invoice.totalAmount },
  });

  return invoice;

}
/**
 * Tenant- and branch-scoped invoice lookup.
 *
 * Customer-facing and company-facing receipt generation must both use
 * this scope so an invoice from another tenant or branch can never leak.
 */
export async function getInvoiceForBranch(
  id: string,
  businessId: string,
  branchId: string,
) {
  return prisma.invoice.findFirst({
    where: {
      id,
      businessId,
      branchId,
    },
    include: {
      items: {
        orderBy: {
          createdAt: "asc",
        },
      },
      order: {
        include: {
          customer: true,
          branch: true,
        },
      },
    },
  });
}

/**
 * Retrieves an invoice by its order while preserving tenant and branch
 * isolation.
 */
export async function getInvoiceForOrder(
  orderId: string,
  businessId: string,
  branchId: string,
) {
  return prisma.invoice.findFirst({
    where: {
      orderId,
      businessId,
      branchId,
    },
    include: {
      items: {
        orderBy: {
          createdAt: "asc",
        },
      },
      order: {
        include: {
          customer: true,
          branch: true,
        },
      },
    },
  });
}

export async function listInvoices(params: ListInvoicesParams) {
  const {
    businessId,
    branchId,
    page,
    pageSize,
    status,
    customerId,
  } = params;

  const where: Prisma.InvoiceWhereInput = {
    businessId,
    branchId,
    ...(status ? { status } : {}),
    ...(customerId
      ? {
          order: {
            customerId,
          },
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        items: {
          orderBy: {
            createdAt: "asc",
          },
        },
        order: {
          include: {
            customer: true,
            branch: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invoice.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

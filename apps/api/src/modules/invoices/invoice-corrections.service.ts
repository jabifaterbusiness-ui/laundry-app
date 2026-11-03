import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { calculateInvoice } from "./invoice-calculator.js";

const HISTORY_RETENTION_DAYS = 60;

export type InvoiceCorrectionItemInput = {
  itemName: string;
  colors: string[];
  piecesPerUnit: number;
  quantity: number;
  unitPrice: number;
};

export type UpdateInvoiceCorrectionInput = {
  garmentNote?: string | null;
  internalNote?: string | null;
  customerAgreement?: string;
  items?: InvoiceCorrectionItemInput[];
};

type InvoiceWithItems = Prisma.InvoiceGetPayload<{
  include: {
    items: true;
    payments: true;
    order: {
      include: {
        customer: true;
        branch: true;
      };
    };
  };
}>;

function buildSnapshot(invoice: InvoiceWithItems) {
  return {
    id: invoice.id,
    businessId: invoice.businessId,
    branchId: invoice.branchId,
    orderId: invoice.orderId,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    customerName: invoice.customerName,
    companyName: invoice.companyName,
    companyPhone: invoice.companyPhone,
    companyEmail: invoice.companyEmail,
    companyWebsite: invoice.companyWebsite,
    companyAddress: invoice.companyAddress,
    logoUrl: invoice.logoUrl,
    receiptPrimaryColor: invoice.receiptPrimaryColor,
    receiptAccentColor: invoice.receiptAccentColor,
    receiptBackgroundColor: invoice.receiptBackgroundColor,
    receiptTextColor: invoice.receiptTextColor,
    receiptHeaderStyle: invoice.receiptHeaderStyle,
    subtotal: invoice.subtotal,
    adjustedSubtotal: invoice.adjustedSubtotal,
    adjustmentTotal: invoice.adjustmentTotal,
    additiveTaxTotal: invoice.additiveTaxTotal,
    withholdingTaxTotal: invoice.withholdingTaxTotal,
    appliedAdjustments: invoice.appliedAdjustments,
    appliedTaxes: invoice.appliedTaxes,
    totalAmount: invoice.totalAmount,
    garmentNote: invoice.garmentNote,
    internalNote: invoice.internalNote,
    customerAgreement: invoice.customerAgreement,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    items: invoice.items.map((item) => ({
      id: item.id,
      invoiceId: item.invoiceId,
      itemName: item.itemName,
      colors: [...item.colors],
      piecesPerUnit: item.piecesPerUnit,
      quantity: item.quantity,
      totalPieces: item.totalPieces,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

function requireReason(reason: string): string {
  const normalized = reason.trim();

  if (!normalized) {
    throw new AppError(
      "A reason is required for this invoice correction",
      422,
    );
  }

  if (normalized.length > 1000) {
    throw new AppError(
      "Invoice correction reason is too long",
      422,
    );
  }

  return normalized;
}

async function getInvoiceForCorrection(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  businessId: string,
  branchId: string,
): Promise<InvoiceWithItems> {
  const invoice = await tx.invoice.findFirst({
    where: {
      id: invoiceId,
      businessId,
      branchId,
    },
    include: {
      items: {
        orderBy: {
          createdAt: "asc",
        },
      },
      payments: {
        where: { status: "POSTED" },
        select: { amount: true, type: true },
      },
      order: {
        include: {
          customer: true,
          branch: true,
        },
      },
    },
  });

  if (!invoice) {
    throw new AppError("Invoice not found", 404);
  }

  return invoice;
}

async function createHistorySnapshot(
  tx: Prisma.TransactionClient,
  invoice: InvoiceWithItems,
  action: string,
  reason: string,
  actorUserId: string,
) {
  const latest = await tx.invoiceHistory.findFirst({
    where: {
      invoiceId: invoice.id,
    },
    orderBy: {
      version: "desc",
    },
    select: {
      version: true,
    },
  });

  return tx.invoiceHistory.create({
    data: {
      id: randomUUID(),
      invoiceId: invoice.id,
      businessId: invoice.businessId,
      branchId: invoice.branchId,
      action,
      version: (latest?.version ?? 0) + 1,
      reason,
      actorUserId,
      snapshot: buildSnapshot(invoice),
      expiresAt: new Date(
        Date.now() +
          HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      ),
    },
  });
}

function normalizeItems(items: InvoiceCorrectionItemInput[]) {
  if (items.length === 0) {
    throw new AppError(
      "An invoice must contain at least one item",
      422,
    );
  }

  return items.map((item) => {
    const itemName = item.itemName.trim();

    if (!itemName) {
      throw new AppError(
        "Invoice item name is required",
        422,
      );
    }

    if (
      item.piecesPerUnit <= 0 ||
      item.quantity <= 0 ||
      item.unitPrice < 0
    ) {
      throw new AppError(
        "Invoice item quantities and prices are invalid",
        422,
      );
    }

    const totalPieces =
      item.piecesPerUnit * item.quantity;

    const totalPrice =
      item.quantity * item.unitPrice;

    return {
      itemName,
      colors: item.colors.map((color) => color.trim()).filter(Boolean),
      piecesPerUnit: item.piecesPerUnit,
      quantity: item.quantity,
      totalPieces,
      unitPrice: item.unitPrice,
      totalPrice,
    };
  });
}

export async function updateInvoiceWithCorrection(params: {
  invoiceId: string;
  businessId: string;
  branchId: string;
  actorUserId: string;
  reason: string;
  input: UpdateInvoiceCorrectionInput;
}) {
  const reason = requireReason(params.reason);

  return prisma.$transaction(async (tx) => {
    const current = await getInvoiceForCorrection(
      tx,
      params.invoiceId,
      params.businessId,
      params.branchId,
    );

    if (current.status === "VOID") {
      throw new AppError(
        "A void invoice cannot be edited",
        422,
      );
    }

    const history = await createHistorySnapshot(
      tx,
      current,
      "EDITED",
      reason,
      params.actorUserId,
    );

    const data: Prisma.InvoiceUpdateInput = {};

    if (params.input.garmentNote !== undefined) {
      data.garmentNote =
        params.input.garmentNote?.trim() || null;
    }

    if (params.input.internalNote !== undefined) {
      data.internalNote =
        params.input.internalNote?.trim() || null;
    }

    if (params.input.customerAgreement !== undefined) {
      const agreement =
        params.input.customerAgreement.trim();

      if (!agreement) {
        throw new AppError(
          "A customer agreement is required",
          422,
        );
      }

      data.customerAgreement = agreement;
    }

    let totalAmount = current.totalAmount;

    if (params.input.items !== undefined) {
      const items = normalizeItems(params.input.items);
      const lines = items.map((item, index) => ({ id: String(index), amount: item.totalPrice }));
      const savedAdjustments = Array.isArray(current.appliedAdjustments)
        ? current.appliedAdjustments.flatMap((value) => {
            if (!value || typeof value !== "object" || Array.isArray(value)) return [];
            const rule = value as Record<string, unknown>;
            if (typeof rule.id !== "string" || typeof rule.name !== "string" || typeof rule.percentage !== "number") return [];
            const scope = rule.scope === "ITEMS" ? "ITEMS" : "INVOICE";
            const indexes = Array.isArray(rule.itemIndexes)
              ? rule.itemIndexes.filter((index): index is number => typeof index === "number" && Number.isInteger(index) && index >= 0 && index < items.length)
              : [];
            if (scope === "ITEMS" && indexes.length === 0) return [];
            return [{ id: rule.id, name: rule.name, percentage: rule.percentage, scope, itemIds: indexes.map(String) }];
          })
        : [];
      const savedTaxes = Array.isArray(current.appliedTaxes)
        ? current.appliedTaxes.flatMap((value) => {
            if (!value || typeof value !== "object" || Array.isArray(value)) return [];
            const rule = value as Record<string, unknown>;
            if (typeof rule.id !== "string" || typeof rule.name !== "string" ||
              (rule.kind !== "PERCENTAGE" && rule.kind !== "FIXED") ||
              typeof rule.value !== "number" ||
              (rule.treatment !== "ADDITIVE" && rule.treatment !== "WITHHOLDING")) return [];
            return [{ id: rule.id, name: rule.name, kind: rule.kind, value: rule.value, treatment: rule.treatment, enabled: true, allowWithOtherTaxes: true }];
          })
        : [];
      const calculation = calculateInvoice(lines, savedAdjustments, savedTaxes);
      const amountPaid = (current.payments ?? []).reduce((sum, payment) => sum + (payment.type === "REFUND" ? -payment.amount : payment.amount), 0);
      if (amountPaid > calculation.totalAmount) {
        throw new AppError("The revised invoice total is below the amount already paid. Record an appropriate refund or account credit first.", 422);
      }
      totalAmount = calculation.totalAmount;
      data.subtotal = calculation.subtotal;
      data.adjustedSubtotal = calculation.adjustedSubtotal;
      data.adjustmentTotal = calculation.adjustmentTotal;
      data.additiveTaxTotal = calculation.additiveTaxTotal;
      data.withholdingTaxTotal = calculation.withholdingTaxTotal;
      data.appliedAdjustments = calculation.adjustments;
      data.appliedTaxes = calculation.taxes;

      await tx.invoiceItem.deleteMany({ where: { invoiceId: current.id } });
      data.items = { create: items };
      data.totalAmount = totalAmount;
    }

    const updated = await tx.invoice.update({
      where: {
        id: current.id,
      },
      data,
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

    if (params.input.items !== undefined) {
      await tx.order.update({ where: { id: current.orderId }, data: { orderTotal: totalAmount } });
    }

    return {
      invoice: updated,
      history,
      before: buildSnapshot(current),
      after: buildSnapshot(updated),
      reason,
    };
  });
}

export async function voidInvoiceWithCorrection(params: {
  invoiceId: string;
  businessId: string;
  branchId: string;
  actorUserId: string;
  reason: string;
}) {
  const reason = requireReason(params.reason);

  return prisma.$transaction(async (tx) => {
    const current = await getInvoiceForCorrection(
      tx,
      params.invoiceId,
      params.businessId,
      params.branchId,
    );

    if (current.status === "VOID") {
      throw new AppError(
        "Invoice is already void",
        422,
      );
    }

    const history = await createHistorySnapshot(
      tx,
      current,
      "VOIDED",
      reason,
      params.actorUserId,
    );

    const updated = await tx.invoice.update({
      where: {
        id: current.id,
      },
      data: {
        status: "VOID",
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

    return {
      invoice: updated,
      history,
      before: buildSnapshot(current),
      after: buildSnapshot(updated),
      reason,
    };
  });
}

export async function deleteInvoiceWithCorrection(params: {
  invoiceId: string;
  businessId: string;
  branchId: string;
  actorUserId: string;
  reason: string;
}) {
  const reason = requireReason(params.reason);

  return prisma.$transaction(async (tx) => {
    const current = await getInvoiceForCorrection(
      tx,
      params.invoiceId,
      params.businessId,
      params.branchId,
    );

    if (current.status === "VOID") {
      throw new AppError(
        "Invoice is already void",
        422,
      );
    }

    const history = await createHistorySnapshot(
      tx,
      current,
      "DELETED",
      reason,
      params.actorUserId,
    );

    const updated = await tx.invoice.update({
      where: {
        id: current.id,
      },
      data: {
        status: "VOID",
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

    return {
      invoice: updated,
      history,
      before: buildSnapshot(current),
      after: buildSnapshot(updated),
      reason,
    };
  });
}

export async function transferInvoiceWithCorrection(params: {
  invoiceId: string;
  customerId: string;
  businessId: string;
  branchId: string;
  actorUserId: string;
  reason: string;
}) {
  const reason = requireReason(params.reason);

  return prisma.$transaction(async (tx) => {
    const current = await getInvoiceForCorrection(
      tx,
      params.invoiceId,
      params.businessId,
      params.branchId,
    );

    if (current.status === "VOID") {
      throw new AppError(
        "A void invoice cannot be transferred",
        422,
      );
    }

    if (current.order.customerId === params.customerId) {
      throw new AppError(
        "Invoice is already assigned to this customer",
        422,
      );
    }

    const targetCustomer = await tx.customer.findFirst({
      where: {
        id: params.customerId,
        businessId: params.businessId,
      },
    });

    if (!targetCustomer) {
      throw new AppError(
        "Target customer not found",
        404,
      );
    }

    const history = await createHistorySnapshot(
      tx,
      current,
      "TRANSFERRED",
      reason,
      params.actorUserId,
    );

    await tx.order.update({
      where: {
        id: current.orderId,
      },
      data: {
        customerId: targetCustomer.id,
      },
    });

    const updated = await tx.invoice.update({
      where: {
        id: current.id,
      },
      data: {
        customerName: targetCustomer.name,
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

    return {
      invoice: updated,
      history,
      before: buildSnapshot(current),
      after: buildSnapshot(updated),
      previousCustomerId: current.order.customerId,
      newCustomerId: targetCustomer.id,
      reason,
    };
  });
}

export async function listInvoiceHistory(params: {
  invoiceId: string;
  businessId: string;
  branchId: string;
}) {
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: params.invoiceId,
      businessId: params.businessId,
      branchId: params.branchId,
    },
    select: {
      id: true,
    },
  });

  if (!invoice) {
    throw new AppError("Invoice not found", 404);
  }

  return prisma.invoiceHistory.findMany({
    where: {
      invoiceId: invoice.id,
      businessId: params.businessId,
      branchId: params.branchId,
    },
    orderBy: {
      version: "desc",
    },
  });
}

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { calculateInvoice } from "../invoices/invoice-calculator.js";

const HISTORY_RETENTION_DAYS = 60;

export type EditOrderItemInput = {
  id?: string;
  serviceId: string;
  quantity: number;
  colors: string[];
};

export type EditOrderInput = {
  reason: string;
  confirmed: true;
  items: EditOrderItemInput[];
  garmentNote?: string | null;
  internalNote?: string | null;
  expectedReadyAt?: Date | null;
  customerAgreement?: string;
};

type OrderForCorrection = Prisma.OrderGetPayload<{
  include: {
    customer: true;
    branch: true;
    items: true;
    garments: true;
    invoice: {
      include: {
        items: true;
      };
    };
  };
}>;

function requireReason(reason: string): string {
  const normalized = reason.trim();

  if (!normalized) {
    throw new AppError(
      "A reason is required for this order correction",
      422,
    );
  }

  if (normalized.length > 1000) {
    throw new AppError(
      "Order correction reason is too long",
      422,
    );
  }

  return normalized;
}

function buildInvoiceSnapshot(invoice: OrderForCorrection["invoice"]) {
  if (!invoice) {
    return null;
  }

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

function buildOrderSnapshot(order: OrderForCorrection) {
  return {
    id: order.id,
    businessId: order.businessId,
    branchId: order.branchId,
    customerId: order.customerId,
    orderNumber: order.orderNumber,
    status: order.status,
    orderTotal: order.orderTotal,
    expectedReadyAt: order.expectedReadyAt?.toISOString() ?? null,
    readyAt: order.readyAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    garmentNote: order.garmentNote,
    internalNote: order.internalNote,
    items: order.items.map((item) => ({
      id: item.id,
      serviceId: item.serviceId,
      serviceName: item.serviceName,
      colors: [...item.colors],
      piecesPerUnit: item.piecesPerUnit,
      quantity: item.quantity,
      totalPieces: item.totalPieces,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
    garments: order.garments.map((garment) => ({
      id: garment.id,
      orderItemId: garment.orderItemId,
      garmentNumber: garment.garmentNumber,
      status: garment.status,
      note: garment.note,
    })),
    invoice: buildInvoiceSnapshot(order.invoice),
  };
}

async function getOrderForCorrection(
  tx: Prisma.TransactionClient,
  orderId: string,
  businessId: string,
  branchId: string,
): Promise<OrderForCorrection> {
  const order = await tx.order.findFirst({
    where: {
      id: orderId,
      businessId,
      branchId,
    },
    include: {
      customer: true,
      branch: true,
      items: {
        orderBy: {
          createdAt: "asc",
        },
      },
      garments: {
        orderBy: [
          { orderItemId: "asc" },
          { garmentNumber: "asc" },
        ],
      },
      invoice: {
        include: {
          items: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      },
    },
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  if (!order.invoice) {
    throw new AppError(
      "This order does not have an invoice and cannot be edited as an invoice",
      422,
    );
  }

  return order;
}

async function createHistorySnapshot(
  tx: Prisma.TransactionClient,
  invoice: NonNullable<OrderForCorrection["invoice"]>,
  reason: string,
  actorUserId: string,
  snapshot: ReturnType<typeof buildInvoiceSnapshot>,
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
      action: "EDITED",
      version: (latest?.version ?? 0) + 1,
      reason,
      actorUserId,
      snapshot: snapshot ?? {},
      expiresAt: new Date(
        Date.now() +
          HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      ),
    },
  });
}

function validateInputItems(items: EditOrderItemInput[]) {
  if (items.length === 0) {
    throw new AppError(
      "An order must contain at least one item",
      422,
    );
  }

  const seenIds = new Set<string>();

  for (const item of items) {
    if (item.quantity <= 0 || !Number.isInteger(item.quantity)) {
      throw new AppError(
        "Quantity must be a positive whole number",
        422,
      );
    }

    if (item.id) {
      if (seenIds.has(item.id)) {
        throw new AppError(
          "An order item cannot be submitted more than once",
          422,
        );
      }

      seenIds.add(item.id);
    }
  }
}

export async function editOrderWithCorrection(params: {
  orderId: string;
  businessId: string;
  branchId: string;
  actorUserId: string;
  input: EditOrderInput;
}) {
  const reason = requireReason(params.input.reason);

  if (params.input.confirmed !== true) {
    throw new AppError(
      "Confirmation is required before editing an invoice",
      422,
    );
  }

  validateInputItems(params.input.items);

  return prisma.$transaction(async (tx) => {
    const current = await getOrderForCorrection(
      tx,
      params.orderId,
      params.businessId,
      params.branchId,
    );

    if (current.invoice!.status === "VOID") {
      throw new AppError(
        "A void invoice cannot be edited",
        422,
      );
    }

    /*
     * Customer identity is deliberately not accepted from the request.
     * The existing order.customerId remains authoritative.
     */

    const serviceIds = [
      ...new Set(
        params.input.items.map((item) => item.serviceId),
      ),
    ];

    const services = await tx.service.findMany({
      where: {
        id: {
          in: serviceIds,
        },
        businessId: params.businessId,
      },
      select: {
        id: true,
        name: true,
        pieces: true,
        unitPrice: true,
        isActive: true,
      },
    });

    if (services.length !== serviceIds.length) {
      throw new AppError(
        "One or more selected services were not found",
        422,
      );
    }

    const serviceMap = new Map(
      services.map((service) => [service.id, service]),
    );

    const customerPrices = await tx.customerServicePrice.findMany({
      where: {
        businessId: params.businessId,
        customerId: current.customerId,
        serviceId: { in: serviceIds },
      },
      select: { serviceId: true, unitPrice: true },
    });
    const customerPriceMap = new Map(
      customerPrices.map((price) => [price.serviceId, price.unitPrice]),
    );

    for (const service of services) {
      if (!service.isActive) {
        throw new AppError(
          `Service "${service.name}" is inactive and cannot be added to an edited order`,
          422,
        );
      }
    }

    const currentItemsById = new Map(
      current.items.map((item) => [item.id, item]),
    );

    const submittedExistingIds = new Set(
      params.input.items
        .map((item) => item.id)
        .filter((id): id is string => Boolean(id)),
    );

    for (const item of params.input.items) {
      if (item.id && !currentItemsById.has(item.id)) {
        throw new AppError(
          "One or more order items do not belong to this order",
          422,
        );
      }
    }

    const removedItems = current.items.filter(
      (item) => !submittedExistingIds.has(item.id),
    );

    for (const removedItem of removedItems) {
      const garments = current.garments.filter(
        (garment) => garment.orderItemId === removedItem.id,
      );

      const unsafe = garments.find(
        (garment) => garment.status !== "RECEIVED",
      );

      if (unsafe) {
        throw new AppError(
          `Order item "${removedItem.serviceName}" cannot be removed because garment history has already progressed`,
          422,
        );
      }
    }

    const preparedItems = params.input.items.map((input) => {
      const service = serviceMap.get(input.serviceId)!;
      const existingItem = input.id ? currentItemsById.get(input.id) : undefined;
      // Retain the exact historical unit price when the existing service line
      // remains unchanged. New or explicitly changed service lines use the
      // customer's active override, falling back to the standard price list.
      const unitPrice = existingItem?.serviceId === service.id
        ? existingItem.unitPrice
        : customerPriceMap.get(service.id) ?? service.unitPrice;
      const totalPieces = service.pieces * input.quantity;
      const lineTotal = unitPrice * input.quantity;

      return { input, service, unitPrice, totalPieces, lineTotal };
    });

    /*
     * Reconcile garments before changing quantities.
     * Existing processed garments are never silently deleted.
     */
    for (const prepared of preparedItems) {
      if (!prepared.input.id) {
        continue;
      }

      const existingItem = currentItemsById.get(
        prepared.input.id,
      )!;

      const existingGarments = current.garments.filter(
        (garment) =>
          garment.orderItemId === existingItem.id,
      );

      if (prepared.totalPieces < existingGarments.length) {
        const surplus = existingGarments.filter(
          (garment) =>
            garment.garmentNumber > prepared.totalPieces,
        );

        const unsafe = surplus.find(
          (garment) => garment.status !== "RECEIVED",
        );

        if (unsafe) {
          throw new AppError(
            `Quantity for "${existingItem.serviceName}" cannot be reduced because processed garment history would be removed`,
            422,
          );
        }
      }
    }

    /*
     * Remove deleted order items only after all safety checks pass.
     */
    for (const removedItem of removedItems) {
      await tx.garment.deleteMany({
        where: {
          orderItemId: removedItem.id,
          businessId: params.businessId,
          branchId: params.branchId,
        },
      });

      await tx.orderItem.delete({
        where: {
          id: removedItem.id,
        },
      });
    }

    const resultingItemIds = new Set<string>();

    for (const prepared of preparedItems) {
      const { input, service, unitPrice, totalPieces, lineTotal } =
        prepared;

      if (input.id) {
        resultingItemIds.add(input.id);

        await tx.orderItem.update({
          where: {
            id: input.id,
          },
          data: {
            serviceId: service.id,
            serviceName: service.name,
            colors: input.colors,
            piecesPerUnit: service.pieces,
            quantity: input.quantity,
            totalPieces,
            unitPrice,
            lineTotal,
          },
        });

        const existingGarments = current.garments.filter(
          (garment) =>
            garment.orderItemId === input.id,
        );

        if (totalPieces < existingGarments.length) {
          await tx.garment.deleteMany({
            where: {
              orderItemId: input.id,
              businessId: params.businessId,
              branchId: params.branchId,
              garmentNumber: {
                gt: totalPieces,
              },
              status: "RECEIVED",
            },
          });
        }

        if (totalPieces > existingGarments.length) {
          const existingNumbers = new Set(
            existingGarments.map(
              (garment) => garment.garmentNumber,
            ),
          );

          const creates: Prisma.GarmentCreateManyInput[] = [];

          for (
            let number = 1;
            number <= totalPieces;
            number += 1
          ) {
            if (existingNumbers.has(number)) {
              continue;
            }

            creates.push({
              businessId: params.businessId,
              branchId: params.branchId,
              orderId: current.id,
              orderItemId: input.id,
              garmentNumber: number,
              status: "RECEIVED",
            });
          }

          if (creates.length > 0) {
            await tx.garment.createMany({
              data: creates,
            });
          }
        }
      } else {
        const created = await tx.orderItem.create({
          data: {
            orderId: current.id,
            serviceId: service.id,
            serviceName: service.name,
            colors: input.colors,
            piecesPerUnit: service.pieces,
            quantity: input.quantity,
            totalPieces,
            unitPrice,
            lineTotal,
          },
        });

        resultingItemIds.add(created.id);

        const creates: Prisma.GarmentCreateManyInput[] = [];

        for (
          let number = 1;
          number <= totalPieces;
          number += 1
        ) {
          creates.push({
            businessId: params.businessId,
            branchId: params.branchId,
            orderId: current.id,
            orderItemId: created.id,
            garmentNumber: number,
            status: "RECEIVED",
          });
        }

        if (creates.length > 0) {
          await tx.garment.createMany({
            data: creates,
          });
        }
      }
    }

    const invoice = current.invoice!;
    const calculationLines = preparedItems.map((item, index) => ({
      id: item.input.id ?? `new-${index}`,
      amount: item.lineTotal,
    }));
    const lineIds = new Set(calculationLines.map((line) => line.id));
    const savedAdjustments = Array.isArray(invoice.appliedAdjustments)
      ? invoice.appliedAdjustments.flatMap((value) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return [];
          const rule = value as Record<string, unknown>;
          if (typeof rule.id !== "string" || typeof rule.name !== "string" || typeof rule.percentage !== "number") return [];
          const scope = rule.scope === "ITEMS" ? "ITEMS" : "INVOICE";
          const itemIndexes = Array.isArray(rule.itemIndexes)
            ? rule.itemIndexes.filter((index): index is number => typeof index === "number" && Number.isInteger(index) && index >= 0 && index < calculationLines.length)
            : [];
          const itemIds = itemIndexes.length
            ? itemIndexes.map((index) => calculationLines[index]!.id)
            : Array.isArray(rule.itemIds)
              ? rule.itemIds.filter((id): id is string => typeof id === "string" && lineIds.has(id))
              : [];
          if (scope === "ITEMS" && itemIds.length === 0) return [];
          return [{ id: rule.id, name: rule.name, percentage: rule.percentage, scope, itemIds }];
        })
      : [];
    const savedTaxes = Array.isArray(invoice.appliedTaxes)
      ? invoice.appliedTaxes.flatMap((value) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return [];
          const rule = value as Record<string, unknown>;
          if (
            typeof rule.id !== "string" || typeof rule.name !== "string" ||
            (rule.kind !== "PERCENTAGE" && rule.kind !== "FIXED") ||
            typeof rule.value !== "number" ||
            (rule.treatment !== "ADDITIVE" && rule.treatment !== "WITHHOLDING")
          ) return [];
          return [{
            id: rule.id, name: rule.name, kind: rule.kind, value: rule.value,
            treatment: rule.treatment, enabled: true, allowWithOtherTaxes: true,
          }];
        })
      : [];
    const calculation = calculateInvoice(calculationLines, savedAdjustments, savedTaxes);
    const orderTotal = calculation.totalAmount;

    const orderData: Prisma.OrderUpdateInput = {
      orderTotal,
    };

    if (params.input.garmentNote !== undefined) {
      orderData.garmentNote =
        params.input.garmentNote?.trim() || null;
    }

    if (params.input.internalNote !== undefined) {
      orderData.internalNote =
        params.input.internalNote?.trim() || null;
    }

    if (params.input.expectedReadyAt !== undefined) {
      orderData.expectedReadyAt =
        params.input.expectedReadyAt;
    }

    const updatedOrderBase = await tx.order.update({
      where: {
        id: current.id,
      },
      data: orderData,
    });

    let customerAgreement = invoice.customerAgreement;

    if (params.input.customerAgreement !== undefined) {
      customerAgreement =
        params.input.customerAgreement.trim();

      if (!customerAgreement) {
        throw new AppError(
          "A customer agreement is required",
          422,
        );
      }
    }

    await tx.invoiceItem.deleteMany({
      where: {
        invoiceId: invoice.id,
      },
    });

    await tx.invoice.update({
      where: {
        id: invoice.id,
      },
      data: {
        subtotal: calculation.subtotal,
        adjustedSubtotal: calculation.adjustedSubtotal,
        adjustmentTotal: calculation.adjustmentTotal,
        additiveTaxTotal: calculation.additiveTaxTotal,
        withholdingTaxTotal: calculation.withholdingTaxTotal,
        appliedAdjustments: calculation.adjustments,
        appliedTaxes: calculation.taxes,
        totalAmount: orderTotal,
        ...(params.input.garmentNote !== undefined && {
          garmentNote:
            params.input.garmentNote?.trim() || null,
        }),
        ...(params.input.internalNote !== undefined && {
          internalNote:
            params.input.internalNote?.trim() || null,
        }),
        customerAgreement,
        items: {
          create: preparedItems.map((item) => ({
            itemName: item.service.name,
            colors: item.input.colors,
            piecesPerUnit: item.service.pieces,
            quantity: item.input.quantity,
            totalPieces: item.totalPieces,
            unitPrice: item.service.unitPrice,
            totalPrice: item.lineTotal,
          })),
        },
      },
    });

    const refreshed = await tx.order.findFirst({
      where: {
        id: current.id,
        businessId: params.businessId,
        branchId: params.branchId,
      },
      include: {
        customer: true,
        branch: true,
        items: {
          orderBy: {
            createdAt: "asc",
          },
        },
        garments: {
          orderBy: [
            { orderItemId: "asc" },
            { garmentNumber: "asc" },
          ],
        },
        invoice: {
          include: {
            items: {
              orderBy: {
                createdAt: "asc",
              },
            },
          },
        },
      },
    });

    if (!refreshed || !refreshed.invoice) {
      throw new AppError(
        "The edited order could not be reloaded",
        500,
      );
    }

    const history = await createHistorySnapshot(
      tx,
      refreshed.invoice,
      reason,
      params.actorUserId,
      buildInvoiceSnapshot(current.invoice),
    );

    return {
      order: refreshed,
      invoice: refreshed.invoice,
      history,
      before: {
        order: buildOrderSnapshot(current),
        invoice: buildInvoiceSnapshot(current.invoice),
      },
      after: {
        order: buildOrderSnapshot(refreshed),
        invoice: buildInvoiceSnapshot(refreshed.invoice),
      },
      reason,
    };
  });
}

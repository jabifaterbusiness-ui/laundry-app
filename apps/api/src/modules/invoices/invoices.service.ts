import type { InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

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
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: {
        id: data.orderId,
        businessId: data.businessId,
        branchId: data.branchId,
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

    const invoiceItems: Prisma.InvoiceItemCreateWithoutInvoiceInput[] =
      order.items.map((item) => ({
        itemName: item.serviceName,
        piecesPerUnit: item.piecesPerUnit,
        quantity: item.quantity,
        totalPieces: item.totalPieces,
        unitPrice: item.unitPrice,
        totalPrice: item.lineTotal,
      }));

    const invoice = await tx.invoice.create({
      data: {
        business: {
          connect: { id: data.businessId },
        },
        branch: {
          connect: { id: data.branchId },
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
        totalAmount: order.orderTotal,
        garmentNote: order.garmentNote,
        internalNote: order.internalNote,
        customerAgreement: data.customerAgreement,
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

    return invoice;
  });
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

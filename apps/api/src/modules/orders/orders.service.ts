import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { createGarmentsForOrderWithTx } from "../garments/garments.service.js";
import { createInvoiceFromOrderWithTx } from "../invoices/invoices.service.js";
import { notifyOrderStatus } from "../communications/communications.service.js";

export interface CreateOrderItemData {
  serviceId: string;
  quantity: number;
  colors?: string[];
}

export interface CreateOrderData {
  businessId: string;
  branchId: string;
  customerId: string;
  items: CreateOrderItemData[];
  garmentNote?: string;
  internalNote?: string;
  expectedReadyAt?: Date;
  adjustments?: Array<{ adjustmentId: string; scope: "INVOICE" | "ITEMS"; itemIndexes?: number[] }>;
  taxRuleIds?: string[];
}

export interface ListOrdersParams {
  businessId: string;
  branchId?: string;
  customerId?: string;
  status?: OrderStatus;
  page: number;
  pageSize: number;
}

/**
 * Creates an order and snapshots the current Service price/name/pieces
 * into OrderItem.
 *
 * The caller must provide businessId from req.user.businessId and branchId
 * from the validated request-scoped branch context.
 *
 * Client-supplied prices, pieces and totals are deliberately not accepted.
 */
export async function createOrder(
  data: CreateOrderData,
  db?: Prisma.TransactionClient,
) {
  if (data.items.length === 0) {
    throw new AppError("An order must contain at least one item", 422);
  }

  if (db) {
    return createOrderWithTx(db, data);
  }

  return prisma.$transaction(async (tx) => {
    return createOrderWithTx(tx, data);
  });
}

async function createOrderWithTx(
  tx: Prisma.TransactionClient,
  data: CreateOrderData,
) {
    // Customer must belong to the authenticated business.
    const customer = await tx.customer.findFirst({
      where: {
        id: data.customerId,
        businessId: data.businessId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!customer) {
      throw new AppError("Customer not found", 404);
    }

    // Branch must belong to the authenticated business.
    const branch = await tx.branch.findFirst({
      where: {
        id: data.branchId,
        businessId: data.businessId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!branch) {
      throw new AppError("Branch not found", 404);
    }

    const serviceIds = [...new Set(data.items.map((item) => item.serviceId))];

    const services = await tx.service.findMany({
      where: {
        id: { in: serviceIds },
        businessId: data.businessId,
      },
    });

    if (services.length !== serviceIds.length) {
      throw new AppError(
        "One or more selected services were not found",
        404,
      );
    }

    const serviceMap = new Map(
      services.map((service) => [service.id, service]),
    );

    // Customer-specific prices are read only for this business/customer.
    // The selected price is copied into OrderItem, preserving history.
    const customerPrices = await tx.customerServicePrice.findMany({
      where: {
        businessId: data.businessId,
        customerId: data.customerId,
        serviceId: { in: serviceIds },
      },
      select: { serviceId: true, unitPrice: true },
    });
    const customerPriceMap = new Map(
      customerPrices.map((price) => [price.serviceId, price.unitPrice]),
    );

    for (const item of data.items) {
      const service = serviceMap.get(item.serviceId);

      if (!service) {
        throw new AppError("Service not found", 404);
      }

      if (!service.isActive) {
        throw new AppError(
          `Service "${service.name}" is inactive and cannot be added to an order`,
          422,
        );
      }

      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new AppError(
          `Quantity for "${service.name}" must be a positive whole number`,
          422,
        );
      }
    }

    const orderNumber = await createUniqueOrderNumber(tx, data.businessId);

    const items: Prisma.OrderItemCreateWithoutOrderInput[] = data.items.map(
      (item) => {
        const service = serviceMap.get(item.serviceId)!;

        const unitPrice = customerPriceMap.get(service.id) ?? service.unitPrice;
        const totalPieces = item.quantity * service.pieces;
        const lineTotal = item.quantity * unitPrice;

        return {
          service: {
            connect: { id: service.id },
          },
          serviceName: service.name,
          piecesPerUnit: service.pieces,
          quantity: item.quantity,
          totalPieces,
          colors: item.colors ?? [],
          unitPrice,
          lineTotal,
        };
      },
    );

    const orderTotal = items.reduce(
      (total, item) => total + item.lineTotal,
      0,
    );

    const order = await tx.order.create({
      data: {
        business: {
          connect: { id: data.businessId },
        },
        branch: {
          connect: { id: data.branchId },
        },
        customer: {
          connect: { id: data.customerId },
        },
        orderNumber,
        orderTotal,
        garmentNote: data.garmentNote ?? null,
        internalNote: data.internalNote ?? null,
        expectedReadyAt: data.expectedReadyAt ?? null,
        items: {
          create: items,
        },
      },
      include: {
        customer: true,
        branch: true,
        items: true,
      },
    });

    await createGarmentsForOrderWithTx(
      tx,
      order,
      data.businessId,
      data.branchId,
    );

    const business = await tx.business.findUnique({
      where: {
        id: data.businessId,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        website: true,
        address: true,
        logoUrl: true,
        receiptPrimaryColor: true,
        receiptAccentColor: true,
        receiptBackgroundColor: true,
        receiptTextColor: true,
        receiptHeaderStyle: true,
        defaultCustomerAgreement: true,
      },
    });

    if (!business?.defaultCustomerAgreement?.trim()) {
      throw new AppError(
        "A default customer agreement must be configured before an invoice can be generated",
        422,
      );
    }

    const invoice = await createInvoiceFromOrderWithTx(
      tx,
      order,
      business,
      business.defaultCustomerAgreement,
      { adjustments: data.adjustments ?? [], taxRuleIds: data.taxRuleIds ?? [] },
    );

    // Keep the order's displayed total aligned with the issued invoice total
    // (including adjustments and tax), while OrderItem remains the immutable
    // service-price snapshot used for the subtotal.
    return tx.order.update({
      where: { id: order.id },
      data: { orderTotal: invoice.totalAmount },
      include: { customer: true, branch: true, items: true },
    });
}

async function createUniqueOrderNumber(
  tx: Prisma.TransactionClient,
  businessId: string,
): Promise<string> {
  const sequence = await tx.orderNumberSequence.upsert({
    where: {
      businessId,
    },
    create: {
      businessId,
      nextNumber: 2,
    },
    update: {
      nextNumber: {
        increment: 1,
      },
    },
    select: {
      nextNumber: true,
    },
  });

  const assignedNumber = sequence.nextNumber - 1;

  if (assignedNumber > 99999) {
    throw new AppError(
      "The order number limit of 99999 has been reached for this business",
      422,
    );
  }

  return assignedNumber.toString().padStart(5, "0");
}

/**
 * Tenant- and branch-scoped order lookup.
 *
 * If branchId is supplied, only orders belonging to that branch are
 * returned. businessId is always mandatory and comes from the
 * authenticated user.
 */
export async function listOrders(params: ListOrdersParams) {
  const {
    businessId,
    branchId,
    customerId,
    status,
    page,
    pageSize,
  } = params;

  const where: Prisma.OrderWhereInput = {
    businessId,
    ...(branchId ? { branchId } : {}),
    ...(customerId ? { customerId } : {}),
    ...(status ? { status } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: true,
        branch: true,
        items: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
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

/**
 * Tenant-scoped single order lookup.
 *
 * When branchId is supplied it is included in the same query, preventing
 * accidental access to an order from another branch.
 */
export async function getOrderForBusiness(
  id: string,
  businessId: string,
  branchId?: string,
) {
  return prisma.order.findFirst({
    where: {
      id,
      businessId,
      ...(branchId ? { branchId } : {}),
    },
    include: {
      customer: true,
      branch: true,
      items: true,
    },
  });
}

/**
 * Transfers an order to another customer within the authenticated
 * business and branch without changing the order's financial or
 * operational history.
 */
type OrderDb = typeof prisma | Prisma.TransactionClient;

export async function transferOrder(
  id: string,
  businessId: string,
  branchId: string,
  newCustomerId: string,
  db: OrderDb = prisma,
) {
  if (db === prisma) {
    return prisma.$transaction(async (tx) =>
      transferOrderWithTx(tx, id, businessId, branchId, newCustomerId),
    );
  }

  return transferOrderWithTx(
    db,
    id,
    businessId,
    branchId,
    newCustomerId,
  );
}

async function transferOrderWithTx(
  tx: Prisma.TransactionClient,
  id: string,
  businessId: string,
  branchId: string,
  newCustomerId: string,
) {
  const order = await tx.order.findFirst({
    where: {
      id,
      businessId,
      branchId,
    },
    select: {
      id: true,
      orderNumber: true,
      customerId: true,
    },
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  if (order.customerId === newCustomerId) {
    throw new AppError(
      "Order is already assigned to this customer",
      422,
    );
  }

  const customer = await tx.customer.findFirst({
    where: {
      id: newCustomerId,
      businessId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!customer) {
    throw new AppError("Customer not found", 404);
  }

  return tx.order.update({
    where: {
      id: order.id,
    },
    data: {
      customer: {
        connect: {
          id: customer.id,
        },
      },
    },
    include: {
      customer: true,
      branch: true,
      items: true,
    },
  });
}


export async function updateOrderStatus(
  id: string,
  businessId: string,
  branchId: string,
  status: OrderStatus,
  db: OrderDb = prisma,
) {
  return updateOrderStatusWithDb(
    db,
    id,
    businessId,
    branchId,
    status,
  );
}

async function updateOrderStatusWithDb(
  db: OrderDb,
  id: string,
  businessId: string,
  branchId: string,
  status: OrderStatus,
) {
  const existing = await db.order.findFirst({
    where: {
      id,
      businessId,
      branchId,
    },
  });

  if (!existing) {
    throw new AppError("Order not found", 404);
  }

  const now = new Date();

  const data: Prisma.OrderUpdateInput = {
    status,
  };

  if (status === "READY_FOR_PICKUP") {
    data.readyAt = now;
  }

  if (status === "COMPLETED") {
    data.completedAt = now;
  }

  if (status === "CANCELLED") {
    data.cancelledAt = now;
  }

  const updated = await db.order.update({
    where: { id },
    data,
    include: {
      customer: true,
      branch: true,
      items: true,
    },
  });

  // Send customer notification only after the status update has committed.
  // Provider failures are recorded by the delivery service and must not roll
  // back or hide the operational status change.
  if (db === prisma && existing.status !== status) {
    await notifyOrderStatus({ orderId: id, businessId, branchId, status }).catch(() => []);
  }

  return updated;
}

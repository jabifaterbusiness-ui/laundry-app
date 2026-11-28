import type { OrderStatus, Prisma, Role } from "@prisma/client";
import { hasPermission } from "../permissions/permissions.service.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { createGarmentsForOrderWithTx } from "../garments/garments.service.js";
import { createInvoiceFromOrderWithTx } from "../invoices/invoices.service.js";
import { notifyOrderStatus } from "../communications/communications.service.js";
import { getBranchResourceScope } from "../branches/branch-resource-scope.service.js";

export interface CreateOrderItemData {
  serviceId: string;
  quantity: number;
  colors?: string[];
}

export interface CreateOrderData {
  businessId: string;
  branchId: string;
  actorUserId: string;
  customerId: string;
  items: CreateOrderItemData[];
  garmentNote?: string;
  internalNote?: string;
  expectedReadyAt?: Date;
  adjustments?: Array<{ adjustmentId: string; scope: "INVOICE" | "ITEMS"; itemIndexes?: number[] }>;
  taxRuleIds?: string[];
  idempotencyKey?: string;
}

export interface ListOrdersParams {
  businessId: string;
  branchId: string;
  userId: string;
  customerId?: string;
  search?: string;
  status?: OrderStatus;
  page: number;
  pageSize: number;
}

function markOrderReplay<T extends object>(order: T) {
  return { ...order, idempotencyReplay: true as const };
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

  const existingOrder = data.idempotencyKey
    ? await (db ?? prisma).order.findFirst({
        where: {
          businessId: data.businessId,
          branchId: data.branchId,
          idempotencyKey: data.idempotencyKey,
        },
        include: { customer: true, branch: true, items: true },
      })
    : null;
  if (existingOrder) return markOrderReplay(existingOrder);

  if (db) {
    return createOrderWithTx(db, data);
  }

  try {
    return await prisma.$transaction(async (tx) => createOrderWithTx(tx, data));
  } catch (error) {
    // A concurrent request with the same key may win the unique index race.
    // Read its committed result after the failed transaction has rolled back.
    if (
      data.idempotencyKey && error && typeof error === "object" &&
      "code" in error && error.code === "P2002"
    ) {
      const concurrentOrder = await prisma.order.findFirst({
        where: {
          businessId: data.businessId,
          branchId: data.branchId,
          idempotencyKey: data.idempotencyKey,
        },
        include: { customer: true, branch: true, items: true },
      });
      if (concurrentOrder) return markOrderReplay(concurrentOrder);
    }
    throw error;
  }
}

async function createOrderWithTx(
  tx: Prisma.TransactionClient,
  data: CreateOrderData,
) {
    const customerScope = await getBranchResourceScope({
      businessId: data.businessId,
      branchId: data.branchId,
      userId: data.actorUserId,
      resourceType: "CUSTOMERS",
    }, tx);
    const serviceScope = await getBranchResourceScope({
      businessId: data.businessId,
      branchId: data.branchId,
      userId: data.actorUserId,
      resourceType: "SERVICES",
    }, tx);

    // A customer must be visible to this branch, not merely belong to the
    // same business. Unassigned legacy customers remain hidden pending owner review.
    const customer = await tx.customer.findFirst({
      where: {
        id: data.customerId,
        businessId: data.businessId,
        OR: [
          { ownerBranchId: { in: customerScope.ownerBranchIds } },
          { id: { in: customerScope.resourceIds } },
        ],
        lifecycleStatus: { not: "MERGED" },
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
        OR: [
          { ownerBranchId: null },
          { ownerBranchId: { in: serviceScope.ownerBranchIds } },
          { id: { in: serviceScope.resourceIds } },
        ],
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

    // Customer-specific prices must follow the active branch's sharing
    // permissions. A price owned by another branch is usable only when
    // that price (or its owning branch's pricing category) is shared.
    const pricingScope = await getBranchResourceScope({
      businessId: data.businessId,
      branchId: data.branchId,
      userId: data.actorUserId,
      resourceType: "CUSTOMER_PRICING",
    }, tx);
    const customerPrices = await tx.customerServicePrice.findMany({
      where: {
        businessId: data.businessId,
        customerId: data.customerId,
        serviceId: { in: serviceIds },
        OR: [
          { branchId: null },
          { branchId: { in: pricingScope.ownerBranchIds } },
          { id: { in: pricingScope.resourceIds } },
        ],
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
        idempotencyKey: data.idempotencyKey ?? null,
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
      {
        adjustments: data.adjustments ?? [],
        taxRuleIds: data.taxRuleIds ?? [],
        ...(typeof data.actorUserId === "string" ? { actorUserId: data.actorUserId } : {}),
      },
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

export async function createUniqueOrderNumber(
  tx: Prisma.TransactionClient,
  businessId: string,
): Promise<string> {
  // Serialize allocation per business across every API process. The
  // transaction-scoped advisory lock also covers first-time sequence creation.
  await tx.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${businessId}, 0))`,
  );

  // Existing orders are authoritative if a sequence row is missing or stale.
  // Only the established five-digit numeric format participates in allocation.
  const highestOrder = await tx.$queryRaw<Array<{ maxOrderNumber: number }>>(
    Prisma.sql`
      SELECT COALESCE(MAX("orderNumber"::integer), 0)::integer AS "maxOrderNumber"
      FROM "orders"
      WHERE "businessId" = ${businessId}
        AND "orderNumber" ~ '^[0-9]{1,5}

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
    search,
    status,
    page,
    pageSize,
  } = params;

  const scope = await getBranchResourceScope({
    businessId,
    branchId,
    userId: params.userId,
    resourceType: "CUSTOMERS",
  });
  const where: Prisma.OrderWhereInput = {
    businessId,
    branchId,
    customer: {
      is: {
        businessId,
        OR: [
          { ownerBranchId: { in: scope.ownerBranchIds } },
          { id: { in: scope.resourceIds } },
        ],
      },
    },
    ...(customerId ? { customerId } : {}),
    ...(status ? { status } : {}),
    ...(search ? {
      AND: [{
        OR: [
          { orderNumber: { contains: search } },
          { invoice: { is: { invoiceNumber: { contains: search } } } },
          { customer: { is: { name: { contains: search, mode: "insensitive" } } } },
          { customer: { is: { phone: { contains: search } } } },
          { customer: { is: { email: { contains: search, mode: "insensitive" } } } },
        ],
      }],
    } : {}),
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
  branchId: string,
  userId: string,
) {
  const scope = await getBranchResourceScope({
    businessId,
    branchId,
    userId,
    resourceType: "CUSTOMERS",
  });
  return prisma.order.findFirst({
    where: {
      id,
      businessId,
      branchId,
      customer: {
        is: {
          businessId,
          OR: [
            { ownerBranchId: { in: scope.ownerBranchIds } },
            { id: { in: scope.resourceIds } },
          ],
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
  userId: string,
  db: OrderDb = prisma,
) {
  if (db === prisma) {
    return prisma.$transaction(async (tx) =>
      transferOrderWithTx(tx, id, businessId, branchId, newCustomerId, userId),
    );
  }

  return transferOrderWithTx(
    db,
    id,
    businessId,
    branchId,
    newCustomerId,
    userId,
  );
}

async function transferOrderWithTx(
  tx: Prisma.TransactionClient,
  id: string,
  businessId: string,
  branchId: string,
  newCustomerId: string,
  userId: string,
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

  const customerScope = await getBranchResourceScope({
    businessId,
    branchId,
    userId,
    resourceType: "CUSTOMERS",
  }, tx);
  const customer = await tx.customer.findFirst({
    where: {
      id: newCustomerId,
      businessId,
      OR: [
        { ownerBranchId: { in: customerScope.ownerBranchIds } },
        { id: { in: customerScope.resourceIds } },
      ],
      lifecycleStatus: { not: "MERGED" },
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


export interface OrderStatusHistoryContext {
  actorUserId: string;
  actorRole?: Role;
  correlationId?: string | null;
  pickupOverrideReason?: string;
  notificationChoice?: "EMAIL" | "WHATSAPP" | "NONE";
}

export async function updateOrderStatus(
  id: string,
  businessId: string,
  branchId: string,
  status: OrderStatus,
  db: OrderDb = prisma,
  history?: OrderStatusHistoryContext,
) {
  if (db === prisma && history) {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findFirst({
        where: { id, businessId, branchId },
        select: { id: true, status: true },
      });
      if (!existing) throw new AppError("Order not found", 404);

      const updated = await updateOrderStatusWithDb(
        tx, id, businessId, branchId, status, history,
      );

      if (existing.status !== status) {
        await tx.auditLog.create({
          data: {
            action: "order.status_updated",
            entityType: "Order",
            entityId: updated.id,
            businessId,
            branchId,
            actorUserId: history.actorUserId,
            correlationId: history.correlationId ?? null,
            metadata: {
              orderNumber: updated.orderNumber,
              previousStatus: existing.status,
              status: updated.status,
              notificationChoice: history?.notificationChoice ?? "AUTOMATIC",
            },
          },
        });
      }
      return { updated, changed: existing.status !== status };
    }, { isolationLevel: "Serializable" });

    if (!result.changed) return result.updated;

    let notificationResults: Awaited<ReturnType<typeof notifyOrderStatus>> = [];
    let notificationError: string | undefined;
    if (history?.notificationChoice !== "NONE") {
      try {
        notificationResults = await notifyOrderStatus({
          orderId: id, businessId, branchId, status,
          ...(history?.notificationChoice ? { channelOverride: history.notificationChoice } : {}),
        });
      } catch {
        notificationError = "Notification processing failed. Check Delivery History for details.";
      }
    }
    return {
      ...result.updated,
      notificationChoice: history?.notificationChoice ?? "AUTOMATIC",
      notificationResults,
      ...(notificationError ? { notificationError } : {}),
    };
  }

  return updateOrderStatusWithDb(db, id, businessId, branchId, status, history);
}

export async function getPickupPaymentEligibility(
  id: string,
  businessId: string,
  branchId: string,
  db: OrderDb = prisma,
) {
  const order = await db.order.findFirst({
    where: { id, businessId, branchId },
    select: { id: true, status: true },
  });
  if (!order) throw new AppError("Order not found", 404);

  const invoice = await db.invoice.findFirst({
    where: { orderId: id, businessId, branchId },
    select: {
      status: true,
      totalAmount: true,
      payments: { select: { amount: true, type: true, status: true } },
    },
  });
  if (!invoice || invoice.status === "VOID") {
    return { eligible: false, outstandingBalance: null, reason: "NO_VALID_INVOICE" as const };
  }

  const netPayments = invoice.payments
    .filter((payment) => payment.status === "POSTED")
    .reduce(
      (total, payment) => total + (payment.type === "REFUND" ? -payment.amount : payment.amount),
      0,
    );
  const outstandingBalance = Math.max(0, invoice.totalAmount - netPayments);
  return {
    eligible: outstandingBalance === 0,
    outstandingBalance,
    reason: outstandingBalance > 0 ? "OUTSTANDING_BALANCE" as const : null,
  };
}

async function updateOrderStatusWithDb(
  db: OrderDb,
  id: string,
  businessId: string,
  branchId: string,
  status: OrderStatus,
  history?: OrderStatusHistoryContext,
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

  let pickupOverride: { reason: string; outstandingBalance: number } | null = null;
  if (status === "PICKED_UP" && existing.status !== "PICKED_UP") {
    const invoice = await db.invoice.findFirst({
      where: { orderId: id, businessId, branchId },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        payments: {
          select: { amount: true, type: true, status: true },
        },
      },
    });

    if (!invoice || invoice.status === "VOID") {
      throw new AppError("Pickup is blocked because this order has no valid issued invoice payment record.", 422);
    }

    const netPayments = invoice.payments
      .filter((payment) => payment.status === "POSTED")
      .reduce(
        (total, payment) => total + (payment.type === "REFUND" ? -payment.amount : payment.amount),
        0,
      );
    const outstandingBalance = Math.max(0, invoice.totalAmount - netPayments);

    if (outstandingBalance > 0) {
      const reason = history?.pickupOverrideReason?.trim();
      if (!reason) {
        throw new AppError(
          `This customer has not completed payment, so these items cannot be picked up. Outstanding balance: ${outstandingBalance}.`,
          422,
        );
      }

      if (!history?.actorUserId || !history.actorRole) {
        throw new AppError("A verified management user is required to override the pickup payment block.", 403);
      }

      const allowed = await hasPermission(
        history.actorUserId,
        businessId,
        history.actorRole,
        "orders.pickup_override",
      );
      if (!allowed) {
        throw new AppError("You do not have permission to override the pickup payment requirement.", 403);
      }

      pickupOverride = { reason, outstandingBalance };
    }
  }

  const now = new Date();

  const data: Prisma.OrderUpdateInput = {
    status,
  };

  if (status === "READY_FOR_PICKUP") {
    data.readyAt = now;
  }

  if (status === "PICKED_UP" && existing.status !== "PICKED_UP") {
    data.pickedUpAt = now;
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

  if (pickupOverride && history?.actorUserId && existing.status !== "PICKED_UP") {
    await db.auditLog.create({
      data: {
        action: "order.pickup_payment_override",
        entityType: "Order",
        entityId: updated.id,
        businessId,
        branchId,
        actorUserId: history.actorUserId,
        correlationId: history.correlationId ?? null,
        metadata: {
          orderNumber: updated.orderNumber,
          status: "PICKED_UP",
          authorizedByUserId: history.actorUserId,
          authorizedAt: now.toISOString(),
          reason: pickupOverride.reason,
          outstandingBalance: pickupOverride.outstandingBalance,
        },
      },
    });
  }

  // Send customer notification only after the status update has committed.
  // Return the recorded delivery outcome so the operator can see whether
  // WhatsApp/email succeeded; provider failures never roll back the status.
  if (db !== prisma || existing.status === status) {
    return updated;
  }

  let notificationResults: Awaited<ReturnType<typeof notifyOrderStatus>> = [];
  let notificationError: string | undefined;
  try {
    notificationResults = await notifyOrderStatus({
      orderId: id,
      businessId,
      branchId,
      status,
    });
  } catch {
    // Do not surface provider exception text or configuration details to staff.
    notificationError = "Notification processing failed. Check Delivery History for details.";
  }

  return {
    ...updated,
    notificationResults,
    ...(notificationError ? { notificationError } : {}),
  };
}

    `,
  );
  const highestExistingNumber = highestOrder[0]?.maxOrderNumber ?? 0;

  const currentSequence = await tx.orderNumberSequence.findUnique({
    where: { businessId },
    select: { nextNumber: true },
  });
  const assignedNumber = Math.max(
    currentSequence?.nextNumber ?? 1,
    highestExistingNumber + 1,
  );

  if (assignedNumber > 99999) {
    throw new AppError(
      "The order number limit of 99999 has been reached for this business",
      422,
    );
  }

  // The advisory lock makes this read/reconcile/write sequence atomic for
  // this business. Keep nextNumber as the next number to be allocated.
  await tx.orderNumberSequence.upsert({
    where: { businessId },
    create: { businessId, nextNumber: assignedNumber + 1 },
    update: { nextNumber: assignedNumber + 1 },
    select: { nextNumber: true },
  });

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
    search,
    status,
    page,
    pageSize,
  } = params;

  const scope = await getBranchResourceScope({
    businessId,
    branchId,
    userId: params.userId,
    resourceType: "CUSTOMERS",
  });
  const where: Prisma.OrderWhereInput = {
    businessId,
    branchId,
    customer: {
      is: {
        businessId,
        OR: [
          { ownerBranchId: { in: scope.ownerBranchIds } },
          { id: { in: scope.resourceIds } },
        ],
      },
    },
    ...(customerId ? { customerId } : {}),
    ...(status ? { status } : {}),
    ...(search ? {
      AND: [{
        OR: [
          { orderNumber: { contains: search } },
          { invoice: { is: { invoiceNumber: { contains: search } } } },
          { customer: { is: { name: { contains: search, mode: "insensitive" } } } },
          { customer: { is: { phone: { contains: search } } } },
          { customer: { is: { email: { contains: search, mode: "insensitive" } } } },
        ],
      }],
    } : {}),
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
  branchId: string,
  userId: string,
) {
  const scope = await getBranchResourceScope({
    businessId,
    branchId,
    userId,
    resourceType: "CUSTOMERS",
  });
  return prisma.order.findFirst({
    where: {
      id,
      businessId,
      branchId,
      customer: {
        is: {
          businessId,
          OR: [
            { ownerBranchId: { in: scope.ownerBranchIds } },
            { id: { in: scope.resourceIds } },
          ],
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
  userId: string,
  db: OrderDb = prisma,
) {
  if (db === prisma) {
    return prisma.$transaction(async (tx) =>
      transferOrderWithTx(tx, id, businessId, branchId, newCustomerId, userId),
    );
  }

  return transferOrderWithTx(
    db,
    id,
    businessId,
    branchId,
    newCustomerId,
    userId,
  );
}

async function transferOrderWithTx(
  tx: Prisma.TransactionClient,
  id: string,
  businessId: string,
  branchId: string,
  newCustomerId: string,
  userId: string,
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

  const customerScope = await getBranchResourceScope({
    businessId,
    branchId,
    userId,
    resourceType: "CUSTOMERS",
  }, tx);
  const customer = await tx.customer.findFirst({
    where: {
      id: newCustomerId,
      businessId,
      OR: [
        { ownerBranchId: { in: customerScope.ownerBranchIds } },
        { id: { in: customerScope.resourceIds } },
      ],
      lifecycleStatus: { not: "MERGED" },
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


export interface OrderStatusHistoryContext {
  actorUserId: string;
  actorRole?: Role;
  correlationId?: string | null;
  pickupOverrideReason?: string;
  notificationChoice?: "EMAIL" | "WHATSAPP" | "NONE";
}

export async function updateOrderStatus(
  id: string,
  businessId: string,
  branchId: string,
  status: OrderStatus,
  db: OrderDb = prisma,
  history?: OrderStatusHistoryContext,
) {
  if (db === prisma && history) {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findFirst({
        where: { id, businessId, branchId },
        select: { id: true, status: true },
      });
      if (!existing) throw new AppError("Order not found", 404);

      const updated = await updateOrderStatusWithDb(
        tx, id, businessId, branchId, status, history,
      );

      if (existing.status !== status) {
        await tx.auditLog.create({
          data: {
            action: "order.status_updated",
            entityType: "Order",
            entityId: updated.id,
            businessId,
            branchId,
            actorUserId: history.actorUserId,
            correlationId: history.correlationId ?? null,
            metadata: {
              orderNumber: updated.orderNumber,
              previousStatus: existing.status,
              status: updated.status,
              notificationChoice: history?.notificationChoice ?? "AUTOMATIC",
            },
          },
        });
      }
      return { updated, changed: existing.status !== status };
    }, { isolationLevel: "Serializable" });

    if (!result.changed) return result.updated;

    let notificationResults: Awaited<ReturnType<typeof notifyOrderStatus>> = [];
    let notificationError: string | undefined;
    if (history?.notificationChoice !== "NONE") {
      try {
        notificationResults = await notifyOrderStatus({
          orderId: id, businessId, branchId, status,
          ...(history?.notificationChoice ? { channelOverride: history.notificationChoice } : {}),
        });
      } catch {
        notificationError = "Notification processing failed. Check Delivery History for details.";
      }
    }
    return {
      ...result.updated,
      notificationChoice: history?.notificationChoice ?? "AUTOMATIC",
      notificationResults,
      ...(notificationError ? { notificationError } : {}),
    };
  }

  return updateOrderStatusWithDb(db, id, businessId, branchId, status, history);
}

export async function getPickupPaymentEligibility(
  id: string,
  businessId: string,
  branchId: string,
  db: OrderDb = prisma,
) {
  const order = await db.order.findFirst({
    where: { id, businessId, branchId },
    select: { id: true, status: true },
  });
  if (!order) throw new AppError("Order not found", 404);

  const invoice = await db.invoice.findFirst({
    where: { orderId: id, businessId, branchId },
    select: {
      status: true,
      totalAmount: true,
      payments: { select: { amount: true, type: true, status: true } },
    },
  });
  if (!invoice || invoice.status === "VOID") {
    return { eligible: false, outstandingBalance: null, reason: "NO_VALID_INVOICE" as const };
  }

  const netPayments = invoice.payments
    .filter((payment) => payment.status === "POSTED")
    .reduce(
      (total, payment) => total + (payment.type === "REFUND" ? -payment.amount : payment.amount),
      0,
    );
  const outstandingBalance = Math.max(0, invoice.totalAmount - netPayments);
  return {
    eligible: outstandingBalance === 0,
    outstandingBalance,
    reason: outstandingBalance > 0 ? "OUTSTANDING_BALANCE" as const : null,
  };
}

async function updateOrderStatusWithDb(
  db: OrderDb,
  id: string,
  businessId: string,
  branchId: string,
  status: OrderStatus,
  history?: OrderStatusHistoryContext,
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

  let pickupOverride: { reason: string; outstandingBalance: number } | null = null;
  if (status === "PICKED_UP" && existing.status !== "PICKED_UP") {
    const invoice = await db.invoice.findFirst({
      where: { orderId: id, businessId, branchId },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        payments: {
          select: { amount: true, type: true, status: true },
        },
      },
    });

    if (!invoice || invoice.status === "VOID") {
      throw new AppError("Pickup is blocked because this order has no valid issued invoice payment record.", 422);
    }

    const netPayments = invoice.payments
      .filter((payment) => payment.status === "POSTED")
      .reduce(
        (total, payment) => total + (payment.type === "REFUND" ? -payment.amount : payment.amount),
        0,
      );
    const outstandingBalance = Math.max(0, invoice.totalAmount - netPayments);

    if (outstandingBalance > 0) {
      const reason = history?.pickupOverrideReason?.trim();
      if (!reason) {
        throw new AppError(
          `This customer has not completed payment, so these items cannot be picked up. Outstanding balance: ${outstandingBalance}.`,
          422,
        );
      }

      if (!history?.actorUserId || !history.actorRole) {
        throw new AppError("A verified management user is required to override the pickup payment block.", 403);
      }

      const allowed = await hasPermission(
        history.actorUserId,
        businessId,
        history.actorRole,
        "orders.pickup_override",
      );
      if (!allowed) {
        throw new AppError("You do not have permission to override the pickup payment requirement.", 403);
      }

      pickupOverride = { reason, outstandingBalance };
    }
  }

  const now = new Date();

  const data: Prisma.OrderUpdateInput = {
    status,
  };

  if (status === "READY_FOR_PICKUP") {
    data.readyAt = now;
  }

  if (status === "PICKED_UP" && existing.status !== "PICKED_UP") {
    data.pickedUpAt = now;
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

  if (pickupOverride && history?.actorUserId && existing.status !== "PICKED_UP") {
    await db.auditLog.create({
      data: {
        action: "order.pickup_payment_override",
        entityType: "Order",
        entityId: updated.id,
        businessId,
        branchId,
        actorUserId: history.actorUserId,
        correlationId: history.correlationId ?? null,
        metadata: {
          orderNumber: updated.orderNumber,
          status: "PICKED_UP",
          authorizedByUserId: history.actorUserId,
          authorizedAt: now.toISOString(),
          reason: pickupOverride.reason,
          outstandingBalance: pickupOverride.outstandingBalance,
        },
      },
    });
  }

  // Send customer notification only after the status update has committed.
  // Return the recorded delivery outcome so the operator can see whether
  // WhatsApp/email succeeded; provider failures never roll back the status.
  if (db !== prisma || existing.status === status) {
    return updated;
  }

  let notificationResults: Awaited<ReturnType<typeof notifyOrderStatus>> = [];
  let notificationError: string | undefined;
  try {
    notificationResults = await notifyOrderStatus({
      orderId: id,
      businessId,
      branchId,
      status,
    });
  } catch {
    // Do not surface provider exception text or configuration details to staff.
    notificationError = "Notification processing failed. Check Delivery History for details.";
  }

  return {
    ...updated,
    notificationResults,
    ...(notificationError ? { notificationError } : {}),
  };
}

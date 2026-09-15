import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";
import {
  createOrRenewSubscription,
} from "../subscriptions/subscriptions.service.js";
import type { CreateSubscriptionInput } from "../subscriptions/subscriptions.validation.js";

export async function getPlatformOverview() {
  const now = new Date();

  const [
    businesses,
    activeBusinesses,
    users,
    customers,
    orders,
    subscriptions,
    revenue,
    recentBusinesses,
  ] = await Promise.all([
    prisma.business.count(),
    prisma.business.count({ where: { isActive: true } }),
    prisma.user.count({ where: { businessId: { not: null } } }),
    prisma.customer.count(),
    prisma.order.count(),
    prisma.subscription.findMany({
      select: {
        status: true,
        endsAt: true,
      },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.business.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        name: true,
        slug: true,
        phone: true,
        email: true,
        website: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        subscription: {
          select: {
            plan: true,
            status: true,
            startsAt: true,
            endsAt: true,
          },
        },
        _count: {
          select: {
            users: true,
            customers: true,
            orders: true,
            branches: true,
          },
        },
      },
    }),
  ]);

  const expiredSubscriptions = subscriptions.filter(
    (subscription) =>
      subscription.status === "EXPIRED" || subscription.endsAt <= now,
  ).length;

  return {
    generatedAt: now,
    totals: {
      businesses,
      activeBusinesses,
      inactiveBusinesses: businesses - activeBusinesses,
      users,
      customers,
      orders,
    },
    subscriptions: {
      total: subscriptions.length,
      active: subscriptions.filter(
        (subscription) =>
          subscription.status === "ACTIVE" && subscription.endsAt > now,
      ).length,
      expired: expiredSubscriptions,
    },
    revenue: {
      paymentCount: revenue._count._all,
      totalCollected: revenue._sum.amount ?? 0,
    },
    recentBusinesses,
  };
}

export async function listPlatformBusinesses() {
  return prisma.business.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      phone: true,
      email: true,
      website: true,
      address: true,
      logoUrl: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      subscription: {
        select: {
          id: true,
          plan: true,
          status: true,
          startsAt: true,
          endsAt: true,
        },
      },
      _count: {
        select: {
          users: true,
          customers: true,
          orders: true,
          branches: true,
        },
      },
    },
  });
}

export async function listPlatformAuditLogs(limit = 100) {
  return prisma.auditLog.findMany({
    orderBy: { timestamp: "desc" },
    take: Math.min(Math.max(limit, 1), 250),
    select: {
      id: true,
      timestamp: true,
      businessId: true,
      branchId: true,
      actorUserId: true,
      action: true,
      entityType: true,
      entityId: true,
      metadata: true,
      correlationId: true,
    },
  });
}


export async function getPlatformBusinessDetails(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      slug: true,
      phone: true,
      email: true,
      website: true,
      address: true,
      logoUrl: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      subscription: {
        select: {
          id: true,
          plan: true,
          status: true,
          startsAt: true,
          endsAt: true,
        },
      },
      _count: {
        select: {
          users: true,
          customers: true,
          orders: true,
          branches: true,
          services: true,
          invoices: true,
          payments: true,
        },
      },
    },
  });

  if (!business) {
    throw new AppError("Business not found", 404);
  }

  const [recentUsers, recentBranches, recentAuditLogs] = await Promise.all([
    prisma.user.findMany({
      where: {
        businessId,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    }),
    prisma.branch.findMany({
      where: {
        businessId,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.auditLog.findMany({
      where: {
        businessId,
      },
      orderBy: { timestamp: "desc" },
      take: 20,
      select: {
        id: true,
        timestamp: true,
        actorUserId: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        correlationId: true,
      },
    }),
  ]);

  return {
    ...business,
    recentUsers,
    recentBranches,
    recentAuditLogs,
  };
}


export async function setPlatformBusinessActiveStatus(
  businessId: string,
  isActive: boolean,
  actorUserId: string,
  correlationId?: string,
) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      isActive: true,
    },
  });

  if (!business) {
    throw new AppError("Business not found", 404);
  }

  if (business.isActive === isActive) {
    throw new AppError(
      isActive
        ? "Business is already active"
        : "Business is already inactive",
      400,
    );
  }

  await prisma.business.update({
    where: { id: businessId },
    data: { isActive },
  });

  await recordAuditEvent({
    action: isActive
      ? "platform.business.activated"
      : "platform.business.deactivated",
    entityType: "Business",
    entityId: businessId,
    businessId,
    actorUserId,
    ...(correlationId !== undefined ? { correlationId } : {}),
    metadata: {
      businessName: business.name,
      isActive,
    },
  });

  return prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      slug: true,
      phone: true,
      email: true,
      website: true,
      address: true,
      logoUrl: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function renewPlatformBusinessSubscription(
  businessId: string,
  input: CreateSubscriptionInput,
  actorUserId: string,
  correlationId?: string,
) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
    },
  });

  if (!business) {
    throw new AppError("Business not found", 404);
  }

  const subscription = await createOrRenewSubscription(businessId, input);

  await recordAuditEvent({
    action: "PLATFORM_SUBSCRIPTION_RENEWED",
    entityType: "SUBSCRIPTION",
    entityId: subscription.id,
    businessId,
    actorUserId,
    ...(correlationId !== undefined ? { correlationId } : {}),
    metadata: {
      businessName: business.name,
      plan: subscription.plan,
      startsAt: subscription.startsAt,
      endsAt: subscription.endsAt,
    },
  });

  return subscription;
}

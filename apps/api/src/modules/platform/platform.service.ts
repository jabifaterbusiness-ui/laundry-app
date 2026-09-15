import { prisma } from "../../lib/prisma.js";

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

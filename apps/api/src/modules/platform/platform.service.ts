import { prisma } from "../../lib/prisma.js";
import { config } from "../../config/index.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../middleware/error-handler.js";
import {
  createOrRenewSubscription,
} from "../subscriptions/subscriptions.service.js";
import type { CreateSubscriptionInput } from "../subscriptions/subscriptions.validation.js";

export async function getPlatformHealth() {
  const checkedAt = new Date();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return {
      status: "healthy" as const,
      api: "healthy" as const,
      database: "healthy" as const,
      env: config.env,
      checkedAt,
    };
  } catch {
    return {
      status: "degraded" as const,
      api: "healthy" as const,
      database: "unhealthy" as const,
      env: config.env,
      checkedAt,
    };
  }
}

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
    prisma.subscriptionPayment.aggregate({
      where: {
        status: "SUCCESSFUL",
      },
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
          cancelAtPeriodEnd: true,
          cancelledAt: true,
          cancellationReason: true,
          },
        },
        users: {
          where: { securityRole: "BUSINESS_OWNER", isActive: true },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { fullName: true, email: true },
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
    recentBusinesses: recentBusinesses.map(({ users, ...business }) => ({
      ...business,
      owner: users?.[0] ?? null,
    })),
  };
}

export async function getPlatformRevenueAnalytics() {
  const [payments, paymentMethods, subscriptionRevenue] = await Promise.all([
    prisma.payment.groupBy({
      by: ["type"],
      where: {
        status: "POSTED",
      },
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.payment.groupBy({
      by: ["method", "type"],
      where: {
        status: "POSTED",
      },
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.subscriptionPayment.aggregate({
      where: {
        status: "SUCCESSFUL",
      },
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  const grossPaymentRow = payments.find((row) => row.type === "PAYMENT");
  const refundRow = payments.find((row) => row.type === "REFUND");

  const operationalGrossPayments = grossPaymentRow?._sum.amount ?? 0;
  const subscriptionPayments = subscriptionRevenue._sum.amount ?? 0;
  const grossPayments = operationalGrossPayments + subscriptionPayments;
  const refunds = refundRow?._sum.amount ?? 0;

  const methodBreakdown = {
    CASH: {
      payments: 0,
      refunds: 0,
      net: 0,
    },
    TRANSFER: {
      payments: 0,
      refunds: 0,
      net: 0,
    },
    POS: {
      payments: 0,
      refunds: 0,
      net: 0,
    },
    PAY_FROM_ACCOUNT: {
      payments: 0,
      refunds: 0,
      net: 0,
    },
  };

  for (const row of paymentMethods) {
    const amount = row._sum.amount ?? 0;

    if (row.type === "PAYMENT") {
      methodBreakdown[row.method].payments = amount;
    } else {
      methodBreakdown[row.method].refunds = amount;
    }
  }

  for (const method of Object.keys(methodBreakdown) as Array<
    keyof typeof methodBreakdown
  >) {
    methodBreakdown[method].net =
      methodBreakdown[method].payments - methodBreakdown[method].refunds;
  }

  return {
    generatedAt: new Date(),
    grossPayments,
    refunds,
    netCollected: grossPayments - refunds,
    paymentCount:
      (grossPaymentRow?._count._all ?? 0) + subscriptionRevenue._count._all,
    refundCount: refundRow?._count._all ?? 0,
    subscriptionPayments: {
      amount: subscriptionPayments,
      count: subscriptionRevenue._count._all,
    },
    methodBreakdown,
  };
}

export async function getPlatformGrowthAnalytics() {
  const [businesses, users, customers, orders] = await Promise.all([
    prisma.business.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
      },
    }),
    prisma.user.findMany({
      where: { businessId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
      },
    }),
    prisma.customer.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
      },
    }),
    prisma.order.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
      },
    }),
  ]);

  const buildMonthlySeries = (
    dates: Array<{ createdAt: Date }>,
  ): Array<{ month: string; count: number }> => {
    const counts = new Map<string, number>();

    for (const item of dates) {
      const month = item.createdAt.toISOString().slice(0, 7);
      counts.set(month, (counts.get(month) ?? 0) + 1);
    }

    return Array.from(counts.entries()).map(([month, count]) => ({
      month,
      count,
    }));
  };

  return {
    generatedAt: new Date(),
    businesses: {
      total: businesses.length,
      monthly: buildMonthlySeries(businesses),
    },
    users: {
      total: users.length,
      monthly: buildMonthlySeries(users),
    },
    customers: {
      total: customers.length,
      monthly: buildMonthlySeries(customers),
    },
    orders: {
      total: orders.length,
      monthly: buildMonthlySeries(orders),
    },
  };
}

export async function getPlatformGlobalStatistics() {
  const businesses = await prisma.business.findMany({
    select: {
      countryCode: true,
      isActive: true,
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

  const countries = new Map<
    string,
    {
      businesses: number;
      activeBusinesses: number;
      inactiveBusinesses: number;
      users: number;
      customers: number;
      orders: number;
      branches: number;
    }
  >();

  for (const business of businesses) {
    const current = countries.get(business.countryCode) ?? {
      businesses: 0,
      activeBusinesses: 0,
      inactiveBusinesses: 0,
      users: 0,
      customers: 0,
      orders: 0,
      branches: 0,
    };

    current.businesses += 1;
    if (business.isActive) {
      current.activeBusinesses += 1;
    } else {
      current.inactiveBusinesses += 1;
    }
    current.users += business._count.users;
    current.customers += business._count.customers;
    current.orders += business._count.orders;
    current.branches += business._count.branches;

    countries.set(business.countryCode, current);
  }

  return {
    generatedAt: new Date(),
    totals: {
      businesses: businesses.length,
      activeBusinesses: businesses.filter((business) => business.isActive).length,
      inactiveBusinesses: businesses.filter((business) => !business.isActive).length,
      users: businesses.reduce((total, business) => total + business._count.users, 0),
      customers: businesses.reduce(
        (total, business) => total + business._count.customers,
        0,
      ),
      orders: businesses.reduce(
        (total, business) => total + business._count.orders,
        0,
      ),
      branches: businesses.reduce(
        (total, business) => total + business._count.branches,
        0,
      ),
      countries: countries.size,
    },
    countries: Array.from(countries.entries())
      .map(([countryCode, statistics]) => ({
        countryCode,
        ...statistics,
      }))
      .sort(
        (a, b) =>
          b.businesses - a.businesses ||
          a.countryCode.localeCompare(b.countryCode),
      ),
  };
}

export async function listPlatformBusinesses() {
  const businesses = await prisma.business.findMany({
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
          cancelAtPeriodEnd: true,
          cancelledAt: true,
          cancellationReason: true,
        },
      },
      users: {
        where: { securityRole: "BUSINESS_OWNER", isActive: true },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { fullName: true, email: true },
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
  return businesses.map(({ users, ...business }) => ({
    ...business,
    owner: users?.[0] ?? null,
  }));
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
          cancelAtPeriodEnd: true,
          cancelledAt: true,
          cancellationReason: true,
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


export async function cancelPlatformBusinessSubscription(
  businessId: string,
  when: "IMMEDIATE" | "PERIOD_END",
  reason: string,
  actorUserId: string,
  correlationId?: string,
) {
  const subscription = await prisma.subscription.findUnique({
    where: { businessId },
    include: { business: { select: { name: true } } },
  });

  if (!subscription) {
    throw new AppError("Business subscription not found", 404);
  }

  if (subscription.status === "CANCELLED") {
    throw new AppError("Subscription is already cancelled", 409);
  }

  const now = new Date();
  const updated = when === "IMMEDIATE"
    ? await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "CANCELLED",
          endsAt: now,
          cancelAtPeriodEnd: false,
          cancelledAt: now,
          cancellationReason: reason,
        },
      })
    : await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: true,
          cancellationReason: reason,
        },
      });

  await recordAuditEvent({
    action: when === "IMMEDIATE"
      ? "platform.subscription.cancelled_immediately"
      : "platform.subscription.cancellation_scheduled",
    entityType: "SUBSCRIPTION",
    entityId: subscription.id,
    businessId,
    actorUserId,
    ...(correlationId !== undefined ? { correlationId } : {}),
    metadata: {
      businessName: subscription.business.name,
      cancellationTiming: when,
      effectiveAt: when === "IMMEDIATE" ? now : subscription.endsAt,
      reason,
    },
  });

  return updated;
}

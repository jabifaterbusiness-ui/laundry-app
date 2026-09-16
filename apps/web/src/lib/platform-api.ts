import { apiFetch } from "./api-client.js";
import type { SubscriptionPlan } from "./subscriptions-api.js";

export interface PlatformBusiness {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  logoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  subscription: {
    id: string;
    plan: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
    status: "ACTIVE" | "EXPIRED";
    startsAt: string;
    endsAt: string;
  } | null;
  _count: {
    users: number;
    customers: number;
    orders: number;
    branches: number;
  };
}

export interface PlatformOverview {
  generatedAt: string;
  totals: {
    businesses: number;
    activeBusinesses: number;
    inactiveBusinesses: number;
    users: number;
    customers: number;
    orders: number;
  };
  subscriptions: {
    total: number;
    active: number;
    expired: number;
  };
  revenue: {
    paymentCount: number;
    totalCollected: number;
  };
  recentBusinesses: PlatformBusiness[];
}

export interface PlatformRevenueAnalytics {
  generatedAt: string;
  grossPayments: number;
  refunds: number;
  netCollected: number;
  paymentCount: number;
  refundCount: number;
  methodBreakdown: {
    CASH: {
      payments: number;
      refunds: number;
      net: number;
    };
    TRANSFER: {
      payments: number;
      refunds: number;
      net: number;
    };
    POS: {
      payments: number;
      refunds: number;
      net: number;
    };
  };
}

export interface PlatformGrowthSeries {
  total: number;
  monthly: Array<{
    month: string;
    count: number;
  }>;
}

export interface PlatformGrowthAnalytics {
  generatedAt: string;
  businesses: PlatformGrowthSeries;
  users: PlatformGrowthSeries;
  customers: PlatformGrowthSeries;
  orders: PlatformGrowthSeries;
}

export interface PlatformGlobalCountryStatistics {
  countryCode: string;
  businesses: number;
  activeBusinesses: number;
  inactiveBusinesses: number;
  users: number;
  customers: number;
  orders: number;
  branches: number;
}

export interface PlatformGlobalStatistics {
  generatedAt: string;
  totals: {
    businesses: number;
    activeBusinesses: number;
    inactiveBusinesses: number;
    users: number;
    customers: number;
    orders: number;
    branches: number;
    countries: number;
  };
  countries: PlatformGlobalCountryStatistics[];
}

export interface PlatformConfiguration {
  id: string;
  allowNewBusinessRegistration: boolean;
  maintenanceMode: boolean;
  whatsappMessagingEnabled: boolean;
  automatedNotificationsEnabled: boolean;
  offlineSyncEnabled: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePlatformConfigurationInput {
  allowNewBusinessRegistration?: boolean;
  maintenanceMode?: boolean;
  whatsappMessagingEnabled?: boolean;
  automatedNotificationsEnabled?: boolean;
  offlineSyncEnabled?: boolean;
  expectedVersion?: number;
}

export async function getPlatformConfiguration(
  accessToken: string | null,
): Promise<PlatformConfiguration> {
  return apiFetch<PlatformConfiguration>("/platform/configuration", {
    accessToken,
  });
}

export async function updatePlatformConfiguration(
  input: UpdatePlatformConfigurationInput,
  accessToken: string | null,
): Promise<PlatformConfiguration> {
  return apiFetch<PlatformConfiguration>("/platform/configuration", {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  });
}

export interface PlatformHealth {
  status: "healthy" | "degraded";
  api: "healthy";
  database: "healthy" | "unhealthy";
  env: string;
  checkedAt: string;
}

export async function getPlatformHealth(
  accessToken: string | null,
): Promise<PlatformHealth> {
  return apiFetch<PlatformHealth>("/platform/health", {
    accessToken,
  });
}

export interface PlatformAuditLog {
  id: string;
  timestamp: string;
  businessId: string | null;
  branchId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  correlationId: string | null;
}

export async function getPlatformOverview(
  accessToken: string | null,
): Promise<PlatformOverview> {
  return apiFetch<PlatformOverview>("/platform/overview", {
    accessToken,
  });
}

export async function getPlatformRevenueAnalytics(
  accessToken: string | null,
): Promise<PlatformRevenueAnalytics> {
  return apiFetch<PlatformRevenueAnalytics>("/platform/revenue", {
    accessToken,
  });
}

export async function getPlatformGrowthAnalytics(
  accessToken: string | null,
): Promise<PlatformGrowthAnalytics> {
  return apiFetch<PlatformGrowthAnalytics>("/platform/growth", {
    accessToken,
  });
}

export async function getPlatformGlobalStatistics(
  accessToken: string | null,
): Promise<PlatformGlobalStatistics> {
  return apiFetch<PlatformGlobalStatistics>("/platform/global-statistics", {
    accessToken,
  });
}

export async function getPlatformBusinesses(
  accessToken: string | null,
): Promise<PlatformBusiness[]> {
  return apiFetch<PlatformBusiness[]>("/platform/businesses", {
    accessToken,
  });
}

export async function getPlatformAuditLogs(
  accessToken: string | null,
  limit = 100,
): Promise<PlatformAuditLog[]> {
  return apiFetch<PlatformAuditLog[]>(
    `/platform/audit-logs?limit=${encodeURIComponent(limit)}`,
    { accessToken },
  );
}

export async function activatePlatformBusiness(
  businessId: string,
  accessToken: string | null,
): Promise<PlatformBusiness> {
  return apiFetch<PlatformBusiness>(
    `/platform/businesses/${businessId}/activate`,
    {
      method: "POST",
      accessToken,
    },
  );
}

export async function deactivatePlatformBusiness(
  businessId: string,
  accessToken: string | null,
): Promise<PlatformBusiness> {
  return apiFetch<PlatformBusiness>(
    `/platform/businesses/${businessId}/deactivate`,
    {
      method: "POST",
      accessToken,
    },
  );
}

export async function renewPlatformBusinessSubscription(
  businessId: string,
  plan: SubscriptionPlan,
  accessToken: string | null,
): Promise<PlatformBusiness["subscription"]> {
  return apiFetch<PlatformBusiness["subscription"]>(
    `/platform/businesses/${businessId}/subscription`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify({ plan }),
    },
  );
}

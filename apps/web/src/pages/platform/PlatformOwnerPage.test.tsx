import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformOwnerPage } from "./PlatformOwnerPage.js";
import {
  activatePlatformBusiness,
  deactivatePlatformBusiness,
  renewPlatformBusinessSubscription,
  getPlatformAuditLogs,
  getPlatformBusinesses,
  getPlatformBusinessDetails,
  getPlatformOverview,
  getPlatformRevenueAnalytics,
  getPlatformGrowthAnalytics,
  getPlatformGlobalStatistics,
  getPlatformHealth,
  getPlatformConfiguration,
  updatePlatformConfiguration,
  getPlatformSubscriptionPrices,
  upsertPlatformSubscriptionPrice,
  updatePlatformSubscriptionPriceStatus,
  deletePlatformSubscriptionPrice,
  getPlatformPaymentProviders,
  upsertPlatformPaymentProvider,
  updatePlatformPaymentProviderStatus,
  deletePlatformPaymentProvider,
  getPlatformPaymentMethods,
  upsertPlatformPaymentMethod,
  updatePlatformPaymentMethodStatus,
  deletePlatformPaymentMethod,
} from "../../lib/platform-api.js";
import type { PlatformBusiness } from "../../lib/platform-api.js";
import { useAuthStore } from "../../state/auth-store.js";

vi.mock("../../lib/platform-api.js", () => ({
  activatePlatformBusiness: vi.fn(),
  deactivatePlatformBusiness: vi.fn(),
  renewPlatformBusinessSubscription: vi.fn(),
  getPlatformAuditLogs: vi.fn(),
  getPlatformBusinesses: vi.fn(),
    getPlatformBusinessDetails: vi.fn(),
  getPlatformOverview: vi.fn(),
  getPlatformRevenueAnalytics: vi.fn(),
  getPlatformGrowthAnalytics: vi.fn(),
  getPlatformGlobalStatistics: vi.fn(),
  getPlatformHealth: vi.fn(),
  getPlatformConfiguration: vi.fn(),
  updatePlatformConfiguration: vi.fn(),
  getPlatformSubscriptionPrices: vi.fn(),
  upsertPlatformSubscriptionPrice: vi.fn(),
  updatePlatformSubscriptionPriceStatus: vi.fn(),
  deletePlatformSubscriptionPrice: vi.fn(),
  getPlatformPaymentProviders: vi.fn(),
  upsertPlatformPaymentProvider: vi.fn(),
  updatePlatformPaymentProviderStatus: vi.fn(),
  deletePlatformPaymentProvider: vi.fn(),
  getPlatformPaymentMethods: vi.fn(),
  upsertPlatformPaymentMethod: vi.fn(),
  updatePlatformPaymentMethodStatus: vi.fn(),
  deletePlatformPaymentMethod: vi.fn(),
}));

const mockedActivate = vi.mocked(activatePlatformBusiness);
const mockedDeactivate = vi.mocked(deactivatePlatformBusiness);
const mockedRenewSubscription = vi.mocked(
  renewPlatformBusinessSubscription,
);
const mockedOverview = vi.mocked(getPlatformOverview);
const mockedBusinesses = vi.mocked(getPlatformBusinesses);
const mockedBusinessDetails = vi.mocked(getPlatformBusinessDetails);
const mockedAudits = vi.mocked(getPlatformAuditLogs);
const mockedRevenue = vi.mocked(getPlatformRevenueAnalytics);
const mockedGrowth = vi.mocked(getPlatformGrowthAnalytics);
const mockedGlobalStatistics = vi.mocked(getPlatformGlobalStatistics);
const mockedHealth = vi.mocked(getPlatformHealth);
const mockedConfiguration = vi.mocked(getPlatformConfiguration);
const mockedUpdateConfiguration = vi.mocked(updatePlatformConfiguration);
const mockedSubscriptionPrices = vi.mocked(getPlatformSubscriptionPrices);
const mockedUpsertSubscriptionPrice = vi.mocked(upsertPlatformSubscriptionPrice);
const mockedSubscriptionPriceStatus = vi.mocked(
  updatePlatformSubscriptionPriceStatus,
);
const mockedDeleteSubscriptionPrice = vi.mocked(
  deletePlatformSubscriptionPrice,
);
const mockedPaymentProviders = vi.mocked(getPlatformPaymentProviders);
const mockedUpsertPaymentProvider = vi.mocked(upsertPlatformPaymentProvider);
const mockedPaymentProviderStatus = vi.mocked(
  updatePlatformPaymentProviderStatus,
);
const mockedDeletePaymentProvider = vi.mocked(deletePlatformPaymentProvider);
const mockedPaymentMethods = vi.mocked(getPlatformPaymentMethods);
const mockedUpsertPaymentMethod = vi.mocked(upsertPlatformPaymentMethod);
const mockedPaymentMethodStatus = vi.mocked(updatePlatformPaymentMethodStatus);
const mockedDeletePaymentMethod = vi.mocked(deletePlatformPaymentMethod);

const growth = {
  generatedAt: "2026-09-15T00:10:00.000Z",
  businesses: {
    total: 3,
    monthly: [
      { month: "2026-01", count: 1 },
      { month: "2026-02", count: 2 },
    ],
  },
  users: {
    total: 12,
    monthly: [
      { month: "2026-01", count: 4 },
      { month: "2026-02", count: 8 },
    ],
  },
  customers: {
    total: 40,
    monthly: [
      { month: "2026-01", count: 15 },
      { month: "2026-02", count: 25 },
    ],
  },
  orders: {
    total: 75,
    monthly: [
      { month: "2026-01", count: 30 },
      { month: "2026-02", count: 45 },
    ],
  },
};

const overview = {
  generatedAt: "2026-09-15T00:00:00.000Z",
  totals: {
    businesses: 3,
    activeBusinesses: 2,
    inactiveBusinesses: 1,
    users: 12,
    customers: 40,
    orders: 75,
  },
  subscriptions: {
    total: 3,
    active: 1,
    expired: 2,
  },
  revenue: {
    paymentCount: 25,
    totalCollected: 150000,
  },
  recentBusinesses: [],
};

const revenue = {
  generatedAt: "2026-09-15T00:05:00.000Z",
  grossPayments: 250000,
  refunds: 40000,
  netCollected: 210000,
  paymentCount: 30,
  refundCount: 5,
  subscriptionPayments: {
    amount: 0,
    count: 0,
  },
  methodBreakdown: {
    CASH: {
      payments: 100000,
      refunds: 10000,
      net: 90000,
    },
    TRANSFER: {
      payments: 90000,
      refunds: 20000,
      net: 70000,
    },
    POS: {
      payments: 60000,
      refunds: 10000,
      net: 50000,
    },
  },
};


const platformHealth = {
  status: "healthy" as const,
  api: "healthy" as const,
  database: "healthy" as const,
  env: "test",
  checkedAt: "2026-09-15T00:12:00.000Z",
};

const platformConfiguration = {
  id: "platform-config",
  allowNewBusinessRegistration: true,
  maintenanceMode: false,
  whatsappMessagingEnabled: true,
  automatedNotificationsEnabled: true,
  offlineSyncEnabled: true,
  version: 1,
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
};

const globalStatistics = {
  generatedAt: "2026-09-15T00:12:00.000Z",
  totals: {
    businesses: 3,
    activeBusinesses: 2,
    inactiveBusinesses: 1,
    users: 12,
    customers: 40,
    orders: 75,
    branches: 4,
    countries: 2,
  },
  countries: [
    {
      countryCode: "NG",
      businesses: 2,
      activeBusinesses: 2,
      inactiveBusinesses: 0,
      users: 9,
      customers: 30,
      orders: 60,
      branches: 3,
    },
    {
      countryCode: "GH",
      businesses: 1,
      activeBusinesses: 0,
      inactiveBusinesses: 1,
      users: 3,
      customers: 10,
      orders: 15,
      branches: 1,
    },
  ],
};

const businesses: PlatformBusiness[] = [
  {
    id: "biz-A",
    name: "Laundry A",
    slug: "laundry-a",
    phone: null,
    email: "a@example.com",
    website: null,
    address: null,
    logoUrl: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    subscription: {
      id: "sub-A",
      plan: "MONTHLY" as const,
      status: "ACTIVE" as const,
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2099-01-01T00:00:00.000Z",
    },
    _count: {
      users: 5,
      customers: 20,
      orders: 40,
      branches: 2,
    },
  },
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PlatformOwnerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  useAuthStore.setState({
    user: {
      id: "platform-admin",
      email: "platform@example.com",
      fullName: "Platform Owner",
      role: "PLATFORM_ADMIN",
      permissions: [],
      businessId: null,
      branches: [],
    },
    accessToken: "platform-token",
    refreshToken: "refresh-token",
    activeBranchId: null,
  });

  mockedActivate.mockResolvedValue(businesses[0]!);
  mockedDeactivate.mockResolvedValue({
    ...businesses[0]!,
    isActive: false,
  });
  mockedOverview.mockResolvedValue(overview);
  mockedBusinesses.mockResolvedValue(businesses);
  mockedBusinessDetails.mockResolvedValue({
    ...businesses[0]!,
    _count: {
      ...businesses[0]!._count,
      services: 8,
      invoices: 35,
      payments: 30,
    },
    recentUsers: [],
    recentBranches: [],
    recentAuditLogs: [],
  });
  mockedAudits.mockResolvedValue([]);
  mockedRevenue.mockResolvedValue(revenue);
  mockedGrowth.mockResolvedValue(growth);
  mockedGlobalStatistics.mockResolvedValue(globalStatistics);
  mockedHealth.mockResolvedValue(platformHealth);
  mockedConfiguration.mockResolvedValue(platformConfiguration);
  mockedUpdateConfiguration.mockResolvedValue({
    ...platformConfiguration,
    maintenanceMode: true,
    version: 2,
  });

  mockedSubscriptionPrices.mockResolvedValue([
    {
      id: "price-monthly",
      plan: "MONTHLY",
      countryCode: "NG",
      currencyCode: "NGN",
      amount: 10000,
      isActive: true,
      createdAt: "2026-09-15T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:00.000Z",
    },
  ]);
  mockedUpsertSubscriptionPrice.mockResolvedValue({
    id: "price-monthly",
    plan: "MONTHLY",
    countryCode: "NG",
    currencyCode: "NGN",
    amount: 10000,
    isActive: true,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  });
  mockedSubscriptionPriceStatus.mockResolvedValue({
    id: "price-monthly",
    plan: "MONTHLY",
    countryCode: "NG",
    currencyCode: "NGN",
    amount: 10000,
    isActive: false,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  });

  mockedPaymentProviders.mockResolvedValue([
    {
      id: "provider-paystack",
      platformConfigId: "platform-config",
      providerKey: "paystack",
      displayName: "Paystack",
      enabled: true,
      supportedCountries: ["NG"],
      supportedCurrencies: ["NGN"],
      supportedMethods: ["CARD", "BANK_TRANSFER"],
      displayOrder: 0,
      createdAt: "2026-09-15T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:00.000Z",
    },
  ]);
  mockedUpsertPaymentProvider.mockResolvedValue({
    id: "provider-paystack",
    platformConfigId: "platform-config",
    providerKey: "paystack",
    displayName: "Paystack",
    enabled: true,
    supportedCountries: ["NG"],
    supportedCurrencies: ["NGN"],
    supportedMethods: ["CARD", "BANK_TRANSFER"],
    displayOrder: 0,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  });
  mockedPaymentProviderStatus.mockResolvedValue({
    id: "provider-paystack",
    platformConfigId: "platform-config",
    providerKey: "paystack",
    displayName: "Paystack",
    enabled: false,
    supportedCountries: ["NG"],
    supportedCurrencies: ["NGN"],
    supportedMethods: ["CARD", "BANK_TRANSFER"],
    displayOrder: 0,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  });
  mockedDeletePaymentProvider.mockResolvedValue({
    id: "provider-paystack",
    removed: true,
  });

  mockedPaymentMethods.mockResolvedValue([
    {
      id: "method-card",
      platformConfigId: "platform-config",
      methodKey: "CARD",
      displayName: "Card",
      providerKey: "paystack",
      enabled: true,
      supportedCountries: ["NG"],
      supportedCurrencies: ["NGN"],
      displayOrder: 0,
      createdAt: "2026-09-15T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:00.000Z",
    },
  ]);
  mockedUpsertPaymentMethod.mockResolvedValue({
    id: "method-card",
    platformConfigId: "platform-config",
    methodKey: "CARD",
    displayName: "Card",
    providerKey: "paystack",
    enabled: true,
    supportedCountries: ["NG"],
    supportedCurrencies: ["NGN"],
    displayOrder: 0,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  });
  mockedPaymentMethodStatus.mockResolvedValue({
    id: "method-card",
    platformConfigId: "platform-config",
    methodKey: "CARD",
    displayName: "Card",
    providerKey: "paystack",
    enabled: false,
    supportedCountries: ["NG"],
    supportedCurrencies: ["NGN"],
    displayOrder: 0,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  });
  mockedDeletePaymentMethod.mockResolvedValue({
    id: "method-card",
    removed: true,
  });
});

describe("PlatformOwnerPage", () => {
  it("loads platform configuration and updates a setting with optimistic version", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Platform Owner Control Center",
      }),
    ).toBeInTheDocument();

    expect(mockedConfiguration).toHaveBeenCalledWith("platform-token");

    expect(
      await screen.findByRole("heading", {
        name: "Platform configuration",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText("New business registration"),
    ).toBeInTheDocument();

    const maintenanceButton = screen.getByRole("button", {
      name: "Enable",
    });

    expect(maintenanceButton).toBeInTheDocument();

    await userEvent.click(maintenanceButton);

    expect(mockedUpdateConfiguration).toHaveBeenCalledWith(
      {
        maintenanceMode: true,
        expectedVersion: 1,
      },
      "platform-token",
    );
  });

  it("renders the system health and error center", async () => {
    renderPage();

    const heading = await screen.findByRole("heading", {
      name: "Platform health & error center",
    });

    expect(heading).toBeInTheDocument();
    expect(screen.getByText("SYSTEM HEALTH")).toBeInTheDocument();

    const section = heading.closest("section");
    expect(section).not.toBeNull();
    expect(section).toHaveTextContent("Healthy");
    expect(section).toHaveTextContent("System operational");
    expect(section).toHaveTextContent("test");

    expect(
      screen.getByRole("button", { name: "Run health check" }),
    ).toBeInTheDocument();
    expect(mockedHealth).toHaveBeenCalledWith("platform-token");
  });

  it("shows degraded database health", async () => {
    mockedHealth.mockResolvedValue({
      ...platformHealth,
      status: "degraded",
      database: "unhealthy",
    });

    renderPage();

    const heading = await screen.findByRole("heading", {
      name: "Platform health & error center",
    });
    const section = heading.closest("section");

    expect(section).not.toBeNull();
    expect(section).toHaveTextContent("Degraded");
    expect(section).toHaveTextContent("Unhealthy");
    expect(section).toHaveTextContent("Attention required");
    expect(section).toHaveTextContent(
      "One or more monitored services need attention",
    );
  });

  it("shows a health-service error without hiding the control center", async () => {
    mockedHealth.mockRejectedValue(
      new Error("Health service unavailable"),
    );

    renderPage();

    expect(
      await screen.findByText("Health check unavailable.", {}, { timeout: 3000 }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: "Platform Owner Control Center",
      }),
    ).toBeInTheDocument();
  });

  it("makes platform KPI cards navigate to their detailed platform sections", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Platform Owner Control Center",
      }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        document.querySelector(".platform-kpi-grid")?.querySelectorAll(
          "a.platform-kpi-link",
        ),
      ).toHaveLength(6);
    });

    const kpiLinks = Array.from(
      document
        .querySelector(".platform-kpi-grid")!
        .querySelectorAll("a.platform-kpi-link"),
    );

    expect(kpiLinks).toHaveLength(6);

    expect(kpiLinks[0]).toHaveAttribute(
      "href",
      "#platform-company-directory",
    );
    expect(kpiLinks[1]).toHaveAttribute(
      "href",
      "#platform-global-statistics",
    );
    expect(kpiLinks[2]).toHaveAttribute(
      "href",
      "#platform-global-statistics",
    );
    expect(kpiLinks[3]).toHaveAttribute(
      "href",
      "#platform-global-statistics",
    );
    expect(kpiLinks[4]).toHaveAttribute(
      "href",
      "#platform-company-directory",
    );
    expect(kpiLinks[5]).toHaveAttribute(
      "href",
      "#platform-revenue-overview",
    );

    expect(
      screen.getByText("Worldwide platform coverage").closest("section"),
    ).toHaveAttribute("id", "platform-global-statistics");

    expect(
      screen.getByText("Platform-wide financial activity").closest("section"),
    ).toHaveAttribute("id", "platform-revenue-overview");

    expect(
      screen.getByText("Platform growth").closest("section"),
    ).toHaveAttribute("id", "platform-growth-analytics");

    expect(
      screen.getByText("Registered laundry companies").closest("section"),
    ).toHaveAttribute("id", "platform-company-directory");

    expect(
      screen.getByText("Recent platform activity").closest("section"),
    ).toHaveAttribute("id", "platform-audit-activity");

    expect(
      screen.getByText("Platform health & error center").closest("section"),
    ).toHaveAttribute("id", "platform-health");

    await waitFor(() => {
      expect(
        document.querySelectorAll(
          '.platform-revenue-summary a.platform-kpi-link',
        ),
      ).toHaveLength(4);

      expect(
        document.querySelectorAll(
          '.platform-growth-summary a.platform-kpi-link',
        ).length,
      ).toBeGreaterThanOrEqual(4);
    });

    const revenueLinks = Array.from(
      document.querySelectorAll(
        '.platform-revenue-summary a.platform-kpi-link',
      ),
    );

    expect(revenueLinks[0]).toHaveAttribute(
      "href",
      "#platform-revenue-methods",
    );
    expect(revenueLinks[1]).toHaveAttribute(
      "href",
      "#platform-revenue-methods",
    );
    expect(revenueLinks[2]).toHaveAttribute(
      "href",
      "#platform-revenue-methods",
    );

    const growthChart = document.getElementById("platform-growth-chart");
    expect(growthChart).not.toBeNull();
    expect(growthChart).toHaveAttribute(
      "aria-label",
      "View monthly platform growth details",
    );
    expect(growthChart).toHaveAttribute("role", "link");
    expect(growthChart).toHaveAttribute("tabindex", "0");

    const globalSection = document.getElementById(
      "platform-global-statistics",
    );
    expect(globalSection).not.toBeNull();

    const globalLinks = Array.from(
      globalSection!.querySelectorAll(
        ".platform-growth-summary a.platform-kpi-link",
      ),
    );

    expect(globalLinks).toHaveLength(4);
    expect(globalLinks[0]).toHaveAttribute(
      "href",
      "#platform-country-breakdown",
    );
    expect(globalLinks[1]).toHaveAttribute(
      "href",
      "#platform-company-directory",
    );
    expect(globalLinks[2]).toHaveAttribute(
      "href",
      "#platform-country-breakdown",
    );
    expect(globalLinks[3]).toHaveAttribute(
      "href",
      "#platform-country-breakdown",
    );
  });

  it("renders platform-wide KPIs and company directory", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Platform Owner Control Center",
      }),
    ).toBeInTheDocument();

    expect(await screen.findByText("Registered companies")).toBeInTheDocument();
    expect(
      screen.getByText("Registered companies").parentElement?.querySelector("strong"),
    ).toHaveTextContent("3");
    expect(await screen.findByText("Laundry A")).toBeInTheDocument();
    expect(screen.getByText("₦150,000")).toBeInTheDocument();
  });


    it("renders worldwide global statistics and country coverage", async () => {
      renderPage();

      expect(
        await screen.findByRole("heading", {
          name: "Worldwide platform coverage",
        }),
      ).toBeInTheDocument();

      expect(screen.getByText("GLOBAL STATISTICS")).toBeInTheDocument();

      const countriesLabel = screen.getByText("Countries");
      expect(
        countriesLabel.parentElement?.querySelector("strong"),
      ).toHaveTextContent("2");

      const branchesLabel = screen.getByText("Branches");
      expect(
        branchesLabel.parentElement?.querySelector("strong"),
      ).toHaveTextContent("4");

      const globalStatisticsHeading = screen.getByRole("heading", {
        name: "Worldwide platform coverage",
      });
      const globalStatisticsSection = globalStatisticsHeading.closest("section");

      expect(globalStatisticsSection).not.toBeNull();
      expect(globalStatisticsSection).toHaveTextContent("NG");
      expect(globalStatisticsSection).toHaveTextContent("GH");
      expect(globalStatisticsSection).toHaveTextContent("60");
      expect(globalStatisticsSection).toHaveTextContent("15");
      expect(mockedGlobalStatistics).toHaveBeenCalledWith("platform-token");
    });

  it("renders platform-wide revenue analytics and payment method breakdown", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Platform-wide financial activity",
      }),
    ).toBeInTheDocument();

    expect(screen.getByText("Gross payments")).toBeInTheDocument();
    expect(screen.getByText("₦250,000")).toBeInTheDocument();
    expect(screen.getByText("Refunds")).toBeInTheDocument();
    expect(screen.getByText("₦40,000")).toBeInTheDocument();

    const netCollectedLabels = screen.getAllByText("Net collected");
    expect(netCollectedLabels).toHaveLength(4);
    expect(netCollectedLabels[0]).toBeInTheDocument();

    expect(screen.getByText("₦210,000")).toBeInTheDocument();

    expect(screen.getByText("30 posted payments")).toBeInTheDocument();
    expect(screen.getByText("5 posted refunds")).toBeInTheDocument();

    expect(screen.getByText("CASH")).toBeInTheDocument();
    expect(screen.getByText("TRANSFER")).toBeInTheDocument();
    expect(screen.getByText("POS")).toBeInTheDocument();
    expect(screen.getByText("₦90,000")).toBeInTheDocument();
    expect(screen.getByText("₦70,000")).toBeInTheDocument();
    expect(screen.getByText("₦50,000")).toBeInTheDocument();

    expect(mockedRevenue).toHaveBeenCalledWith("platform-token");
  });

  it("renders platform growth analytics and monthly activity", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Platform growth",
      }),
    ).toBeInTheDocument();

    expect(screen.getByText("GROWTH ANALYTICS")).toBeInTheDocument();
    expect(screen.getByText("Monthly activity")).toBeInTheDocument();
    expect(screen.getByText("New records created by month")).toBeInTheDocument();
    expect(screen.getAllByText("Businesses").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Users").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Customers").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Orders").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("2026-01")).toBeInTheDocument();
    expect(screen.getByText("2026-02")).toBeInTheDocument();
    expect(mockedGrowth).toHaveBeenCalledWith("platform-token");
  });

  it("shows a growth error without hiding the rest of the control center", async () => {
    mockedGrowth.mockRejectedValue(new Error("Growth service unavailable"));

    renderPage();

    expect(
      await screen.findByText(
        "Growth analytics could not be loaded.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByText("Laundry A")).toBeInTheDocument();
  });

  it("shows growth analytics only for platform administrators", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@example.com",
        fullName: "Business Owner",
        role: "BUSINESS_OWNER",
        permissions: [],
        businessId: "business-1",
        branches: [{ id: "branch-1", name: "Main Branch" }],
      },
    });

    renderPage();

    expect(mockedGrowth).not.toHaveBeenCalled();
  });

  it("shows a revenue error without hiding the rest of the control center", async () => {
    mockedRevenue.mockRejectedValue(new Error("Revenue service unavailable"));

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Platform Owner Control Center",
      }),
    ).toBeInTheDocument();

    expect(
      await screen.findByText(
        "Revenue analytics could not be loaded.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByText("Laundry A")).toBeInTheDocument();
  });

  it("activates an inactive company after confirmation", async () => {
    const inactiveBusiness: PlatformBusiness = {
      ...businesses[0]!,
      id: "biz-inactive",
      name: "Laundry Inactive",
      isActive: false,
    };

    mockedBusinesses.mockResolvedValue([inactiveBusiness]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedActivate.mockResolvedValue({
      ...inactiveBusiness,
      isActive: true,
    });

    renderPage();

    expect(
      await screen.findByText("Laundry Inactive"),
    ).toBeInTheDocument();

    const activateButton = screen.getByRole("button", { name: "Activate" });
    activateButton.click();

    expect(window.confirm).toHaveBeenCalledWith(
      "Are you sure you want to activate this company?",
    );
    await waitFor(() =>
      expect(mockedActivate).toHaveBeenCalledWith(
        "biz-inactive",
        "platform-token",
      ),
    );
  });

  it("deactivates an active company after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedDeactivate.mockResolvedValue({
      ...businesses[0]!,
      isActive: false,
    });

    renderPage();

    expect(await screen.findByText("Laundry A")).toBeInTheDocument();

    const deactivateButton = screen.getByRole("button", {
      name: "Deactivate",
    });
    deactivateButton.click();

    expect(window.confirm).toHaveBeenCalledWith(
      "Are you sure you want to deactivate this company?",
    );
    await waitFor(() =>
      expect(mockedDeactivate).toHaveBeenCalledWith(
        "biz-A",
        "platform-token",
      ),
    );
  });

  it("does not change company status when confirmation is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);

    renderPage();

    expect(await screen.findByText("Laundry A")).toBeInTheDocument();

    screen.getByRole("button", { name: "Deactivate" }).click();

    expect(mockedDeactivate).not.toHaveBeenCalled();
  });

  it("creates a monthly subscription for a company without a subscription", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const businessWithoutSubscription: PlatformBusiness = {
      ...businesses[0]!,
      id: "biz-no-subscription",
      name: "Laundry No Subscription",
      subscription: null,
    };

    mockedBusinesses.mockResolvedValue([
      businessWithoutSubscription,
    ]);
    mockedRenewSubscription.mockResolvedValue({
      id: "sub-new",
      plan: "MONTHLY",
      status: "ACTIVE",
      startsAt: "2026-09-16T00:00:00.000Z",
      endsAt: "2026-10-16T00:00:00.000Z",
    });

    renderPage();

    expect(
      await screen.findByText("Laundry No Subscription"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Create Monthly Subscription",
      }),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      "Create or renew a one-month subscription for Laundry No Subscription?",
    );

    await waitFor(() => {
      expect(mockedRenewSubscription).toHaveBeenCalledWith(
        "biz-no-subscription",
        "MONTHLY",
        expect.anything(),
      );
    });

    expect(
      await screen.findByText(
        "Company subscription created or renewed successfully.",
      ),
    ).toBeInTheDocument();
  });

  it("renders billing configuration for subscription prices, providers, and methods", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Subscription & payment configuration",
      }),
    ).toBeInTheDocument();

    expect(mockedSubscriptionPrices).toHaveBeenCalledWith("platform-token");
    expect(mockedPaymentProviders).toHaveBeenCalledWith("platform-token");
    expect(mockedPaymentMethods).toHaveBeenCalledWith("platform-token");

    const priceLabel = screen.getByText((text) => text.includes("MONTHLY") && text.includes("NG") && text.includes("NGN"), { selector: "strong" }); const priceRow = priceLabel.closest(".platform-config-row"); expect(priceRow).toBeInTheDocument(); expect(priceRow).toHaveTextContent("10,000");
    const billingSection = screen
      .getByRole("heading", { name: "Subscription & payment configuration" })
      .closest("section");
    expect(billingSection).toBeInTheDocument();
    expect(billingSection).toHaveTextContent("Paystack · paystack");
    expect(billingSection).toHaveTextContent("Card · CARD");

    expect(
      screen.getByRole("button", { name: "Save price" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save provider" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save method" }),
    ).toBeInTheDocument();
  });

  it("does not expose the control center to tenant roles", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@example.com",
        fullName: "Business Owner",
        role: "BUSINESS_OWNER",
        permissions: [],
        businessId: "business-1",
        branches: [{ id: "branch-1", name: "Main Branch" }],
      },
    });

    renderPage();

    expect(
      screen.getByRole("heading", { name: "Platform access restricted" }),
    ).toBeInTheDocument();

    expect(mockedOverview).not.toHaveBeenCalled();
    expect(mockedBusinesses).not.toHaveBeenCalled();
    expect(mockedAudits).not.toHaveBeenCalled();
    expect(mockedRevenue).not.toHaveBeenCalled();
    expect(mockedGrowth).not.toHaveBeenCalled();
  });

  it("opens a company control center from the company directory", async () => {
    renderPage();

    const companyLink = await screen.findByRole("button", {
      name: /Open Laundry A company control center/i,
    });

    await userEvent.click(companyLink);

    expect(
      await screen.findByRole("heading", { name: "Laundry A" }),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Business information"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Company staff"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Recent company activity"),
    ).toBeInTheDocument();

    expect(
      mockedBusinessDetails,
    ).toHaveBeenCalledWith("biz-A", "platform-token");
  });

});

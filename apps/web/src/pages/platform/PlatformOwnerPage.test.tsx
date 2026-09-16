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
  getPlatformOverview,
  getPlatformRevenueAnalytics,
  getPlatformGrowthAnalytics,
  getPlatformGlobalStatistics,
  getPlatformHealth,
  getPlatformConfiguration,
  updatePlatformConfiguration,
} from "../../lib/platform-api.js";
import type { PlatformBusiness } from "../../lib/platform-api.js";
import { useAuthStore } from "../../state/auth-store.js";

vi.mock("../../lib/platform-api.js", () => ({
  activatePlatformBusiness: vi.fn(),
  deactivatePlatformBusiness: vi.fn(),
  renewPlatformBusinessSubscription: vi.fn(),
  getPlatformAuditLogs: vi.fn(),
  getPlatformBusinesses: vi.fn(),
  getPlatformOverview: vi.fn(),
  getPlatformRevenueAnalytics: vi.fn(),
  getPlatformGrowthAnalytics: vi.fn(),
  getPlatformGlobalStatistics: vi.fn(),
  getPlatformHealth: vi.fn(),
  getPlatformConfiguration: vi.fn(),
  updatePlatformConfiguration: vi.fn(),
}));

const mockedActivate = vi.mocked(activatePlatformBusiness);
const mockedDeactivate = vi.mocked(deactivatePlatformBusiness);
const mockedRenewSubscription = vi.mocked(
  renewPlatformBusinessSubscription,
);
const mockedOverview = vi.mocked(getPlatformOverview);
const mockedBusinesses = vi.mocked(getPlatformBusinesses);
const mockedAudits = vi.mocked(getPlatformAuditLogs);
const mockedRevenue = vi.mocked(getPlatformRevenueAnalytics);
const mockedGrowth = vi.mocked(getPlatformGrowthAnalytics);
const mockedGlobalStatistics = vi.mocked(getPlatformGlobalStatistics);
const mockedHealth = vi.mocked(getPlatformHealth);
const mockedConfiguration = vi.mocked(getPlatformConfiguration);
const mockedUpdateConfiguration = vi.mocked(updatePlatformConfiguration);

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

  it("does not expose the control center to tenant roles", () => {
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@example.com",
        fullName: "Business Owner",
        role: "BUSINESS_OWNER",
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
});

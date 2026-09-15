import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformOwnerPage } from "./PlatformOwnerPage.js";
import {
  getPlatformAuditLogs,
  getPlatformBusinesses,
  getPlatformOverview,
} from "../../lib/platform-api.js";
import { useAuthStore } from "../../state/auth-store.js";

vi.mock("../../lib/platform-api.js", () => ({
  getPlatformAuditLogs: vi.fn(),
  getPlatformBusinesses: vi.fn(),
  getPlatformOverview: vi.fn(),
}));

const mockedOverview = vi.mocked(getPlatformOverview);
const mockedBusinesses = vi.mocked(getPlatformBusinesses);
const mockedAudits = vi.mocked(getPlatformAuditLogs);

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

const businesses = [
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

  mockedOverview.mockResolvedValue(overview);
  mockedBusinesses.mockResolvedValue(businesses);
  mockedAudits.mockResolvedValue([]);
});

describe("PlatformOwnerPage", () => {
  it("renders platform-wide KPIs and company directory", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Platform Owner Control Center",
      }),
    ).toBeInTheDocument();

    expect(await screen.findByText("Registered companies")).toBeInTheDocument();
    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(await screen.findByText("Laundry A")).toBeInTheDocument();
    expect(screen.getByText("₦150,000")).toBeInTheDocument();
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
  });
});

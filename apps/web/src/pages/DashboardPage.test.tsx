import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "./DashboardPage.js";
import { getDashboardReport } from "../lib/reports-api.js";

vi.mock("../lib/reports-api.js", () => ({
  getDashboardReport: vi.fn(),
}));

vi.mock("../state/auth-store.js", () => ({
  useAuthStore: (selector: (state: {
    user: { fullName: string; role: string; permissions: string[] };
    accessToken: string;
    activeBranchId: string;
  }) => unknown) =>
    selector({
      user: {
        fullName: "Jane Manager",
        role: "BRANCH_MANAGER",
        permissions: ["reports.view", "orders.create"],
      },
      accessToken: "token",
      activeBranchId: "branch-1",
    }),
}));

const mockedGetDashboardReport = vi.mocked(getDashboardReport);

const report = {
  period: {
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-09-11T23:59:59.999Z",
  },
  orders: { total: 120 },
  invoices: {
    total: 100,
    totalAmount: 1000000,
    outstandingAmount: 300000,
  },
  payments: {
    received: 700000,
    refunded: 50000,
    netReceived: 650000,
  },
  customers: { active: 84 },
  inventory: {
    stockItems: 31,
    movements: 76,
  },
};

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DashboardPage", () => {
  it("renders dashboard KPIs from the report", async () => {
    mockedGetDashboardReport.mockResolvedValue(report);

    renderDashboard();

    expect(await screen.findByText("120")).toBeInTheDocument();
    expect(screen.getByText("₦1,000,000")).toBeInTheDocument();
    expect(screen.getAllByText("₦300,000")).toHaveLength(2);
    expect(screen.getAllByText("₦650,000")).toHaveLength(2);
    expect(screen.getByText("84")).toBeInTheDocument();
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
  });

  it("shows loading skeletons while the report is loading", () => {
    mockedGetDashboardReport.mockReturnValue(new Promise(() => {}));

    renderDashboard();

    expect(screen.getByLabelText("Loading dashboard metrics")).toBeInTheDocument();
  });

  it("shows an error with retry", async () => {
    mockedGetDashboardReport.mockRejectedValue(new Error("Network error"));

    renderDashboard();

    expect(
      await screen.findByText("Unable to load your dashboard"),
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("uses the selected date range when loading the report", async () => {
    mockedGetDashboardReport.mockResolvedValue(report);

    renderDashboard();

    await waitFor(() => {
      expect(mockedGetDashboardReport).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String),
        }),
        { accessToken: "token" },
        "branch-1",
      );
    });
  });

  it("makes every business KPI card clickable to its relevant workflow", async () => {
    mockedGetDashboardReport.mockResolvedValue(report);

    renderDashboard();

    await screen.findByText("120");

    expect(screen.getByRole("link", { name: "View orders" })).toHaveAttribute(
      "href",
      "/orders",
    );
    expect(screen.getByRole("link", { name: "View invoices" })).toHaveAttribute(
      "href",
      "/invoices",
    );
    expect(
      screen.getByRole("link", { name: "View outstanding invoices" }),
    ).toHaveAttribute("href", "/invoices");
    expect(screen.getByRole("link", { name: "View payments" })).toHaveAttribute(
      "href",
      "/payments",
    );
    expect(
      screen.getByRole("link", { name: "View customers" }),
    ).toHaveAttribute("href", "/customers");
    expect(
      screen.getByRole("link", { name: "View inventory" }),
    ).toHaveAttribute("href", "/inventory");
  });

  it("renders quick actions for core business workflows", async () => {
    mockedGetDashboardReport.mockResolvedValue(report);

    renderDashboard();

    await screen.findByText("120");

    const quickActions = screen.getByRole("heading", {
      name: "Quick actions",
    }).closest("section");

    expect(quickActions).not.toBeNull();
    expect(quickActions).toHaveTextContent("Orders");
    expect(quickActions).toHaveTextContent("Customers");
    expect(quickActions).toHaveTextContent("Invoices");
    expect(quickActions).toHaveTextContent("Payments");

    expect(
      quickActions?.querySelector('a[href="/orders"]'),
    ).toBeInTheDocument();
    expect(
      quickActions?.querySelector('a[href="/customers"]'),
    ).toBeInTheDocument();
    expect(
      quickActions?.querySelector('a[href="/invoices"]'),
    ).toBeInTheDocument();
    expect(
      quickActions?.querySelector('a[href="/payments"]'),
    ).toBeInTheDocument();
  });
});

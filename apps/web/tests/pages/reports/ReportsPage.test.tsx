import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportsPage } from "../../../src/pages/reports/ReportsPage.js";
import { useAuthStore } from "../../../src/state/auth-store.js";
import { ApiError } from "../../../src/lib/api-client.js";
import * as reportsApi from "../../../src/lib/reports-api.js";

vi.mock("../../../src/lib/reports-api.js");

const report = {
  period: {
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-09-07T00:00:00.000Z",
  },
  orders: { total: 12 },
  invoices: {
    total: 10,
    totalAmount: 125000,
    collectedAmount: 90000,
    outstandingAmount: 35000,
    collectionRate: 72,
    collectionStatement: [
      {
        invoiceId: "invoice-1",
        invoiceNumber: "INV-000001",
        amount: 125000,
        collected: 90000,
        outstanding: 35000,
        date: "2026-09-02T00:00:00.000Z",
        status: "ISSUED",
      },
    ],
    outstandingByYearMonth: {
      "2026": {
        September: {
          invoiceCount: 1,
          outstandingAmount: 35000,
          invoices: [
            {
              invoiceId: "invoice-1",
              invoiceNumber: "INV-000001",
              amount: 125000,
              outstanding: 35000,
              date: "2026-09-02T00:00:00.000Z",
            },
          ],
        },
      },
    },
  },
  payments: {
    received: 90000,
    refunded: 5000,
    netReceived: 85000,
  },
  pickup: {
    pickedUpCount: 8,
    unpickedCount: 4,
    totalGarments: 12,
  },
  customers: { active: 24 },
  managementInsights: [
    "Outstanding customer balances total ₦35,000.",
    "4 garments remain unpicked.",
    "Collection performance is 72.0%.",
  ],
  inventory: {
    stockItems: 8,
    movements: 17,
  },
};

const annualReport = {
  period: {
    year: 2026,
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-12-31T23:59:59.999Z",
  },
  currencyCode: "NGN",
  revenue: {
    grossInvoiced: 1000000,
    refunds: 50000,
    netRevenue: 950000,
  },
  expenses: {
    explicit: 200000,
    salary: 300000,
    total: 500000,
    byCategory: {
      RENT: 200000,
      SALARY: 300000,
    },
  },
  profitOrLoss: {
    amount: 450000,
    type: "PROFIT" as const,
  },
  collection: {
    annualInvoiceCount: 10,
    annualInvoiceAmount: 1000000,
    annualCollectedAmount: 800000,
    annualOutstandingAmount: 200000,
    collectionRate: 80,
    yearEndOutstandingAmount: 200000,
  },
  outstandingByYearMonth: {},
  monthlyTrend: [
    {
      month: "January",
      grossRevenue: 100000,
      refunds: 5000,
      netRevenue: 95000,
      explicitExpenses: 20000,
      salaryExpense: 30000,
      totalExpenses: 50000,
      profitOrLoss: 45000,
    },
  ],
  branchSummary: {},
  managementInsights: ["Collection performance was 80.0%."],
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ReportsPage />
    </QueryClientProvider>,
  );
}

describe("ReportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthStore.setState({
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "owner@example.com",
        fullName: "Business Owner",
        role: "BUSINESS_OWNER",
        businessId: "22222222-2222-4222-8222-222222222222",
        isActive: true,
        branches: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Main Branch",
          },
        ],
        permissions: ["reports.view"],
      },
      accessToken: "test-token",
      refreshToken: null,
      activeBranchId: "33333333-3333-4333-8333-333333333333",
    });

    vi.mocked(reportsApi.getDashboardReport).mockResolvedValue(report);
    vi.mocked(reportsApi.getAnnualReport).mockResolvedValue(annualReport);
  });

  it("loads and displays the dashboard report", async () => {
    renderPage();

    expect(await screen.findByText("Total orders: 12")).toBeInTheDocument();
    expect(screen.getByText("Total invoices: 10")).toBeInTheDocument();
    expect(screen.getByText("Invoiced: ₦125,000")).toBeInTheDocument();
    expect(screen.getAllByText("Outstanding: ₦35,000")).toHaveLength(2);
    expect(screen.getByText("Received: ₦90,000")).toBeInTheDocument();
    expect(screen.getByText("Refunded: ₦5,000")).toBeInTheDocument();
    expect(screen.getByText("Net received: ₦85,000")).toBeInTheDocument();
    expect(screen.getByText("Active customers: 24")).toBeInTheDocument();
    expect(screen.getByText("Stock items: 8")).toBeInTheDocument();
    expect(screen.getByText("Movements: 17")).toBeInTheDocument();
  });

  it("loads and displays the annual financial report", async () => {
    renderPage();

    expect(
      await screen.findByText("Annual Financial Report"),
    ).toBeInTheDocument();

    expect(
      await screen.findByText("Gross revenue: ₦1,000,000"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Collected: ₦800,000"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Collection rate: 80.0%"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Year-end outstanding: ₦200,000"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Collection performance was 80.0%."),
    ).toBeInTheDocument();

    expect(reportsApi.getAnnualReport).toHaveBeenCalledWith(
      new Date().getFullYear(),
      { accessToken: "test-token" },
    );
  });

  it("applies a selected date range", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Total orders: 12");

    const dateInputs = screen.getAllByDisplayValue(/2026-/);

    await user.clear(dateInputs[0]);
    await user.type(dateInputs[0], "2026-08-01");
    await user.clear(dateInputs[1]);
    await user.type(dateInputs[1], "2026-08-31");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(reportsApi.getDashboardReport).toHaveBeenLastCalledWith(
        {
          from: "2026-08-01",
          to: "2026-08-31",
        },
        { accessToken: "test-token" },
        "33333333-3333-4333-8333-333333333333",
      );
    });
  });

  it("switches to all-time reporting", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Total orders: 12");

    await user.click(screen.getByRole("button", { name: "All time" }));

    await waitFor(() => {
      expect(reportsApi.getDashboardReport).toHaveBeenLastCalledWith(
        {},
        { accessToken: "test-token" },
        "33333333-3333-4333-8333-333333333333",
      );
    });
  });

  it("blocks an invalid date range", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Total orders: 12");

    const dateInputs = screen.getAllByDisplayValue(/2026-/);

    await user.clear(dateInputs[0]);
    await user.type(dateInputs[0], "2026-09-07");
    await user.clear(dateInputs[1]);
    await user.type(dateInputs[1], "2026-09-01");

    expect(
      screen.getByText(
        "The From date must be before or equal to the To date.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("displays an API error and retries", async () => {
    const user = userEvent.setup();

    vi.mocked(reportsApi.getDashboardReport)
      .mockRejectedValueOnce(new ApiError("Reports unavailable", 500))
      .mockResolvedValueOnce(report);

    renderPage();

    expect(
      await screen.findByText("Reports unavailable"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Total orders: 12")).toBeInTheDocument();
    expect(reportsApi.getDashboardReport).toHaveBeenCalledTimes(2);
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as financeApi from "../../../src/lib/finance-api.js";
import { FinancePage } from "../../../src/pages/finance/FinancePage.js";
import { useAuthStore } from "../../../src/state/auth-store.js";

vi.mock("../../../src/lib/finance-api.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/lib/finance-api.js")
  >("../../../src/lib/finance-api.js");

  return {
    ...actual,
    getFinancialStatement: vi.fn(),
    listExpenses: vi.fn(),
    createExpense: vi.fn(),
    approveExpense: vi.fn(),
    rejectExpense: vi.fn(),
    recognizeExpense: vi.fn(),
    voidExpense: vi.fn(),
  };
});

const mockedFinanceApi = vi.mocked(financeApi);

const statement = {
  period: {
    from: "2026-09-01",
    to: "2026-09-22",
  },
  revenue: {
    grossInvoiced: 125000,
    refunds: 5000,
    netRevenue: 120000,
  },
  expenses: {
    explicit: 20000,
    salary: 10000,
    total: 30000,
    byCategory: {
      RENT: 10000,
      SALARY: 10000,
    },
  },
  profitOrLoss: {
    amount: 90000,
    type: "PROFIT" as const,
  },
  detail: {
    invoices: [],
    refunds: [],
    recognizedExpenses: [],
    finalizedPayroll: [],
  },
  counts: {
    invoices: 10,
    refunds: 1,
    recognizedExpenses: 2,
    finalizedPayrollRecords: 1,
  },
};

const expense = {
  id: "expense-1",
  businessId: "business-1",
  branchId: "branch-1",
  category: "RENT" as const,
  status: "PENDING" as const,
  description: "Shop rent",
  amount: 50000,
  incurredAt: "2026-09-10T00:00:00.000Z",
  reference: null,
  note: null,
  createdAt: "2026-09-10T10:00:00.000Z",
  approvedAt: null,
  approvedById: null,
  recognizedAt: null,
  recognizedById: null,
  createdBy: {
    id: "user-1",
    fullName: "Business Owner",
    email: "owner@example.com",
  },
  approvedBy: null,
  recognizedBy: null,
};

function renderPage(
  permissions = [
    "reports.view",
    "expenses.view",
  ],
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  useAuthStore.setState({
    accessToken: "token",
    user: {
      id: "user-1",
      fullName: "Business Owner",
      role: "BUSINESS_OWNER",
      permissions,
    },
    activeBranchId: "branch-1",
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <FinancePage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  mockedFinanceApi.getFinancialStatement.mockResolvedValue(statement);
  mockedFinanceApi.listExpenses.mockResolvedValue([expense]);
  mockedFinanceApi.createExpense.mockResolvedValue(expense);
  mockedFinanceApi.approveExpense.mockResolvedValue({
    ...expense,
    status: "APPROVED",
  });
  mockedFinanceApi.rejectExpense.mockResolvedValue({
    ...expense,
    status: "REJECTED",
  });
  mockedFinanceApi.recognizeExpense.mockResolvedValue({
    ...expense,
    status: "APPROVED",
    recognizedAt: "2026-09-22T10:00:00.000Z",
  });
  mockedFinanceApi.voidExpense.mockResolvedValue({
    ...expense,
    status: "VOID",
  });
});

describe("FinancePage", () => {
  it("renders the financial statement for an authorized user", async () => {
    renderPage();

    expect(await screen.findByText("Gross invoiced")).toBeInTheDocument();
    expect(screen.getByText("₦125,000.00")).toBeInTheDocument();
    expect(screen.getByText("₦120,000.00")).toBeInTheDocument();
    const profitArticle = screen
      .getByRole("heading", { name: "Profit / Loss" })
      .closest("article");

    expect(profitArticle).not.toBeNull();
    expect(profitArticle).toHaveTextContent("₦90,000.00");
    expect(profitArticle).toHaveTextContent("Profit");
  });

  it("creates an expense with management permission", async () => {
    const user = userEvent.setup();

    renderPage([
      "reports.view",
      "expenses.view",
      "expenses.manage",
    ]);

    await screen.findByText("Shop rent");

    const createExpenseSection = screen
      .getByRole("heading", { name: "Record expense" })
      .closest("section");

    expect(createExpenseSection).not.toBeNull();

    await user.selectOptions(
      within(createExpenseSection as HTMLElement).getByRole("combobox"),
      "RENT",
    );

    await user.type(
      screen.getByLabelText("Description"),
      "Shop rent",
    );

    await user.type(
      screen.getByLabelText("Amount (NGN)"),
      "50000",
    );

    const incurredDate = screen.getByLabelText("Incurred date");
    await user.clear(incurredDate);
    await user.type(incurredDate, "2026-09-10");

    await user.click(
      screen.getByRole("button", { name: "Record expense" }),
    );

    await waitFor(() => {
      expect(mockedFinanceApi.createExpense).toHaveBeenCalledWith(
        {
          category: "RENT",
          description: "Shop rent",
          amount: 50000,
          incurredAt: "2026-09-10",
          reference: undefined,
          note: undefined,
        },
        { accessToken: "token" },
        "branch-1",
      );
    });
  });

  it("hides expense action buttons without the required permissions", async () => {
    renderPage([
      "reports.view",
      "expenses.view",
    ]);

    await screen.findByText("Shop rent");

    expect(
      screen.queryByRole("button", { name: "Approve" }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Reject" }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Void" }),
    ).not.toBeInTheDocument();
  });

  it("does not void an expense when confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValue(false);

    renderPage([
      "reports.view",
      "expenses.view",
      "expenses.void",
    ]);

    await screen.findByText("Shop rent");

    await user.click(
      screen.getByRole("button", { name: "Void" }),
    );

    expect(confirmSpy).toHaveBeenCalledWith(
      "Void this expense of ₦50,000.00? This action cannot be undone.",
    );

    expect(mockedFinanceApi.voidExpense).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("voids an expense after confirmation", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValue(true);

    renderPage([
      "reports.view",
      "expenses.view",
      "expenses.void",
    ]);

    await screen.findByText("Shop rent");

    await user.click(
      screen.getByRole("button", { name: "Void" }),
    );

    await waitFor(() => {
      expect(mockedFinanceApi.voidExpense).toHaveBeenCalledWith(
        "expense-1",
        { accessToken: "token" },
        "branch-1",
      );
    });

    confirmSpy.mockRestore();
  });
});

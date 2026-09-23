import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as financeApi from "../../../src/lib/finance-api.js";
import * as usersApi from "../../../src/lib/users-api.js";
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
    getFinancialStatementConfig: vi.fn(),
    updateFinancialStatementConfig: vi.fn(),
    listFinancialStatementRecipients: vi.fn(),
    createFinancialStatementRecipient: vi.fn(),
    updateFinancialStatementRecipient: vi.fn(),
    removeFinancialStatementRecipient: vi.fn(),
  };
});

vi.mock("../../../src/lib/users-api.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/lib/users-api.js")
  >("../../../src/lib/users-api.js");

  return {
    ...actual,
    listUsers: vi.fn(),
  };
});

const mockedFinanceApi = vi.mocked(financeApi);
const mockedUsersApi = vi.mocked(usersApi);

const deliveryConfig = {
  id: "config-1",
  businessId: "business-1",
  enabled: true,
  dayOfMonth: 1,
  hour: 8,
  minute: 0,
  emailEnabled: true,
  whatsappEnabled: false,
  dailyEnabled: false,
  dailyHour: 8,
  dailyMinute: 0,
  dailyEmailEnabled: true,
  dailyWhatsappEnabled: false,
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
};

const ownerRecipient = {
  id: "recipient-owner",
  businessId: "business-1",
  userId: "user-1",
  whatsappNumber: null,
  enabled: true,
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
  user: {
    id: "user-1",
    email: "owner@example.com",
    fullName: "Business Owner",
    role: "BUSINESS_OWNER",
    isActive: true,
  },
};

const managerUser = {
  id: "user-2",
  email: "manager@example.com",
  fullName: "Branch Manager",
  role: "BRANCH_MANAGER",
  isActive: true,
  businessId: "business-1",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
  branches: [],
};

const managerRecipient = {
  id: "recipient-manager",
  businessId: "business-1",
  userId: "user-2",
  whatsappNumber: "+2348012345678",
  enabled: true,
  createdAt: "2026-09-02T08:00:00.000Z",
  updatedAt: "2026-09-02T08:00:00.000Z",
  user: {
    id: "user-2",
    email: "manager@example.com",
    fullName: "Branch Manager",
    role: "BRANCH_MANAGER",
    isActive: true,
  },
};

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

  mockedFinanceApi.getFinancialStatementConfig.mockResolvedValue(
    deliveryConfig,
  );
  mockedFinanceApi.updateFinancialStatementConfig.mockResolvedValue(
    deliveryConfig,
  );
  mockedFinanceApi.listFinancialStatementRecipients.mockResolvedValue([
    ownerRecipient,
  ]);
  mockedFinanceApi.createFinancialStatementRecipient.mockResolvedValue(
    managerRecipient,
  );
  mockedFinanceApi.updateFinancialStatementRecipient.mockResolvedValue(
    managerRecipient,
  );
  mockedFinanceApi.removeFinancialStatementRecipient.mockResolvedValue(
    managerRecipient,
  );

  mockedUsersApi.listUsers.mockResolvedValue([managerUser]);
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

  it("renders financial statement delivery settings and recipients", async () => {
    renderPage([
      "reports.view",
      "expenses.view",
    ]);

    expect(
      await screen.findByRole("heading", {
        name: "Automatic financial statement delivery",
      }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("checkbox", {
      name: "Automatically send the monthly financial statement",
    }),
    ).toBeChecked();

    expect(
      await screen.findByRole("checkbox", {
      name: "Email",
    }),
    ).toBeChecked();

    expect(
      await screen.findByRole("checkbox", {
      name: "WhatsApp",
    }),
    ).not.toBeChecked();

    const ownerRow = screen.getByRole("row", {
      name: /Business Owner.*owner@example\.com.*Business Owner.*Enabled/,
    });

    expect(ownerRow).toBeInTheDocument();
    expect(within(ownerRow).getByText("owner@example.com")).toBeInTheDocument();
  });

  it("saves financial statement delivery settings with the selected schedule and channels", async () => {
    const user = userEvent.setup();

    renderPage([
      "reports.view",
      "expenses.view",
      "reports.manage",
    ]);

    await screen.findByRole("heading", {
      name: "Automatic financial statement delivery",
    });

    const deliverySection = screen
      .getByRole("heading", {
        name: "Automatic financial statement delivery",
      })
      .closest("section");

    expect(deliverySection).not.toBeNull();

    const section = deliverySection as HTMLElement;

    const dayInput = await within(section).findByLabelText("Day of month");
    const hourInput = await within(section).findByLabelText("Hour");
    const minuteInput = await within(section).findByLabelText("Minute");

    await user.clear(dayInput);
    await user.type(dayInput, "15");

    await user.clear(hourInput);
    await user.type(hourInput, "9");

    await user.clear(minuteInput);
    await user.type(minuteInput, "30");

    await user.click(await within(section).findByRole("checkbox", {
      name: "WhatsApp",
    }));

    await user.click(
      within(section).getByRole("button", {
        name: "Save delivery settings",
      }),
    );

    await waitFor(() => {
      expect(
        mockedFinanceApi.updateFinancialStatementConfig,
      ).toHaveBeenCalledWith(
        {
          enabled: true,
          dayOfMonth: 15,
          hour: 9,
          minute: 30,
          emailEnabled: true,
          whatsappEnabled: true,
          dailyEnabled: false,
          dailyHour: 8,
          dailyMinute: 0,
          dailyEmailEnabled: true,
          dailyWhatsappEnabled: false,
        },
        { accessToken: "token" },
      );
    });
  });

  it("blocks saving enabled delivery when no channel is selected", async () => {
    const user = userEvent.setup();

    renderPage([
      "reports.view",
      "expenses.view",
      "reports.manage",
    ]);

    await screen.findByRole("heading", {
      name: "Automatic financial statement delivery",
    });

    const deliverySection = screen
      .getByRole("heading", {
        name: "Automatic financial statement delivery",
      })
      .closest("section");

    expect(deliverySection).not.toBeNull();

    const section = deliverySection as HTMLElement;

    await user.click(await within(section).findByRole("checkbox", {
      name: "Email",
    }));

    await user.click(
      within(section).getByRole("button", {
        name: "Save delivery settings",
      }),
    );

    expect(
      await screen.findByText(
        "At least one delivery channel must be enabled when statements are enabled.",
      ),
    ).toBeInTheDocument();

    expect(
      mockedFinanceApi.updateFinancialStatementConfig,
    ).not.toHaveBeenCalled();
  });

  it("adds an authorized recipient with a WhatsApp number", async () => {
    const user = userEvent.setup();

    renderPage([
      "reports.view",
      "expenses.view",
      "reports.manage",
    ]);

    await screen.findByRole("heading", {
      name: "Automatic financial statement delivery",
    });

    const recipientSection = screen
      .getByRole("heading", {
        name: "Authorized recipients",
      })
      .closest("section");

    expect(recipientSection).not.toBeNull();

    const section = recipientSection as HTMLElement;

    await user.selectOptions(
      await within(section).findByRole("combobox"),
      "user-2",
    );

    await user.type(
      within(section).getByLabelText("WhatsApp number"),
      "+2348012345678",
    );

    await user.click(
      within(section).getByRole("button", {
        name: "Add recipient",
      }),
    );

    await waitFor(() => {
      expect(
        mockedFinanceApi.createFinancialStatementRecipient,
      ).toHaveBeenCalledWith(
        {
          userId: "user-2",
          whatsappNumber: "+2348012345678",
        },
        { accessToken: "token" },
      );
    });
  });

  it("hides delivery management controls without reports.manage", async () => {
    renderPage([
      "reports.view",
      "expenses.view",
    ]);

    await screen.findByRole("heading", {
      name: "Automatic financial statement delivery",
    });

    expect(
      screen.queryByRole("button", {
        name: "Save delivery settings",
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: "Add recipient",
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: /Disable|Enable|Remove/,
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps the active Business Owner recipient protected", async () => {
    renderPage([
      "reports.view",
      "expenses.view",
      "reports.manage",
    ]);

    const row = await screen.findByRole("row", {
      name: /Business Owner.*owner@example\.com.*Business Owner.*Enabled/,
    });

    const disableButton = within(row).queryByRole("button", {
      name: /Disable|Enable/,
    });
    const removeButton = within(row).queryByRole("button", {
      name: "Remove",
    });

    expect(disableButton).toBeDisabled();
    expect(removeButton).toBeDisabled();

    expect(
      screen.getByText(
        "Business Owner must remain a recipient",
      ),
    ).toBeInTheDocument();

    expect(
      mockedFinanceApi.updateFinancialStatementRecipient,
    ).not.toHaveBeenCalled();

    expect(
      mockedFinanceApi.removeFinancialStatementRecipient,
    ).not.toHaveBeenCalled();
  });

  it("allows management to disable and remove a non-owner recipient", async () => {
    const user = userEvent.setup();

    mockedFinanceApi.listFinancialStatementRecipients.mockResolvedValue([
      ownerRecipient,
      managerRecipient,
    ]);

    renderPage([
      "reports.view",
      "expenses.view",
      "reports.manage",
    ]);

    const managerRow = await screen.findByRole("row", {
      name: /Branch Manager.*manager@example\.com.*Branch Manager.*\+2348012345678.*Enabled/,
    });

    expect(managerRow).not.toBeNull();

    const row = managerRow as HTMLElement;

    await user.click(
      within(row).getByRole("button", {
        name: "Disable",
      }),
    );

    await waitFor(() => {
      expect(
        mockedFinanceApi.updateFinancialStatementRecipient,
      ).toHaveBeenCalledWith(
        "recipient-manager",
        { enabled: false },
        { accessToken: "token" },
      );
    });

    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValue(true);

    await user.click(
      within(row).getByRole("button", {
        name: "Remove",
      }),
    );

    await waitFor(() => {
      expect(
        mockedFinanceApi.removeFinancialStatementRecipient,
      ).toHaveBeenCalledWith(
        "recipient-manager",
        { accessToken: "token" },
      );
    });

    confirmSpy.mockRestore();
  });

});

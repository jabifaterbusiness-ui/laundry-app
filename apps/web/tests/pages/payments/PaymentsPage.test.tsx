import { beforeEach, describe, expect, it, vi } from "vitest";
import { within,  render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PaymentsPage } from "../../../src/pages/payments/PaymentsPage.js";
import { useAuthStore } from "../../../src/state/auth-store.js";
import * as paymentsApi from "../../../src/lib/payments-api.js";
import * as invoicesApi from "../../../src/lib/invoices-api.js";
import * as customerAccountApi from "../../../src/lib/customer-account-api.js";
import * as sensitiveAuthorization from "../../../src/components/auth/SensitiveAuthorizationProvider.js";

vi.mock("../../../src/lib/payments-api.js");
vi.mock("../../../src/lib/invoices-api.js");
vi.mock("../../../src/lib/customer-account-api.js");
vi.mock("../../../src/components/auth/SensitiveAuthorizationProvider.js");

const mockedPaymentsApi = vi.mocked(paymentsApi);
const mockedInvoicesApi = vi.mocked(invoicesApi);
const mockedCustomerAccountApi = vi.mocked(customerAccountApi);
const mockedSensitiveAuthorization = vi.mocked(sensitiveAuthorization);

function renderPage(
  role: "BUSINESS_OWNER" | "BRANCH_MANAGER" | "STAFF",
) {
  useAuthStore.setState({
    user: {
      id: "user-1",
      email: "test@example.com",
      fullName: "Test User",
      role,
      businessId: "business-1",
      branches: [{ id: "branch-1", name: "Main Branch" }],
    },
    accessToken: "token",
    refreshToken: "refresh-token",
    activeBranchId: "branch-1",
  });

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PaymentsPage />
    </QueryClientProvider>,
  );
}

const postedPayment = {
  id: "payment-1",
  businessId: "business-1",
  branchId: "branch-1",
  invoiceId: "invoice-1",
  amount: 5000,
  method: "CASH" as const,
  reference: null,
  note: null,
  status: "POSTED" as const,
  createdAt: "2026-09-01T10:00:00.000Z",
  invoice: {
    id: "invoice-1",
    invoiceNumber: "INV-00001",
    orderId: "order-1",
    totalAmount: 10000,
    status: "ISSUED",
    customerName: "John Doe",
  },
};

const voidPaymentRecord = {
  ...postedPayment,
  status: "VOID" as const,
};

const paymentsResponse = {
  data: [postedPayment],
  pagination: {
    page: 1,
    pageSize: 25,
    total: 1,
    totalPages: 1,
  },
};

const summaryResponse = {
  invoiceId: "invoice-1",
  invoiceNumber: "INV-00001",
  totalAmount: 10000,
  amountPaid: 5000,
  balance: 5000,
  paymentStatus: "PARTIALLY_PAID" as const,
  payments: [postedPayment],
};

beforeEach(() => {
  vi.clearAllMocks();

  mockedSensitiveAuthorization.useSensitiveAuthorization.mockReturnValue({
    requestSensitiveAuthorization: vi
      .fn()
      .mockResolvedValue("sensitive-token"),
  });
  useAuthStore.getState().clearSession();

  mockedPaymentsApi.listPayments.mockResolvedValue(paymentsResponse);
  mockedPaymentsApi.getInvoicePaymentSummary.mockResolvedValue(
    summaryResponse,
  );
  mockedPaymentsApi.voidPayment.mockResolvedValue(
    voidPaymentRecord,
  );

  mockedInvoicesApi.listInvoices.mockResolvedValue({
    data: [
      {
        id: "invoice-1",
        businessId: "business-1",
        branchId: "branch-1",
        orderId: "order-1",
        invoiceNumber: "INV-00001",
        status: "ISSUED",
        customerName: "John Doe",
        companyName: "Test Laundry",
        companyPhone: null,
        companyEmail: null,
        companyWebsite: null,
        companyAddress: null,
        totalAmount: 10000,
        garmentNote: null,
        internalNote: null,
        customerAgreement: "Agreed",
        items: [],
        order: {
          id: "order-1",
          orderNumber: "ORD-00001",
          customer: {
            id: "customer-1",
            name: "John Doe",
          },
          branch: {
            id: "branch-1",
            name: "Main Branch",
          },
        },
        createdAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-01T10:00:00.000Z",
      },
    ],
    pagination: {
      page: 1,
      pageSize: 100,
      total: 1,
      totalPages: 1,
    },
  });

  mockedCustomerAccountApi.getCustomerAccount.mockResolvedValue({
    id: "account-1",
    customerId: "customer-1",
    businessId: "business-1",
    balance: 15000,
    transactions: [],
  });
});

describe("PaymentsPage void workflow", () => {
  it("shows the customer account balance for Pay from Account", async () => {
    const user = userEvent.setup();
    renderPage("BUSINESS_OWNER");

    await user.click(screen.getByRole("button", { name: /record payment/i }));
    await user.selectOptions(
      screen.getByLabelText(/invoice/i),
      "invoice-1",
    );
    await user.selectOptions(
      screen.getByLabelText(/payment method/i),
      "PAY_FROM_ACCOUNT",
    );

    expect(
      await screen.findByText(/Available account balance:/i),
    ).toBeInTheDocument();
    expect(screen.getByText("₦15,000")).toBeInTheDocument();
    expect(mockedCustomerAccountApi.getCustomerAccount).toHaveBeenCalledWith(
      "customer-1",
      { accessToken: "token" },
    );
  });

  it("blocks Pay from Account when the account balance is insufficient", async () => {
    const user = userEvent.setup();
    mockedCustomerAccountApi.getCustomerAccount.mockResolvedValueOnce({
      id: "account-1",
      customerId: "customer-1",
      businessId: "business-1",
      balance: 3000,
      transactions: [],
    });

    renderPage("BUSINESS_OWNER");

    await user.click(screen.getByRole("button", { name: /record payment/i }));
    await user.selectOptions(
      screen.getByLabelText(/invoice/i),
      "invoice-1",
    );
    await user.selectOptions(
      screen.getByLabelText(/payment method/i),
      "PAY_FROM_ACCOUNT",
    );
    await user.type(screen.getByLabelText(/amount/i), "5000");
    await user.click(
      within(screen.getByRole("region", { name: /record payment/i })).getByRole(
        "button",
        { name: /record payment/i },
      ),
    );

    expect(
      await screen.findByText(
        /Payment amount cannot exceed the available account balance/i,
      ),
    ).toBeInTheDocument();
    expect(mockedPaymentsApi.createPayment).not.toHaveBeenCalled();
  });

  it("creates a Pay from Account payment when the account balance is sufficient", async () => {
    const user = userEvent.setup();
    mockedPaymentsApi.createPayment.mockResolvedValueOnce(postedPayment);

    renderPage("BUSINESS_OWNER");

    await user.click(screen.getByRole("button", { name: /record payment/i }));
    await user.selectOptions(
      screen.getByLabelText(/invoice/i),
      "invoice-1",
    );
    await user.selectOptions(
      screen.getByLabelText(/payment method/i),
      "PAY_FROM_ACCOUNT",
    );
    await user.type(screen.getByLabelText(/amount/i), "5000");
    await user.click(
      within(screen.getByRole("region", { name: /record payment/i })).getByRole(
        "button",
        { name: /record payment/i },
      ),
    );

    await waitFor(() => {
      expect(mockedPaymentsApi.createPayment).toHaveBeenCalledWith(
        {
          invoiceId: "invoice-1",
          amount: 5000,
          method: "PAY_FROM_ACCOUNT",
          reference: undefined,
          note: undefined,
        },
        {
          accessToken: "token",
          sensitiveAuthorization: "sensitive-token",
        },
        "branch-1",
      );
    });
  });

  it("shows Void for a business owner", async () => {
    renderPage("BUSINESS_OWNER");

    expect(
      await screen.findByRole("button", { name: "Void" }),
    ).toBeInTheDocument();
  });

  it("shows Void for a branch manager", async () => {
    renderPage("BRANCH_MANAGER");

    expect(
      await screen.findByRole("button", { name: "Void" }),
    ).toBeInTheDocument();
  });

  it("does not show Void for staff", async () => {
    renderPage("STAFF");

    await screen.findByText("INV-00001");

    expect(
      screen.queryByRole("button", { name: "Void" }),
    ).not.toBeInTheDocument();
  });

  it("requires confirmation before voiding a payment", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValue(false);

    renderPage("BUSINESS_OWNER");

    const voidButton = await screen.findByRole("button", {
      name: "Void",
    });

    await user.click(voidButton);

    expect(confirmSpy).toHaveBeenCalledWith(
      "Void this payment of ₦5,000? This action cannot be undone.",
    );

    expect(mockedPaymentsApi.voidPayment).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("voids a payment after confirmation", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValue(true);
    const promptSpy = vi
      .spyOn(window, "prompt")
      .mockReturnValue("Customer requested correction.");

    renderPage("BUSINESS_OWNER");

    const voidButton = await screen.findByRole("button", {
      name: "Void",
    });

    await user.click(voidButton);

    await waitFor(() => {
      expect(mockedPaymentsApi.voidPayment).toHaveBeenCalledWith(
        "payment-1",
        {
          accessToken: "token",
          sensitiveAuthorization: "sensitive-token",
        },
        "branch-1",
        "Customer requested correction.",
      );
    });

    promptSpy.mockRestore();

    confirmSpy.mockRestore();
  });

  it("does not show a Void action for an already void payment", async () => {
    mockedPaymentsApi.listPayments.mockResolvedValue({
      ...paymentsResponse,
      data: [voidPaymentRecord],
    });

    renderPage("BUSINESS_OWNER");

    await screen.findByText("INV-00001");

    expect(
      screen.queryByRole("button", { name: "Void" }),
    ).not.toBeInTheDocument();

    expect(screen.getByText("VOID")).toBeInTheDocument();
  });

  it("shows an error when voiding fails", async () => {
    const user = userEvent.setup();

    mockedPaymentsApi.voidPayment.mockRejectedValue(
      new Error("Unable to void payment"),
    );

    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "prompt").mockReturnValue("Correction requested.");

    renderPage("BUSINESS_OWNER");

    const voidButton = await screen.findByRole("button", {
      name: "Void",
    });

    await user.click(voidButton);

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(
      "Unable to void payment. Please try again.",
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PaymentsPage } from "../../../src/pages/payments/PaymentsPage.js";
import { useAuthStore } from "../../../src/state/auth-store.js";
import * as paymentsApi from "../../../src/lib/payments-api.js";
import * as invoicesApi from "../../../src/lib/invoices-api.js";

vi.mock("../../../src/lib/payments-api.js");
vi.mock("../../../src/lib/invoices-api.js");

const mockedPaymentsApi = vi.mocked(paymentsApi);
const mockedInvoicesApi = vi.mocked(invoicesApi);

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
  useAuthStore.getState().clearSession();

  mockedPaymentsApi.listPayments.mockResolvedValue(paymentsResponse);
  mockedPaymentsApi.getInvoicePaymentSummary.mockResolvedValue(
    summaryResponse,
  );
  mockedPaymentsApi.voidPayment.mockResolvedValue(
    voidPaymentRecord,
  );

  mockedInvoicesApi.listInvoices.mockResolvedValue({
    data: [],
    pagination: {
      page: 1,
      pageSize: 100,
      total: 0,
      totalPages: 0,
    },
  });
});

describe("PaymentsPage void workflow", () => {
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

    renderPage("BUSINESS_OWNER");

    const voidButton = await screen.findByRole("button", {
      name: "Void",
    });

    await user.click(voidButton);

    await waitFor(() => {
      expect(mockedPaymentsApi.voidPayment).toHaveBeenCalledWith(
        "payment-1",
        { accessToken: "token" },
        "branch-1",
      );
    });

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

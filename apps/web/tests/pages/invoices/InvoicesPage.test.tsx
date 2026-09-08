import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InvoicesPage } from "../../../src/pages/invoices/InvoicesPage.js";
import { useAuthStore } from "../../../src/state/auth-store.js";
import * as invoicesApi from "../../../src/lib/invoices-api.js";
import * as businessesApi from "../../../src/lib/businesses-api.js";

vi.mock("../../../src/lib/invoices-api.js");
vi.mock("../../../src/lib/businesses-api.js");

const mockedInvoicesApi = vi.mocked(invoicesApi);
const mockedBusinessesApi = vi.mocked(businessesApi);

function renderPage() {
  useAuthStore.setState({
    user: {
      id: "user-1",
      email: "test@example.com",
      fullName: "Test User",
      role: "BUSINESS_OWNER",
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
      <InvoicesPage />
    </QueryClientProvider>,
  );
}

const invoice = {
  id: "invoice-1",
  businessId: "business-1",
  branchId: "branch-1",
  invoiceNumber: "INV-00001",
  orderId: "order-1",
  status: "ISSUED" as const,
  totalAmount: 10000,
  createdAt: "2026-09-01T10:00:00.000Z",
  order: {
    orderNumber: "00001",
    customer: {
      name: "John Doe",
    },
  },
  items: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.getState().clearSession();

  mockedBusinessesApi.getBusinessBranding.mockResolvedValue({
    businessName: "Test Laundry",
    logoUrl: null,
  });

  mockedInvoicesApi.listInvoices.mockResolvedValue({
    data: [invoice],
    pagination: {
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    },
  });

  mockedInvoicesApi.getInvoice.mockResolvedValue(invoice);

  mockedInvoicesApi.getCustomerReceipt.mockResolvedValue({
    invoiceNumber: "INV-00001",
    business: {
      name: "Test Laundry",
      phone: "08000000000",
      email: "test@laundry.com",
      website: null,
      address: "Test Address",
    },
    customer: {
      name: "John Doe",
    },
    order: {
      orderNumber: "00001",
      createdAt: "2026-09-01T10:00:00.000Z",
      items: [],
    },
    totals: {
      subtotal: 10000,
      total: 10000,
    },
    agreement: "Customer agreement",
    notes: null,
  });

  mockedInvoicesApi.getCompanyReceipt.mockResolvedValue({
    invoiceNumber: "INV-00001",
    business: {
      name: "Test Laundry",
      phone: "08000000000",
      email: "test@laundry.com",
      website: null,
      address: "Test Address",
    },
    customer: {
      name: "John Doe",
    },
    order: {
      orderNumber: "00001",
      createdAt: "2026-09-01T10:00:00.000Z",
      items: [],
    },
    totals: {
      subtotal: 10000,
      total: 10000,
    },
    internalNote: null,
    notes: null,
  });
});

describe("InvoicesPage digital receipt shortcut", () => {
  it("opens the Resend Receipt quick operation with Ctrl+Shift+F1", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    renderPage();

    expect(await screen.findByText("INV-00001")).toBeInTheDocument();

    const invoiceRow = screen.getByText("INV-00001");
    invoiceRow.click();

    await waitFor(() => {
      expect(mockedInvoicesApi.getInvoice).toHaveBeenCalledWith(
        "invoice-1",
        { accessToken: "token" },
        "branch-1",
      );
    });

    dispatchSpy.mockClear();

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "F1",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );

    const event = dispatchSpy.mock.calls
      .map(([value]) => value)
      .find(
        (value) =>
          value instanceof CustomEvent &&
          value.type === "quick-operation:open",
      );

    expect(event).toBeInstanceOf(CustomEvent);
    expect((event as CustomEvent).detail).toMatchObject({
      code: "RS",
      name: "Resend Receipt",
    });
  });
});

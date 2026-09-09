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
  customerName: "John Doe",
  companyName: "Test Laundry",
  companyPhone: "08000000000",
  companyEmail: "test@laundry.com",
  companyWebsite: "https://laundry.test",
  companyAddress: "Test Address",
  totalAmount: 10000,
  garmentNote: null,
  internalNote: null,
  customerAgreement: "Customer agreement",
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
    id: "business-1",
    name: "Test Laundry",
    phone: "08000000000",
    email: "test@laundry.com",
    website: "https://laundry.test",
    address: "Test Address",
    logoUrl: null,
    receiptPrimaryColor: "#111111",
    receiptAccentColor: "#333333",
    receiptBackgroundColor: "#ffffff",
    receiptTextColor: "#111111",
    receiptHeaderStyle: "standard",
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
    receiptType: "CUSTOMER",
    invoiceNumber: "INV-00001",
    orderNumber: "00001",
    companyName: "Test Laundry",
    companyPhone: "08000000000",
    companyEmail: "test@laundry.com",
    companyWebsite: "https://laundry.test",
    companyAddress: "Test Address",
    customerName: "John Doe",
    branchName: "Main Branch",
    createdAt: "2026-09-01T10:00:00.000Z",
    items: [],
    totalAmount: 10000,
    garmentNote: null,
    customerAgreement: "Customer agreement",
  });

  mockedInvoicesApi.getCompanyReceipt.mockResolvedValue({
    receiptType: "COMPANY",
    invoiceNumber: "INV-00001",
    orderNumber: "00001",
    companyName: "Test Laundry",
    companyPhone: "08000000000",
    companyEmail: "test@laundry.com",
    companyWebsite: "https://laundry.test",
    companyAddress: "Test Address",
    customerName: "John Doe",
    branchName: "Main Branch",
    createdAt: "2026-09-01T10:00:00.000Z",
    items: [],
    totalAmount: 10000,
    garmentNote: null,
    internalNote: null,
  });
});

describe("InvoicesPage digital receipt shortcut", () => {
  async function selectInvoice() {
    expect(await screen.findByText("INV-00001")).toBeInTheDocument();

    screen.getByText("INV-00001").click();

    await waitFor(() => {
      expect(mockedInvoicesApi.getInvoice).toHaveBeenCalledWith(
        "invoice-1",
        { accessToken: "token" },
        "branch-1",
      );
    });
  }

  it("renders the customer receipt with branding and customer-only content", async () => {
    mockedBusinessesApi.getBusinessBranding.mockResolvedValue({
      id: "business-1",
      name: "Test Laundry",
      phone: "08000000000",
      email: "test@laundry.com",
      website: "https://laundry.test",
      address: "Test Address",
      logoUrl: "https://example.com/logo.png",
      receiptPrimaryColor: "#123456",
      receiptAccentColor: "#654321",
      receiptBackgroundColor: "#f5f5f5",
      receiptTextColor: "#222222",
      receiptHeaderStyle: "standard",
    });

    mockedInvoicesApi.getCustomerReceipt.mockResolvedValue({
      receiptType: "CUSTOMER",
      invoiceNumber: "INV-00001",
      orderNumber: "00001",
      companyName: "Test Laundry",
      companyPhone: "08000000000",
      companyEmail: "test@laundry.com",
      companyWebsite: "https://laundry.test",
      companyAddress: "Test Address",
      customerName: "John Doe",
      branchName: "Main Branch",
      createdAt: "2026-09-01T10:00:00.000Z",
      items: [
        {
          id: "item-1",
          quantity: 2,
          itemName: "Shirt",
          totalPieces: 2,
          unitPrice: 2500,
          totalPrice: 5000,
        },
      ],
      totalAmount: 5000,
      garmentNote: "Handle with care",
      customerAgreement: "Customer agreement",
    });

    renderPage();
    await selectInvoice();

    screen.getByRole("button", { name: "Print Customer Copy (F1)" }).click();

    expect(await screen.findByText("LAUNDRY RECEIPT")).toBeInTheDocument();
    expect(screen.getByText("Test Laundry")).toBeInTheDocument();
    expect(screen.getByText("08000000000")).toBeInTheDocument();
    expect(screen.getByText("test@laundry.com")).toBeInTheDocument();
    expect(screen.getByText("https://laundry.test")).toBeInTheDocument();
    expect(screen.getByText("Test Address")).toBeInTheDocument();

    const logo = screen.getByAltText("Test Laundry logo");
    expect(logo).toHaveAttribute("src", "https://example.com/logo.png");

    const customerReceipt = document.querySelector(".receipt--customer");
    expect(customerReceipt).not.toBeNull();
    expect(customerReceipt).toHaveTextContent("John Doe");
    expect(customerReceipt).toHaveTextContent("Shirt");
    expect(screen.getByText("Handle with care")).toBeInTheDocument();
    expect(customerReceipt).toHaveTextContent("Customer agreement");

    expect(customerReceipt).toHaveTextContent("QTY");
    expect(customerReceipt).toHaveTextContent("ITEM");
    expect(customerReceipt).toHaveTextContent("PCS");
    expect(customerReceipt).toHaveTextContent("UNIT PRICE");
    expect(customerReceipt).toHaveTextContent("TOTAL PRICE");

    expect(screen.queryByText("PRIVATE / INTERNAL NOTE")).not.toBeInTheDocument();
    expect(screen.queryByText("Company internal note")).not.toBeInTheDocument();

    const receipt = customerReceipt;
    expect(receipt).toHaveStyle({
      "--receipt-primary": "#123456",
      "--receipt-accent": "#654321",
      "--receipt-background": "#f5f5f5",
      "--receipt-text": "#222222",
    });
  });

  it("renders the company receipt with the internal note and without customer contact details", async () => {
    mockedInvoicesApi.getCompanyReceipt.mockResolvedValue({
      receiptType: "COMPANY",
      invoiceNumber: "INV-00001",
      orderNumber: "00001",
      companyName: "Test Laundry",
      companyPhone: "08000000000",
      companyEmail: "test@laundry.com",
      companyWebsite: "https://laundry.test",
      companyAddress: "Test Address",
      customerName: "John Doe",
      branchName: "Main Branch",
      createdAt: "2026-09-01T10:00:00.000Z",
      items: [],
      totalAmount: 10000,
      garmentNote: null,
      internalNote: "Company internal note",
    });

    renderPage();
    await selectInvoice();

    screen.getByRole("button", { name: "Print Company Copy (Ctrl+F1)" }).click();

    expect(await screen.findByText("LAUNDRY RECEIPT — COMPANY COPY")).toBeInTheDocument();
    expect(screen.getByText("Company internal note")).toBeInTheDocument();
    expect(screen.getByText("PRIVATE / INTERNAL NOTE")).toBeInTheDocument();
    expect(screen.getByText("COMPANY COPY — INTERNAL RECORD")).toBeInTheDocument();

    expect(screen.getByText("Test Laundry")).toBeInTheDocument();
    expect(screen.getByText("08000000000")).toBeInTheDocument();
    expect(screen.getByText("test@laundry.com")).toBeInTheDocument();
    expect(screen.getByText("Test Address")).toBeInTheDocument();

    expect(screen.queryByText("Customer phone")).not.toBeInTheDocument();
    expect(screen.queryByText("Customer email")).not.toBeInTheDocument();
    expect(screen.queryByText("Customer address")).not.toBeInTheDocument();
  });

  it("uses business initials when no logo is configured", async () => {
    mockedBusinessesApi.getBusinessBranding.mockResolvedValue({
      id: "business-1",
      name: "Test Laundry",
      phone: null,
      email: null,
      website: null,
      address: null,
      logoUrl: null,
      receiptPrimaryColor: null,
      receiptAccentColor: null,
      receiptBackgroundColor: null,
      receiptTextColor: null,
      receiptHeaderStyle: "standard",
    });

    renderPage();
    await selectInvoice();

    screen.getByRole("button", { name: "Print Customer Copy (F1)" }).click();

    expect(await screen.findByText("TL")).toBeInTheDocument();
    expect(screen.queryByAltText("Test Laundry logo")).not.toBeInTheDocument();
  });

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

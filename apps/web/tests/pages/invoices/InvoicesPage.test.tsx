import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { SensitiveAuthorizationProvider } from "../../../src/components/auth/SensitiveAuthorizationProvider.js";
import { InvoicesPage } from "../../../src/pages/invoices/InvoicesPage.js";
import { useAuthStore } from "../../../src/state/auth-store.js";
import * as invoicesApi from "../../../src/lib/invoices-api.js";
import * as businessesApi from "../../../src/lib/businesses-api.js";
import * as customersApi from "../../../src/lib/customers-api.js";
import * as servicesApi from "../../../src/lib/services-api.js";

vi.mock("../../../src/lib/invoices-api.js");
vi.mock("../../../src/lib/businesses-api.js");
vi.mock("../../../src/lib/customers-api.js");
vi.mock("../../../src/lib/services-api.js");

const mockedInvoicesApi = vi.mocked(invoicesApi);
const mockedBusinessesApi = vi.mocked(businessesApi);
const mockedCustomersApi = vi.mocked(customersApi);
const mockedServicesApi = vi.mocked(servicesApi);

function renderPage(
  permissions: string[] = [
    "invoices.view",
    "invoices.manage",
  ],
) {
  useAuthStore.setState({
    user: {
      id: "user-1",
      email: "test@example.com",
      fullName: "Test User",
      role: "BUSINESS_OWNER",
      businessId: "business-1",
      branches: [{ id: "branch-1", name: "Main Branch" }],
      permissions,
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
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <SensitiveAuthorizationProvider>
          <InvoicesPage />
        </SensitiveAuthorizationProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const invoiceItem = {
  id: "item-1",
  invoiceId: "invoice-1",
  itemName: "Shirt",
  colors: ["Blue"],
  piecesPerUnit: 1,
  quantity: 2,
  totalPieces: 2,
  unitPrice: 5000,
  totalPrice: 10000,
  createdAt: "2026-09-01T10:00:00.000Z",
};

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
  subtotal: 10000,
  adjustedSubtotal: 10000,
  adjustmentTotal: 0,
  additiveTaxTotal: 0,
  withholdingTaxTotal: 0,
  appliedAdjustments: [],
  appliedTaxes: [],
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
  items: [invoiceItem],
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

  mockedServicesApi.listPricingRules.mockResolvedValue({
    adjustments: [],
    taxes: [],
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

  mockedInvoicesApi.updateInvoice.mockResolvedValue(invoice);
  mockedInvoicesApi.transferInvoice.mockResolvedValue(invoice);
  mockedInvoicesApi.voidInvoice.mockResolvedValue({
    ...invoice,
    status: "VOID",
  });
  mockedInvoicesApi.deleteInvoice.mockResolvedValue({
    ...invoice,
    status: "VOID",
  });
  mockedInvoicesApi.getInvoiceHistory.mockResolvedValue([
    {
      id: "history-1",
      invoiceId: "invoice-1",
      businessId: "business-1",
      branchId: "branch-1",
      action: "EDITED",
      version: 1,
      reason: "Entered incorrectly and corrected.",
      actorUserId: "user-1",
      snapshot: {
        id: "invoice-1",
        invoiceNumber: "INV-00001",
        customerName: "John Doe",
        totalAmount: 10000,
        items: [
          {
            itemName: "Shirt",
            colors: ["Blue"],
            quantity: 2,
          },
        ],
      },
      expiresAt: "2026-10-31T10:00:00.000Z",
      createdAt: "2026-09-01T10:00:00.000Z",
    },
  ]);

  mockedCustomersApi.listCustomers.mockResolvedValue({
    data: [
      {
        id: "customer-2",
        businessId: "business-1",
        name: "Mary Customer",
        phone: "08011111111",
        email: null,
        address: null,
        title: null,
        whatsapp: null,
        isActive: true,
        createdAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-01T10:00:00.000Z",
      },
    ],
    pagination: {
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    },
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
    items: [],
    subtotal: 10000,
    adjustedSubtotal: 10000,
    adjustmentTotal: 0,
    additiveTaxTotal: 0,
    withholdingTaxTotal: 0,
    appliedAdjustments: [],
    appliedTaxes: [],
    totalAmount: 10000,
    totalPaid: 0,
    balanceDue: 10000,
    payments: [],
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
    totalPaid: 0,
    balanceDue: 10000,
    payments: [],
    garmentNote: null,
    internalNote: null,
  });
});

describe("InvoicesPage invoice correction workflow", () => {
  it("keeps invoice search available when the invoice list is collapsed", async () => {
    renderPage();
    await screen.findByText("INV-00001");

    const summary = screen.getByText(/Invoice list/);
    const details = summary.closest("details");
    expect(details).not.toBeNull();
    fireEvent.click(summary);
    expect(details?.open).toBe(false);

    const search = screen.getByLabelText("Search invoices");
    fireEvent.change(search, { target: { value: "00001" } });

    await waitFor(() => {
      expect(mockedInvoicesApi.listInvoices).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "00001" }),
        { accessToken: "token" },
        "branch-1",
      );
    });
    expect(search).toBeVisible();
    expect(details?.open).toBe(false);
  });

  async function selectInvoice() {
    expect(await screen.findByText("INV-00001")).toBeInTheDocument();

    fireEvent.click(screen.getByText("INV-00001"));

    await waitFor(() => {
      expect(mockedInvoicesApi.getInvoice).toHaveBeenCalledWith(
        "invoice-1",
        { accessToken: "token" },
        "branch-1",
      );
    });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Invoice INV-00001" }),
      ).toBeInTheDocument();
    });
  }

  it("shows the financial breakdown and payment history in the on-screen invoice", async () => {
    mockedInvoicesApi.getInvoice.mockResolvedValue({
      ...invoice,
      subtotal: 10000,
      adjustedSubtotal: 9000,
      adjustmentTotal: -1000,
      additiveTaxTotal: 675,
      withholdingTaxTotal: 0,
      appliedAdjustments: [{
        id: "special-customer",
        name: "Special customer",
        percentage: -10,
        amount: -1000,
        scope: "INVOICE",
      }],
      appliedTaxes: [{
        id: "vat",
        name: "VAT",
        kind: "PERCENTAGE",
        value: 7.5,
        treatment: "ADDITIVE",
        amount: 675,
      }],
      totalAmount: 9675,
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
      items: [],
      subtotal: 10000,
      adjustedSubtotal: 9000,
      adjustmentTotal: -1000,
      additiveTaxTotal: 675,
      withholdingTaxTotal: 0,
      appliedAdjustments: [{
        id: "special-customer",
        name: "Special customer",
        percentage: -10,
        amount: -1000,
        scope: "INVOICE",
      }],
      appliedTaxes: [{
        id: "vat",
        name: "VAT",
        kind: "PERCENTAGE",
        value: 7.5,
        treatment: "ADDITIVE",
        amount: 675,
      }],
      totalAmount: 9675,
      totalPaid: 2500,
      balanceDue: 7175,
      payments: [{
        id: "payment-1",
        amount: 2500,
        method: "TRANSFER",
        type: "PAYMENT",
        reference: "BANK-REF-1",
        createdAt: "2026-09-01T11:00:00.000Z",
      }],
      garmentNote: null,
      customerAgreement: "Customer agreement",
    });

    renderPage(["invoices.view", "invoices.manage", "payments.view"]);
    await selectInvoice();

    // Garment colours must survive the order-to-invoice snapshot and remain visible on screen.
    expect(screen.getByText("Blue")).toBeInTheDocument();

    const financialBreakdown = screen.getByRole("region", { name: "Invoice financial breakdown" });
    expect(within(financialBreakdown).getByText("Service subtotal")).toBeInTheDocument();
    expect(within(financialBreakdown).getByText("Special customer (-10%)")).toBeInTheDocument();
    expect(within(financialBreakdown).getByText("Adjusted taxable amount")).toBeInTheDocument();
    expect(within(financialBreakdown).getByText((_, element) =>
      element?.tagName === "SPAN" && element.textContent?.replace(/\s+/g, " ").trim() === "VAT (7.5%) · Added",
    )).toBeInTheDocument();
    expect(within(financialBreakdown).getByText("Total pieces")).toBeInTheDocument();

    const paymentHistory = screen.getByRole("region", { name: "Invoice payment history" });
    expect(within(paymentHistory).getByText("Payment history")).toBeInTheDocument();
    expect(within(paymentHistory).getByText("BANK-REF-1")).toBeInTheDocument();
    expect(within(paymentHistory).getByText("Amount paid")).toBeInTheDocument();
    expect(within(paymentHistory).getByText("Balance due")).toBeInTheDocument();
  });

  it("shows only manual choices and already-applied automatic discounts during invoice repricing", async () => {
    mockedInvoicesApi.getInvoice.mockResolvedValue({
      ...invoice,
      appliedAdjustments: [{
        id: "existing-vip",
        name: "Existing VIP discount",
        percentage: -10,
        amount: -1000,
        scope: "INVOICE",
      }],
    });
    mockedServicesApi.listPricingRules.mockResolvedValue({
      adjustments: [
        {
          id: "existing-vip",
          name: "Existing VIP discount",
          percentage: -10,
          isActive: false,
          targetScope: "CUSTOMER",
          customerId: "customer-1",
          groupId: null,
          startsAt: null,
          endsAt: null,
          allowStacking: false,
          excludedServiceIds: [],
          customer: null,
          group: null,
        },
        {
          id: "unrelated-vip",
          name: "Another customer's VIP discount",
          percentage: -15,
          isActive: true,
          targetScope: "CUSTOMER",
          customerId: "customer-2",
          groupId: null,
          startsAt: null,
          endsAt: null,
          allowStacking: false,
          excludedServiceIds: [],
          customer: null,
          group: null,
        },
        {
          id: "manual-courtesy",
          name: "Courtesy adjustment",
          percentage: -5,
          isActive: true,
          targetScope: "MANUAL",
          customerId: null,
          groupId: null,
          startsAt: null,
          endsAt: null,
          allowStacking: false,
          excludedServiceIds: [],
          customer: null,
          group: null,
        },
      ],
      taxes: [],
    });

    renderPage();
    await selectInvoice();
    fireEvent.click(screen.getByRole("button", { name: "Adjust Discounts & Taxes" }));

    const correction = await screen.findByRole("region", { name: "Adjust invoice discounts and taxes" });
    expect(within(correction).getByText(/Courtesy adjustment/)).toBeInTheDocument();
    expect(within(correction).getByText(/Existing VIP discount/)).toBeInTheDocument();
    expect(within(correction).queryByText("Another customer's VIP discount")).not.toBeInTheDocument();
    expect(within(correction).getByLabelText(/Existing VIP discount/)).toBeChecked();
    expect(within(correction).getByLabelText(/Courtesy adjustment/)).not.toBeChecked();
  });

  it("shows correction controls with invoices.manage permission", async () => {
    renderPage();
    await selectInvoice();

    expect(
      screen.getByRole("button", { name: "Edit Invoice" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Transfer Invoice" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Void Invoice" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete Invoice" }),
    ).toBeInTheDocument();
  });

  it("shows correction history with invoices.view even without invoices.manage", async () => {
    renderPage(["invoices.view"]);
    await selectInvoice();

    expect(
      screen.getByRole("button", { name: "Edited History" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit Invoice" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Transfer Invoice" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Void Invoice" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete Invoice" }),
    ).not.toBeInTheDocument();
  });

  it("requires a reason and confirmation before editing", async () => {
    renderPage();
    await selectInvoice();

    fireEvent.click(
      screen.getByRole("button", { name: "Edit Invoice" }),
    );

    expect(
      screen.getByRole("button", { name: "Confirm Edit" }),
    ).toBeDisabled();

    fireEvent.change(
      screen.getByLabelText("Reason for this edit"),
      { target: { value: "Entered on the wrong account." } },
    );

    expect(
      screen.getByRole("button", { name: "Confirm Edit" }),
    ).toBeDisabled();

    fireEvent.click(
      screen.getByLabelText(
        "I confirm that I want to perform this invoice edit.",
      ),
    );

    expect(
      screen.getByRole("button", { name: "Confirm Edit" }),
    ).toBeEnabled();
  });

  it("submits an invoice edit with reason, confirmation and edited items", async () => {
    renderPage();
    await selectInvoice();

    fireEvent.click(
      screen.getByRole("button", { name: "Edit Invoice" }),
    );

    fireEvent.change(screen.getByLabelText("Item 1 name"), {
      target: { value: "Trousers" },
    });

    fireEvent.change(screen.getByLabelText("Item 1 colours"), {
      target: { value: "Black, Grey" },
    });

    fireEvent.change(
      screen.getByLabelText("Reason for this edit"),
      { target: { value: "Entered on the wrong item." } },
    );

    fireEvent.click(
      screen.getByLabelText(
        "I confirm that I want to perform this invoice edit.",
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Confirm Edit" }),
    );

    await waitFor(() => {
      expect(mockedInvoicesApi.updateInvoice).toHaveBeenCalledWith(
        "invoice-1",
        expect.objectContaining({
          reason: "Entered on the wrong item.",
          confirmed: true,
          items: [
            expect.objectContaining({
              itemName: "Trousers",
              colors: ["Black", "Grey"],
              piecesPerUnit: 1,
              quantity: 2,
              unitPrice: 5000,
            }),
          ],
        }),
        { accessToken: "token" },
        "branch-1",
      );
    });
  });

  it("transfers an invoice while retaining its invoice number", async () => {
    renderPage();
    await selectInvoice();

    fireEvent.click(
      screen.getByRole("button", { name: "Transfer Invoice" }),
    );

    const transferDialog = screen.getByRole("dialog", {
      name: "Correct invoice INV-00001",
    });

    expect(transferDialog).toHaveTextContent(
      "Invoice number INV-00001 will be retained.",
    );

    await waitFor(() => {
      expect(mockedCustomersApi.listCustomers).toHaveBeenCalled();
      expect(
        within(transferDialog).getByRole("option", {
          name: "Mary Customer — 08011111111",
        }),
      ).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const customerSearch = within(transferDialog).getByPlaceholderText("Search by customer name, phone, email or order number");
    await user.type(customerSearch, "00005");
    await waitFor(() => {
      expect(mockedCustomersApi.listCustomers).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "00005", pageSize: 100 }),
        { accessToken: "token" },
      );
    });

    const targetCustomerSelect = within(transferDialog).getByRole(
      "combobox",
    );

    await user.selectOptions(targetCustomerSelect, "customer-2");

    expect(targetCustomerSelect).toHaveValue("customer-2");

    const reasonInput = within(transferDialog).getByLabelText(
      "Reason for this edit",
    );

    await user.clear(reasonInput);
    await user.type(
      reasonInput,
      "It was entered on a wrong customer account.",
    );

    const confirmationCheckbox = within(transferDialog).getByRole(
      "checkbox",
    );

    await user.click(confirmationCheckbox);

    expect(confirmationCheckbox).toBeChecked();

    const confirmButton = within(transferDialog).getByRole("button", {
      name: "Confirm Edit",
    });

    expect(confirmButton).not.toBeDisabled();

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockedInvoicesApi.transferInvoice).toHaveBeenCalledWith(
        "invoice-1",
        {
          customerId: "customer-2",
          reason: "It was entered on a wrong customer account.",
          confirmed: true,
        },
        { accessToken: "token" },
        "branch-1",
      );
    });
  });

  it("submits a void only after reason and confirmation", async () => {
    renderPage();
    await selectInvoice();

    fireEvent.click(
      screen.getByRole("button", { name: "Void Invoice" }),
    );

    fireEvent.change(
      screen.getByLabelText("Reason for this edit"),
      { target: { value: "Duplicate invoice." } },
    );

    fireEvent.click(
      screen.getByLabelText(
        "I confirm that I want to perform this invoice edit.",
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Confirm Edit" }),
    );

    await waitFor(() => {
      expect(mockedInvoicesApi.voidInvoice).toHaveBeenCalledWith(
        "invoice-1",
        {
          reason: "Duplicate invoice.",
          confirmed: true,
        },
        { accessToken: "token" },
        "branch-1",
      );
    });
  });

  it("submits a logical delete only after reason and confirmation", async () => {
    renderPage();
    await selectInvoice();

    fireEvent.click(
      screen.getByRole("button", { name: "Delete Invoice" }),
    );

    expect(
      screen.getByText(
        /Delete removes this invoice from active use/,
      ),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText("Reason for this edit"),
      { target: { value: "Invoice was created in error." } },
    );

    fireEvent.click(
      screen.getByLabelText(
        "I confirm that I want to perform this invoice edit.",
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Confirm Edit" }),
    );

    await waitFor(() => {
      expect(mockedInvoicesApi.deleteInvoice).toHaveBeenCalledWith(
        "invoice-1",
        {
          reason: "Invoice was created in error.",
          confirmed: true,
        },
        { accessToken: "token" },
        "branch-1",
      );
    });
  });

  it("loads correction history and exposes the complete snapshot", async () => {
    renderPage();
    await selectInvoice();

    fireEvent.click(
      screen.getByRole("button", { name: "Edited History" }),
    );

    expect(
      await screen.findByText("Edited History — INV-00001"),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Complete invoice snapshots are retained for 60 days from each correction.",
      ),
    ).toBeInTheDocument();

    expect(
      await screen.findByText("Entered incorrectly and corrected."),
    ).toBeInTheDocument();

    const snapshotToggle = screen.getByText(
      "View Snapshot — Version 1",
    );

    expect(snapshotToggle).toBeInTheDocument();

    fireEvent.click(snapshotToggle);

    expect(
      screen.getByText(/"invoiceNumber": "INV-00001"/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/"customerName": "John Doe"/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/"itemName": "Shirt"/),
    ).toBeInTheDocument();
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
      totalPaid: 2500,
      balanceDue: 2500,
      payments: [{
        id: "payment-1",
        amount: 2500,
        method: "TRANSFER",
        type: "PAYMENT",
        reference: "BANK-REF-1",
        createdAt: "2026-09-01T11:00:00.000Z",
      }],
      garmentNote: "Handle with care",
      customerAgreement: "Customer agreement",
    });

    renderPage();
    await selectInvoice();

    screen.getByRole("button", { name: "Print Customer Copy (FN+F1)" }).click();

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
    expect(customerReceipt).toHaveTextContent("ITEM / COLORS");
    expect(customerReceipt).toHaveTextContent("RATE / PC");
    expect(customerReceipt).toHaveTextContent("AMOUNT");
    expect(customerReceipt).toHaveTextContent("TOTAL PCS");
    expect(customerReceipt).toHaveTextContent("TOTAL AMOUNT");
    expect(customerReceipt).toHaveTextContent("PAYMENT HISTORY");
    expect(customerReceipt).toHaveTextContent("Bank transfer");
    expect(customerReceipt).toHaveTextContent("BANK-REF-1");
    expect(customerReceipt).toHaveTextContent("AMOUNT PAID");
    expect(customerReceipt).toHaveTextContent("BALANCE DUE");
    expect(customerReceipt).toHaveTextContent("₦2,500");
    expect(customerReceipt).toHaveTextContent("₦5,000");
    expect(customerReceipt).not.toHaveTextContent("UNIT PRICE");
    expect(customerReceipt).not.toHaveTextContent("TOTAL PRICE");

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

  it("clearly marks a fully paid customer receipt in deep green", async () => {
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
      subtotal: 5000,
      adjustedSubtotal: 5000,
      adjustmentTotal: 0,
      additiveTaxTotal: 0,
      withholdingTaxTotal: 0,
      appliedAdjustments: [],
      appliedTaxes: [],
      totalAmount: 5000,
      totalPaid: 5000,
      balanceDue: 0,
      payments: [{
        id: "payment-paid",
        amount: 5000,
        method: "CASH",
        type: "PAYMENT",
        reference: null,
        createdAt: "2026-09-01T11:00:00.000Z",
      }],
      garmentNote: null,
      customerAgreement: "Customer agreement",
    });

    renderPage();
    await selectInvoice();
    screen.getByRole("button", { name: "Print Customer Copy (FN+F1)" }).click();

    await screen.findByText("LAUNDRY RECEIPT");
    const paidInFull = screen.getByText("PAID IN FULL");
    expect(paidInFull).toHaveTextContent("PAID IN FULL");
    expect(paidInFull).toHaveClass("receipt__paid-in-full");
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
      totalPaid: 0,
      balanceDue: 10000,
      payments: [],
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

    screen.getByRole("button", { name: "Print Customer Copy (FN+F1)" }).click();

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

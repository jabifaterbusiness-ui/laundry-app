import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CustomerDetailsPage } from "../../../src/pages/customers/CustomerDetailsPage.js";
import * as customerAccountApi from "../../../src/lib/customer-account-api.js";
import * as sensitiveAuthorization from "../../../src/components/auth/SensitiveAuthorizationProvider.js";

const mockAuthState = vi.hoisted(() => ({
  accessToken: "token",
  activeBranchId: "branch-1",
  user: {
    permissions: ["customer_accounts.view", "customer_accounts.manage"],
  },
}));

vi.mock("../../../src/state/auth-store.js", () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) =>
    selector(mockAuthState),
}));

vi.mock("../../../src/lib/customer-account-api.js");
vi.mock("../../../src/components/auth/SensitiveAuthorizationProvider.js");

vi.mock("../../../src/lib/customers-api.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/lib/customers-api.js")>(
    "../../../src/lib/customers-api.js",
  );
  return {
    ...actual,
    getCustomer: vi.fn(),
  };
});

import { getCustomer } from "../../../src/lib/customers-api.js";

const mockedCustomerAccountApi = vi.mocked(customerAccountApi);
const mockedSensitiveAuthorization = vi.mocked(sensitiveAuthorization);

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  mockedCustomerAccountApi.getCustomerAccount.mockResolvedValue({
    id: "account-1",
    customerId: "customer-1",
    businessId: "business-1",
    balance: 25000,
    transactions: [],
  });

  mockedCustomerAccountApi.fundCustomerAccount.mockResolvedValue({
    id: "tx-1",
    businessId: "business-1",
    customerAccountId: "account-1",
    branchId: "branch-1",
    type: "CREDIT",
    amount: 10000,
    invoiceId: null,
    note: "Customer POA",
    createdAt: "2026-10-01T10:00:00.000Z",
  });

  mockedSensitiveAuthorization.useSensitiveAuthorization.mockReturnValue({
    requestSensitiveAuthorization: vi
      .fn()
      .mockResolvedValue("sensitive-token"),
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/customers/customer-1"]}>
        <Routes>
          <Route path="/customers/:id" element={<CustomerDetailsPage />} />
          <Route path="/orders" element={<p>Orders page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CustomerDetailsPage", () => {
  it("loads customer details and provides Add New Order", async () => {
    vi.mocked(getCustomer).mockResolvedValue({
      id: "customer-1",
      name: "Jane Doe",
      phone: "08012345678",
      email: "jane@example.com",
      address: "Abuja",
      notes: "VIP",
      isActive: true,
      lifecycleStatus: "ACTIVE",
      statusReason: null,
      statusChangedAt: null,
      statusChangedById: null,
      createdAt: "",
      updatedAt: "",
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Jane Doe" })).toBeInTheDocument();
    expect(screen.getByText("08012345678")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add new order/i })).toBeInTheDocument();
  });

  it("opens the order workspace for the displayed customer", async () => {
    vi.mocked(getCustomer).mockResolvedValue({
      id: "customer-1",
      name: "Jane Doe",
      phone: "08012345678",
      email: null,
      address: null,
      notes: null,
      isActive: true,
      lifecycleStatus: "ACTIVE",
      statusReason: null,
      statusChangedAt: null,
      statusChangedById: null,
      createdAt: "",
      updatedAt: "",
    });

    renderPage();

    await screen.findByRole("heading", { name: "Jane Doe" });
    screen.getByRole("button", { name: /add new order/i }).click();

    await waitFor(() => {
      expect(screen.getByText("Orders page")).toBeInTheDocument();
    });
  });
});


describe("CustomerDetailsPage customer account", () => {
  it("shows the customer account balance and POA action", async () => {
    vi.mocked(getCustomer).mockResolvedValue({
      id: "customer-1",
      name: "Jane Doe",
      phone: "08012345678",
      email: null,
      address: null,
      notes: null,
      isActive: true,
      lifecycleStatus: "ACTIVE",
      statusReason: null,
      statusChangedAt: null,
      statusChangedById: null,
      createdAt: "",
      updatedAt: "",
    });

    renderPage();

    expect(
      await screen.findByText("₦25,000"),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: /put money on account/i,
      }),
    ).toBeInTheDocument();
  });

  it("funds the customer account after sensitive authorization", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();

    vi.mocked(getCustomer).mockResolvedValue({
      id: "customer-1",
      name: "Jane Doe",
      phone: "08012345678",
      email: null,
      address: null,
      notes: null,
      isActive: true,
      lifecycleStatus: "ACTIVE",
      statusReason: null,
      statusChangedAt: null,
      statusChangedById: null,
      createdAt: "",
      updatedAt: "",
    });

    renderPage();

    await screen.findByRole("heading", { name: "Jane Doe" });

    await user.click(
      screen.getByRole("button", {
        name: /put money on account/i,
      }),
    );

    await user.type(
      screen.getByLabelText("Amount"),
      "10000",
    );

    await user.type(
      screen.getByLabelText("Note"),
      "Customer POA",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Fund Account",
      }),
    );

    await waitFor(() => {
      expect(
        mockedCustomerAccountApi.fundCustomerAccount,
      ).toHaveBeenCalledWith(
        "customer-1",
        {
          amount: 10000,
          note: "Customer POA",
        },
        {
          accessToken: "token",
          sensitiveAuthorization: "sensitive-token",
        },
        "branch-1",
      );
    });
  });

  it("does not load customer account without view permission", async () => {
    vi.mocked(getCustomer).mockResolvedValue({
      id: "customer-1",
      name: "Jane Doe",
      phone: "08012345678",
      email: null,
      address: null,
      notes: null,
      isActive: true,
      lifecycleStatus: "ACTIVE",
      statusReason: null,
      statusChangedAt: null,
      statusChangedById: null,
      createdAt: "",
      updatedAt: "",
    });

    mockAuthState.user.permissions = ["customer_accounts.manage"];
    mockedCustomerAccountApi.getCustomerAccount.mockClear();

    renderPage();

    await screen.findByRole("heading", { name: "Jane Doe" });

    expect(
      mockedCustomerAccountApi.getCustomerAccount,
    ).not.toHaveBeenCalled();

    expect(
      screen.queryByText("₦25,000"),
    ).not.toBeInTheDocument();

    mockAuthState.user.permissions = [
      "customer_accounts.view",
      "customer_accounts.manage",
    ];
  });

  it("does not show POA without manage permission", async () => {
    vi.mocked(getCustomer).mockResolvedValue({
      id: "customer-1",
      name: "Jane Doe",
      phone: "08012345678",
      email: null,
      address: null,
      notes: null,
      isActive: true,
      lifecycleStatus: "ACTIVE",
      statusReason: null,
      statusChangedAt: null,
      statusChangedById: null,
      createdAt: "",
      updatedAt: "",
    });

    mockAuthState.user.permissions = ["customer_accounts.view"];

    renderPage();

    expect(
      await screen.findByText("₦25,000"),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: /put money on account/i,
      }),
    ).not.toBeInTheDocument();

    mockAuthState.user.permissions = [
      "customer_accounts.view",
      "customer_accounts.manage",
    ];
  });

});

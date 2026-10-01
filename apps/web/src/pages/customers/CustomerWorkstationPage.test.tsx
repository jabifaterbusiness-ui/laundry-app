import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCustomer,
  listCustomers,
} from "../../lib/customers-api.js";
import { getCustomerAccount } from "../../lib/customer-account-api.js";
import { hasPermission } from "../../lib/permissions.js";
import { SensitiveAuthorizationProvider } from "../../components/auth/SensitiveAuthorizationProvider.js";
import { CustomerWorkstationPage } from "./CustomerWorkstationPage.js";

vi.mock("../../lib/customers-api.js", () => ({
  getCustomer: vi.fn(),
  listCustomers: vi.fn(),
}));

vi.mock("../../lib/customer-account-api.js", () => ({
  getCustomerAccount: vi.fn(),
}));

vi.mock("../../state/auth-store.js", () => ({
  useAuthStore: (selector: (state: {
    user: {
      id: string;
      businessId: string;
      fullName: string;
      role: string;
      securityRole?: string;
    };
    accessToken: string;
  }) => unknown) =>
    selector({
      user: {
        id: "owner-1",
        businessId: "business-1",
        fullName: "Jane Owner",
        role: "BUSINESS_OWNER",
        securityRole: "BUSINESS_OWNER",
      },
      accessToken: "token",
    }),
}));

vi.mock("../../lib/permissions.js", () => ({
  hasPermission: vi.fn(() => true),
}));

const mockedGetCustomer = vi.mocked(getCustomer);
const mockedListCustomers = vi.mocked(listCustomers);
const mockedGetCustomerAccount = vi.mocked(getCustomerAccount);
const mockedHasPermission = vi.mocked(hasPermission);

const customer = {
  id: "customer-1",
  name: "John Customer",
  phone: "08012345678",
  email: "john@example.com",
  address: "Abuja",
  notes: null,
  isActive: true,
  lifecycleStatus: "ACTIVE" as const,
  statusReason: null,
  statusChangedAt: null,
  statusChangedById: null,
  createdAt: "2026-10-01T08:00:00.000Z",
  updatedAt: "2026-10-01T08:00:00.000Z",
};

const account = {
  id: "account-1",
  customerId: "customer-1",
  businessId: "business-1",
  balance: 25000,
  transactions: [],
};

function renderWorkstation(
  initialEntries: string[] = ["/customer-workstation"],
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <SensitiveAuthorizationProvider>
          <CustomerWorkstationPage />
        </SensitiveAuthorizationProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedHasPermission.mockImplementation(() => true);

  mockedGetCustomer.mockResolvedValue(customer);

  mockedListCustomers.mockResolvedValue({
    data: [customer],
    pagination: {
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    },
  });

  mockedGetCustomerAccount.mockResolvedValue(account);
});

describe("CustomerWorkstationPage", () => {
  it("renders customer search results", async () => {
    renderWorkstation();

    expect(
      await screen.findByRole("button", {
        name: /john customer/i,
      }),
    ).toBeInTheDocument();

    expect(screen.getByText("08012345678")).toBeInTheDocument();
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
  });

  it("opens the customer from the customerId URL parameter", async () => {
    renderWorkstation(["/customer-workstation?customerId=customer-1"]);

    expect(
      await screen.findByRole("heading", {
        name: "John Customer",
      }),
    ).toBeInTheDocument();

    expect(mockedGetCustomer).toHaveBeenCalledWith(
      "customer-1",
      { accessToken: "token" },
    );
  });

  it("opens the selected customer workspace and loads the account balance", async () => {
    renderWorkstation();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /john customer/i,
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "John Customer",
      }),
    ).toBeInTheDocument();

    expect(await screen.findByText("₦25,000")).toBeInTheDocument();

    expect(mockedGetCustomerAccount).toHaveBeenCalledWith(
      "customer-1",
      { accessToken: "token" },
    );
  });

  it("shows the first-day timeline navigation when activity exists", async () => {
    renderWorkstation();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /john customer/i,
      }),
    );

    expect(
      await screen.findByRole("button", {
        name: "Jump to first day",
      }),
    ).toBeInTheDocument();

    expect(screen.getByText("Customer joined")).toBeInTheDocument();
  });

  it("hides actions when the user lacks the required permissions", async () => {
    mockedHasPermission.mockImplementation((_user, permission) => {
      return ![
        "orders.create",
        "customer_accounts.manage",
      ].includes(permission);
    });

    renderWorkstation();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /john customer/i,
      }),
    );

    expect(
      screen.queryByRole("button", {
        name: "Add New Order",
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: "POA / Put Money on Account",
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Customer Details",
      }),
    ).toBeInTheDocument();
  });

  it("shows customer workspace actions for an authorized user", async () => {
    renderWorkstation();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /john customer/i,
      }),
    );

    expect(
      await screen.findByRole("button", {
        name: "Add New Order",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Customer Details",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "POA / Put Money on Account",
      }),
    ).toBeInTheDocument();
  });
});

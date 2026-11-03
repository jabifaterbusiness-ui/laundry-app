import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Customer, Order } from "@laundry-app/shared";
import { OrderManagementPage } from "../../../src/pages/orders/OrderManagementPage.js";
import { useAuthStore } from "../../../src/state/auth-store.js";

const { getOrderMock, getCustomerMock, requestAuthorizationMock } = vi.hoisted(() => ({
  getOrderMock: vi.fn(),
  getCustomerMock: vi.fn(),
  requestAuthorizationMock: vi.fn(),
}));

vi.mock("../../../src/lib/orders-api.js", () => ({ getOrder: getOrderMock }));
vi.mock("../../../src/lib/customers-api.js", () => ({ getCustomer: getCustomerMock }));
vi.mock("../../../src/components/auth/SensitiveAuthorizationProvider.js", () => ({
  useSensitiveAuthorization: () => ({
    requestSensitiveAuthorization: requestAuthorizationMock,
  }),
}));
vi.mock("../../../src/pages/orders/OrderManagement.js", () => ({
  OrderManagement: ({ order, customer }: { order: Order; customer: Customer }) => (
    <section aria-label="Order Management">
      <h2>Order #{order.orderNumber}</h2>
      <p>{customer.name}</p>
    </section>
  ),
}));

const customer: Customer = {
  id: "customer-5",
  name: "Aaron Daniel",
  phone: "08059489393",
  email: "aaron@example.com",
  address: null,
  notes: null,
  isActive: true,
  lifecycleStatus: "ACTIVE",
  statusReason: null,
  statusChangedAt: null,
  statusChangedById: null,
  createdAt: "",
  updatedAt: "",
};

const order: Order = {
  id: "order-5",
  businessId: "business-a",
  branchId: "branch-a",
  customerId: customer.id,
  orderNumber: "00005",
  status: "RECEIVED",
  orderTotal: 5000,
  expectedReadyAt: null,
  readyAt: null,
  completedAt: null,
  cancelledAt: null,
  garmentNote: null,
  internalNote: null,
  items: [],
  createdAt: "",
  updatedAt: "",
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/order-management?orderId=${order.id}`]}>
        <OrderManagementPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OrderManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      accessToken: "test-token",
      activeBranchId: "branch-a",
    } as never);
    getOrderMock.mockResolvedValue(order);
    getCustomerMock.mockResolvedValue(customer);
    requestAuthorizationMock.mockResolvedValue("sensitive-token");
  });

  it("authorizes and opens the exact requested order in its independent workspace", async () => {
    renderPage();

    await waitFor(() => {
      expect(getOrderMock).toHaveBeenCalledWith(
        order.id,
        { accessToken: "test-token" },
        "branch-a",
      );
      expect(getCustomerMock).toHaveBeenCalledWith(
        customer.id,
        { accessToken: "test-token" },
      );
      expect(requestAuthorizationMock).toHaveBeenCalledOnce();
    });

    expect(await screen.findByRole("region", { name: "Order Management" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Order #00005" })).toBeInTheDocument();
    expect(screen.getByText("Aaron Daniel")).toBeInTheDocument();
  });

  it("does not fetch order or customer details until password authorization succeeds", async () => {
    let authorize!: (token: string | null) => void;
    requestAuthorizationMock.mockImplementation(
      () => new Promise<string | null>((resolve) => { authorize = resolve; }),
    );

    renderPage();
    await waitFor(() => expect(requestAuthorizationMock).toHaveBeenCalledOnce());

    expect(getOrderMock).not.toHaveBeenCalled();
    expect(getCustomerMock).not.toHaveBeenCalled();

    authorize("sensitive-token");
    await waitFor(() => expect(getOrderMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(getCustomerMock).toHaveBeenCalledOnce());
  });

  it("does not render an order list inside the standalone workspace", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Order Management" });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import type { Customer, Order } from "@laundry-app/shared";
import { SensitiveAuthorizationProvider } from "../../../src/components/auth/SensitiveAuthorizationProvider.js";
import { OrdersPage } from "../../../src/pages/orders/OrdersPage.js";
import { useAuthStore } from "../../../src/state/auth-store.js";
import { useOrderWorkspaceStore } from "../../../src/state/order-workspace-store.js";

const customerA: Customer = {
  id: "customer-a",
  name: "Jane Doe",
  phone: "08000000001",
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
};

const customerB: Customer = {
  id: "customer-b",
  name: "John Doe",
  phone: "08000000002",
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
};

const customerC: Customer = {
  id: "customer-c",
  name: "Mary Doe",
  phone: "08000000003",
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
};

const serviceA = {
  id: "service-a",
  name: "Complete Agbada",
  pieces: 3,
  unitPrice: 4500,
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

const serviceB = {
  id: "service-b",
  name: "Shirt",
  pieces: 1,
  unitPrice: 1500,
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

const colorBlack = {
  id: "color-black",
  businessId: "business-a",
  name: "Black",
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

const colorWhite = {
  id: "color-white",
  businessId: "business-a",
  name: "White",
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

const colorRoyalBlue = {
  id: "color-royal-blue",
  businessId: "business-a",
  name: "Royal Blue",
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

const orderA: Order = {
  id: "order-a",
  businessId: "business-a",
  branchId: "branch-a",
  customerId: customerA.id,
  orderNumber: "00001",
  status: "RECEIVED",
  orderTotal: 4500,
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

vi.mock("../../../src/lib/orders-api.js", () => ({
  listOrders: vi.fn(),
  listAllOrders: vi.fn(),
  createOrderWithOfflineQueue: vi.fn(),
  updateOrderStatusWithOfflineQueue: vi.fn(),
  getOrder: vi.fn(),
}));

vi.mock("../../../src/lib/customers-api.js", () => ({
  createCustomerWithOfflineQueue: vi.fn(),
  getCustomer: vi.fn(),
  listCustomers: vi.fn(),
}));

vi.mock("../../../src/lib/services-api.js", () => ({
  listServices: vi.fn(),
  listPricingRules: vi.fn(),
  listCustomerServicePrices: vi.fn(),
}));

vi.mock("../../../src/lib/colors-api.js", () => ({
  listColors: vi.fn(),
  createColor: vi.fn(),
}));

import {
  createOrderWithOfflineQueue,
  getOrder,
  listAllOrders,
  listOrders,
} from "../../../src/lib/orders-api.js";
import {
  createCustomerWithOfflineQueue,
  getCustomer,
  listCustomers,
} from "../../../src/lib/customers-api.js";
import { listServices, listPricingRules, listCustomerServicePrices } from "../../../src/lib/services-api.js";
import {
  createColor,
  listColors,
} from "../../../src/lib/colors-api.js";

function CurrentLocation() {
  const location = useLocation();
  return <output data-testid="current-location">{location.pathname}{location.search}</output>;
}

function renderPage(initialEntries: string[] = ["/orders"]) {
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
          <CurrentLocation />
          <OrdersPage />
        </SensitiveAuthorizationProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function SearchNavigationHarness() {
  const navigate = useNavigate();

  return (
    <>
      <button type="button" onClick={() => navigate(`/orders?customerId=${customerB.id}`)}>
        Search customer B
      </button>
      <button type="button" onClick={() => navigate(`/orders?customerId=${customerA.id}`)}>
        Search customer A
      </button>
    </>
  );
}

function seedAuth() {
  useAuthStore.setState({
    user: {
      id: "user-a",
      businessId: "business-a",
      role: "STAFF",
      permissions: [
      "orders.create",
      "orders.change_status",
      "colors.view",
      "colors.manage",
    ],
      branches: [
        {
          id: "branch-a",
          name: "Main Branch",
        },
      ],
    } as never,
    accessToken: "test-token",
    refreshToken: "refresh-token",
    activeBranchId: "branch-a",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useOrderWorkspaceStore.getState().clearWorkspaces();

  seedAuth();

  vi.mocked(listCustomers).mockResolvedValue({
    data: [customerA, customerB, customerC],
    pagination: {
      page: 1,
      pageSize: 100,
      total: 3,
      totalPages: 1,
    },
  });

  vi.mocked(createCustomerWithOfflineQueue).mockResolvedValue({
    queued: false,
    customer: customerA,
  });


  vi.mocked(listPricingRules).mockResolvedValue({ adjustments: [], taxes: [] });
  vi.mocked(listCustomerServicePrices).mockResolvedValue({ data: [] });

  vi.mocked(listServices).mockResolvedValue({
    data: [serviceA, serviceB],
    pagination: {
      page: 1,
      pageSize: 25,
      total: 2,
      totalPages: 1,
    },
  });

  vi.mocked(listColors).mockResolvedValue({
    data: [colorBlack, colorWhite, colorRoyalBlue],
  });

  vi.mocked(createColor).mockResolvedValue({
    ...colorBlack,
    id: "color-new",
    name: "Emerald",
  });

  vi.mocked(listOrders).mockResolvedValue({
    data: [],
    pagination: {
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 1,
    },
  });

  vi.mocked(listAllOrders).mockResolvedValue([]);
  vi.mocked(listCustomerServicePrices).mockResolvedValue({ data: [] });

});

describe("OrdersPage colour selector", () => {
  async function openOrderColourSelector() {
    renderPage();

    await screen.findByText("No orders found.");

    fireEvent.click(
      screen.getByRole("button", {
        name: /^New order$/i,
      }),
    );

    await screen.findByRole("heading", {
      name: /find customer/i,
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(`^${customerA.name}(?:\\s|$)`, "i"),
      }),
    );

    await screen.findByRole("heading", {
      name: /new order/i,
    });

    const serviceSelect = screen.getAllByRole("combobox").find(
      (element) =>
        element instanceof HTMLSelectElement &&
        Array.from(element.options).some(
          (option) => option.value === serviceA.id,
        ),
    );

    if (!serviceSelect) {
      throw new Error("Service selector not found");
    }

    fireEvent.change(serviceSelect, {
      target: { value: serviceA.id },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Select colors for item 1",
      }),
    );
  }

  it("loads active catalogue colours into the order selector", async () => {
    await openOrderColourSelector();

    expect(
      await screen.findByLabelText("Search colours for item 1"),
    ).toBeInTheDocument();

    expect(screen.getByLabelText("Black")).toBeInTheDocument();
    expect(screen.getByLabelText("White")).toBeInTheDocument();
    expect(screen.getByLabelText("Royal Blue")).toBeInTheDocument();

    expect(vi.mocked(listColors)).toHaveBeenCalledWith(
      { status: "active" },
      { accessToken: "test-token" },
    );
  });

  it("searches the colour catalogue and supports multiple selections", async () => {
    await openOrderColourSelector();

    const search = await screen.findByLabelText(
      "Search colours for item 1",
    );

    fireEvent.change(search, {
      target: { value: "royal" },
    });

    expect(screen.getByLabelText("Royal Blue")).toBeInTheDocument();
    expect(screen.queryByLabelText("Black")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("White")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Royal Blue"));

    fireEvent.change(search, {
      target: { value: "" },
    });

    fireEvent.click(screen.getByLabelText("Black"));

    expect(
      screen.getByRole("button", {
        name: "Select colors for item 1",
      }),
    ).toHaveTextContent("Royal Blue, Black");
  });

  it("does not offer Add New Colour without colors.manage permission", async () => {
    useAuthStore.setState({
      user: {
        id: "user-a",
        businessId: "business-a",
        role: "STAFF",
        permissions: ["orders.create", "orders.change_status", "colors.view"],
        branches: [
          {
            id: "branch-a",
            name: "Main Branch",
          },
        ],
      } as never,
      accessToken: "test-token",
      refreshToken: "refresh-token",
      activeBranchId: "branch-a",
    });

    await openOrderColourSelector();

    expect(
      screen.queryByRole("button", {
        name: "+ Add New Colour",
      }),
    ).not.toBeInTheDocument();
  });

  it("allows an authorized user to add a colour and selects it on the current item", async () => {
    await openOrderColourSelector();

    const input = await screen.findByLabelText("New colour name");

    fireEvent.change(input, {
      target: { value: "Emerald" },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "+ Add New Colour",
      }),
    );

    await waitFor(() => {
      expect(vi.mocked(createColor)).toHaveBeenCalledWith(
        { name: "Emerald" },
        { accessToken: "test-token" },
      );
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Select colors for item 1",
        }),
      ).toHaveTextContent("Emerald");
    });
  });
});

describe("OrdersPage quick customer switching", () => {
  async function selectCustomerFromPicker(customer: Customer) {
    const pickerHeading = await screen.findByRole("heading", {
      name: /find customer/i,
    });

    const picker = pickerHeading.closest("section");

    if (!picker) {
      throw new Error("Customer picker section not found");
    }

    const button = within(picker).getByRole("button", {
      name: new RegExp(`^${customer.name}(?:\\s|$)`, "i"),
    });

    fireEvent.click(button);

    await screen.findByRole("heading", {
      name: /new order/i,
    });
  }

  async function openNewOrderForCustomer(customer: Customer) {
    fireEvent.click(
      screen.getByRole("button", {
        name: /^New order$/i,
      }),
    );

    await screen.findByRole("heading", {
      name: /find customer/i,
    });

    await selectCustomerFromPicker(customer);
  }

  it("opens a non-active customer from the customer details Add New Order flow", async () => {
    const dormantCustomer: Customer = {
      ...customerA,
      lifecycleStatus: "DORMANT",
      isActive: false,
      statusReason: "No orders for an extended period",
    };

    vi.mocked(getCustomer).mockResolvedValue(dormantCustomer);

    renderPage([`/orders?customerId=${dormantCustomer.id}`]);

    await waitFor(() => {
      expect(getCustomer).toHaveBeenCalledWith(
        dormantCustomer.id,
        { accessToken: "test-token" },
      );
    });

    expect(
      await screen.findByRole("heading", { name: /new order/i }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: /new order/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /Jane Doe\s+—\s+New order/i }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: /change customer/i,
      }),
    ).toBeInTheDocument();
  });

  it("switches back to an already-open customer workspace when the same search result is selected again", async () => {
    vi.mocked(getCustomer).mockImplementation(async (id: string) =>
      id === customerA.id ? customerA : customerB,
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/orders?customerId=${customerA.id}`]}>
          <SensitiveAuthorizationProvider>
            <SearchNavigationHarness />
            <OrdersPage />
          </SensitiveAuthorizationProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(useOrderWorkspaceStore.getState().activeWorkspaceId).toBe(
        `customer:${customerA.id}`,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Search customer B" }));
    await waitFor(() => {
      expect(useOrderWorkspaceStore.getState().activeWorkspaceId).toBe(
        `customer:${customerB.id}`,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Search customer A" }));
    await waitFor(() => {
      expect(useOrderWorkspaceStore.getState().activeWorkspaceId).toBe(
        `customer:${customerA.id}`,
      );
    });

    expect(useOrderWorkspaceStore.getState().workspaces).toHaveLength(2);
  });

  it("opens three customer workspaces", async () => {
    renderPage();

    await screen.findByText("No orders found.");

    await openNewOrderForCustomer(customerA);

    fireEvent.click(
      screen.getByRole("button", {
        name: /change customer/i,
      }),
    );
    await selectCustomerFromPicker(customerB);

    fireEvent.click(
      screen.getByRole("button", {
        name: /change customer/i,
      }),
    );
    await selectCustomerFromPicker(customerC);

    const state = useOrderWorkspaceStore.getState();

    expect(state.workspaces).toHaveLength(3);
    expect(state.workspaces.map((item) => item.customer.id)).toEqual([
      customerA.id,
      customerB.id,
      customerC.id,
    ]);
  });

  it("preserves unfinished order data when switching customers", async () => {
    renderPage();

    await screen.findByText("No orders found.");

    await openNewOrderForCustomer(customerA);

    fireEvent.change(
      screen.getByLabelText(/garment \/ customer note/i),
      {
        target: {
          value: "Jane's special garment instruction",
        },
      },
    );

    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "2" },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /change customer/i,
      }),
    );
    await selectCustomerFromPicker(customerB);

    expect(
      screen.getByLabelText(/garment \/ customer note/i),
    ).toHaveValue("");

    fireEvent.click(
      screen.getByRole("button", {
        name: /change customer/i,
      }),
    );
    await selectCustomerFromPicker(customerA);

    expect(
      screen.getByLabelText(/garment \/ customer note/i),
    ).toHaveValue("Jane's special garment instruction");

    expect(screen.getByRole("spinbutton")).toHaveValue(2);
  });

  it("keeps separate visible customer workspaces when changing customers", async () => {
    renderPage();

    await screen.findByText("No orders found.");

    await openNewOrderForCustomer(customerA);

    expect(
      screen.getByRole("button", { name: /Jane Doe\s+—\s+New order/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /new order/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /change customer/i,
      }),
    );

    await selectCustomerFromPicker(customerB);

    expect(
      screen.getByRole("button", { name: /John Doe\s+—\s+New order/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /new order/i }),
    ).toBeInTheDocument();

    const janeWorkspace = screen.getByRole("button", {
      name: /Jane Doe — New order/i,
    });

    const johnWorkspace = screen.getByRole("button", {
      name: /John Doe — New order/i,
    });

    expect(janeWorkspace).toBeInTheDocument();
    expect(johnWorkspace).toBeInTheDocument();

    expect(johnWorkspace).toHaveAttribute("aria-pressed", "true");
    expect(janeWorkspace).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(janeWorkspace);

    expect(
      screen.getByRole("heading", { name: /new order/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Jane Doe\s+—\s+New order/i }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: /Jane Doe — New order/i,
      }),
    ).toHaveAttribute("aria-pressed", "true");

    expect(
      screen.getByRole("button", {
        name: /John Doe — New order/i,
      }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("redirects legacy order deep links to the independent Order Management route", async () => {
    renderPage([`/orders?orderId=${orderA.id}`]);

    await waitFor(() => {
      expect(screen.getByTestId("current-location")).toHaveTextContent(
        `/order-management?orderId=${orderA.id}`,
      );
    });

    expect(screen.queryByRole("region", { name: "Order Management" })).not.toBeInTheDocument();
  });

  it("opens an existing order in Order Management from its folder", async () => {
    vi.mocked(listOrders).mockResolvedValue({
      data: [orderA],
      pagination: {
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
      },
    });

    vi.mocked(listAllOrders).mockResolvedValue([orderA]);

    renderPage();

    const allOrdersFolder = await screen.findByRole("button", {
      name: /all orders/i,
    });

    fireEvent.click(allOrdersFolder);

    const orderButton = await screen.findByRole("button", {
      name: "00001",
    });

    fireEvent.click(orderButton);

    await waitFor(() => {
      expect(screen.getByTestId("current-location")).toHaveTextContent(
        `/order-management?orderId=${orderA.id}`,
      );
    });
  });

  it("opens the customer picker when returning from Order Management to switch customers", async () => {
    renderPage(["/orders?customerPicker=1"]);

    expect(
      await screen.findByRole("heading", { name: /find customer/i }),
    ).toBeInTheDocument();
  });

  it("opens the customer finder before creating a new order", async () => {
    renderPage();

    await screen.findByText("No orders found.");

    fireEvent.click(
      screen.getByRole("button", {
        name: /^New order$/i,
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: /find customer/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", {
        name: /^new order$/i,
      }),
    ).not.toBeInTheDocument();

    expect(
      vi.mocked(createOrderWithOfflineQueue),
    ).not.toHaveBeenCalled();
  });

  it("keeps the customer workspace after creating an order", async () => {
    vi.mocked(createOrderWithOfflineQueue).mockResolvedValue({
  queued: false,
  order: orderA,
});

    renderPage();

    await screen.findByText("No orders found.");

    await openNewOrderForCustomer(customerA);

    fireEvent.change(
      screen.getByLabelText(/garment \/ customer note/i),
      {
        target: { value: "Before creation" },
      },
    );

    const serviceSelect = screen
      .getAllByRole("combobox")
      .find((select) =>
        Array.from((select as HTMLSelectElement).options).some(
          (option) => option.value === serviceA.id,
        ),
      );

    expect(serviceSelect).toBeDefined();

    fireEvent.change(serviceSelect!, {
      target: { value: serviceA.id },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /create order/i,
      }),
    );

    await waitFor(() =>
      expect(vi.mocked(createOrderWithOfflineQueue)).toHaveBeenCalled(),
    );

    const workspace =
      useOrderWorkspaceStore.getState().workspaces.find(
        (item) => item.customer.id === customerA.id,
      );

    expect(workspace?.activeOrder?.id).toBe(orderA.id);
  });

  it("shows the offline-saved message when order creation is queued", async () => {
    vi.mocked(createOrderWithOfflineQueue).mockResolvedValue({
      queued: true,
      operation: {
        id: 1,
        businessId: "business-a",
        branchId: "branch-a",
        actorUserId: "user-a",
        clientOperationId: "client-operation-a",
        operationType: "ORDER_CREATE",
        payload: {
          customerId: customerA.id,
          items: [
            {
              serviceId: serviceA.id,
              quantity: 1,
              colors: [],
            },
          ],
        },
        status: "PENDING",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    } as never);

    renderPage();

    await screen.findByText("No orders found.");

    await openNewOrderForCustomer(customerA);

    const serviceSelect = screen
      .getAllByRole("combobox")
      .find((select) =>
        Array.from((select as HTMLSelectElement).options).some(
          (option) => option.value === serviceA.id,
        ),
      );

    expect(serviceSelect).toBeDefined();

    fireEvent.change(serviceSelect!, {
      target: { value: serviceA.id },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /create order/i,
      }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(
      "Order saved offline and will be synchronized when the connection is restored.",
    );

    expect(
      screen.getByRole("heading", { name: /new order/i }),
    ).toBeInTheDocument();
  });

  it("keeps Order Management outside the Orders route after selecting an order", async () => {
    vi.mocked(listOrders).mockResolvedValue({
      data: [orderA],
      pagination: {
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
      },
    });
    vi.mocked(listAllOrders).mockResolvedValue([orderA]);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /all orders/i }));
    fireEvent.click(await screen.findByRole("button", { name: "00001" }));

    await waitFor(() => {
      expect(screen.getByTestId("current-location")).toHaveTextContent(
        `/order-management?orderId=${orderA.id}`,
      );
    });

    expect(
      screen.queryByRole("region", { name: "Order Management" }),
    ).not.toBeInTheDocument();
  });

describe("OrdersPage customer-specific pricing", () => {
  async function openNewOrderForCustomer(customer: Customer) {
    fireEvent.click(screen.getByRole("button", { name: /^New order$/i }));
    await screen.findByRole("heading", { name: /find customer/i });
    const picker = screen.getByRole("region", { name: /find customer/i });
    fireEvent.click(within(picker).getByRole("button", {
      name: new RegExp(`^${customer.name}(?:\\s|$)`, "i"),
    }));
    await screen.findByRole("heading", { name: /new order/i });
  }

  it("waits for agreed prices before displaying totals or allowing order creation", async () => {
    let resolvePrices!: (value: { data: Array<{ id: string; customerId: string; serviceId: string; unitPrice: number; service: typeof serviceA }> }) => void;
    vi.mocked(listCustomerServicePrices).mockImplementation(
      () => new Promise((resolve) => { resolvePrices = resolve; }),
    );

    renderPage();
    await screen.findByText("No orders found.");
    await openNewOrderForCustomer(customerA);

    expect(await screen.findByText(
      "Loading this customer's agreed service prices before calculating the order…",
    )).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: /create order/i })).toBeDisabled();

    const serviceSelect = screen.getAllByRole("combobox").find((element) =>
      Array.from((element as HTMLSelectElement).options).some(
        (option) => option.value === serviceA.id,
      ),
    );
    expect(serviceSelect).toBeDefined();
    fireEvent.change(serviceSelect!, { target: { value: serviceA.id } });
    expect(screen.getByText("Loading customer price…")).toBeInTheDocument();

    resolvePrices({
      data: [{
        id: "customer-price-a",
        customerId: customerA.id,
        serviceId: serviceA.id,
        unitPrice: 2500,
        service: serviceA,
      }],
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create order/i })).toBeEnabled();
    });
    expect(screen.getAllByText("₦2,500").length).toBeGreaterThan(0);
  });

  it("blocks order creation and offers retry when agreed-price lookup fails", async () => {
    vi.mocked(listCustomerServicePrices)
      .mockRejectedValueOnce(new Error("Temporary pricing service failure"))
      .mockResolvedValueOnce({
        data: [{
          id: "customer-price-a",
          customerId: customerA.id,
          serviceId: serviceA.id,
          unitPrice: 2500,
          service: serviceA,
        }],
      });

    renderPage();
    await screen.findByText("No orders found.");
    await openNewOrderForCustomer(customerA);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load this customer's agreed prices",
    );
    expect(screen.getByRole("button", { name: /create order/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Retry customer pricing" }));

    await waitFor(() => {
      expect(listCustomerServicePrices).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("button", { name: /create order/i })).toBeEnabled();
    });
  });
});

describe("OrdersPage customer names", () => {
  it("shows the related customer name even when the customer picker page does not contain that customer", async () => {
    const orderWithCustomer = {
      ...orderA,
      customer: {
        id: customerA.id,
        name: customerA.name,
        phone: customerA.phone,
        email: customerA.email,
      },
    };

    vi.mocked(listCustomers).mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 100, total: 6494, totalPages: 65 },
    });
    vi.mocked(listOrders).mockResolvedValue({
      data: [orderWithCustomer],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    vi.mocked(listAllOrders).mockResolvedValue([orderWithCustomer]);

    renderPage();
    const allOrdersFolder = await screen.findByRole("button", { name: /all orders/i });
    fireEvent.click(allOrdersFolder);

    expect(await screen.findByRole("cell", { name: "Jane Doe" })).toBeInTheDocument();
    expect(screen.queryByText(customerA.id)).not.toBeInTheDocument();
  });
});
});


describe("OrdersPage customer-specific discounts", () => {
  it("shows eligible automatic discounts as informational and keeps manual adjustments selectable", async () => {
    vi.mocked(listPricingRules).mockResolvedValue({
      adjustments: [
        {
          id: "automatic-customer-discount",
          name: "Jane's discount",
          percentage: -10,
          isActive: true,
          targetScope: "CUSTOMER",
          customerId: customerA.id,
          groupId: null,
          startsAt: null,
          endsAt: null,
          allowStacking: false,
          excludedServiceIds: [],
          customer: { id: customerA.id, name: customerA.name },
          group: null,
        },
        {
          id: "manual-adjustment",
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
    await screen.findByText("No orders found.");

    fireEvent.click(screen.getByRole("button", { name: /^New order$/i }));
    await screen.findByRole("heading", { name: /find customer/i });
    fireEvent.click(screen.getByRole("button", {
      name: new RegExp(`^${customerA.name}(?:\\s|$)`, "i"),
    }));

    const automaticSection = await screen.findByLabelText("Automatic customer discounts");
    const manualSection = await screen.findByLabelText("Manual adjustments");

    expect(within(automaticSection).getByText("Jane's discount")).toBeInTheDocument();
    expect(within(automaticSection).getByText(/applied automatically/i)).toBeInTheDocument();
    expect(within(automaticSection).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(manualSection).getByText("Courtesy adjustment")).toBeInTheDocument();
    expect(within(manualSection).getByRole("checkbox")).toBeInTheDocument();

    await waitFor(() => {
      expect(listPricingRules).toHaveBeenCalledWith(
        { accessToken: "test-token" },
        customerA.id,
        "order",
      );
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Customer, Order } from "@laundry-app/shared";
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
  createOrderWithOfflineQueue: vi.fn(),
  updateOrderStatusWithOfflineQueue: vi.fn(),
}));

vi.mock("../../../src/lib/customers-api.js", () => ({
  listCustomers: vi.fn(),
}));

vi.mock("../../../src/lib/services-api.js", () => ({
  listServices: vi.fn(),
}));

import {
  createOrderWithOfflineQueue,
  listOrders,
} from "../../../src/lib/orders-api.js";
import { listCustomers } from "../../../src/lib/customers-api.js";
import { listServices } from "../../../src/lib/services-api.js";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OrdersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function seedAuth() {
  useAuthStore.setState({
    user: {
      id: "user-a",
      businessId: "business-a",
      role: "STAFF",
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

  vi.mocked(listServices).mockResolvedValue({
    data: [serviceA, serviceB],
    pagination: {
      page: 1,
      pageSize: 25,
      total: 2,
      totalPages: 1,
    },
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
});

describe("OrdersPage quick customer switching", () => {
  it("opens three customer workspaces", async () => {
    renderPage();

    await screen.findByText("No orders found.");

    fireEvent.click(
      screen.getByRole("button", {
        name: /^New order$/i,
      }),
    );

    const customerSelect = screen.getByLabelText("Customer");

    fireEvent.change(customerSelect, {
      target: { value: customerA.id },
    });

    fireEvent.change(customerSelect, {
      target: { value: customerB.id },
    });

    fireEvent.change(customerSelect, {
      target: { value: customerC.id },
    });

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

    fireEvent.click(
      screen.getByRole("button", {
        name: /^New order$/i,
      }),
    );

    const customerSelect = screen.getByLabelText("Customer");

    fireEvent.change(customerSelect, {
      target: { value: customerA.id },
    });

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

    fireEvent.change(customerSelect, {
      target: { value: customerB.id },
    });

    expect(
      screen.getByLabelText(/garment \/ customer note/i),
    ).toHaveValue("");

    fireEvent.change(customerSelect, {
      target: { value: customerA.id },
    });

    expect(
      screen.getByLabelText(/garment \/ customer note/i),
    ).toHaveValue("Jane's special garment instruction");

    expect(screen.getByRole("spinbutton")).toHaveValue(2);
  });

  it("switches between visible customer workspaces", async () => {
    renderPage();

    await screen.findByText("No orders found.");

    fireEvent.click(
      screen.getByRole("button", {
        name: /^New order$/i,
      }),
    );

    const customerSelect = screen.getByLabelText("Customer");

    fireEvent.change(customerSelect, {
      target: { value: customerA.id },
    });

    fireEvent.change(customerSelect, {
      target: { value: customerB.id },
    });

    expect(
      screen.getByText(/John Doe — New order/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /Jane Doe — New order/i,
      }),
    );

    expect(screen.getByLabelText("Customer")).toHaveValue(
      customerA.id,
    );
  });

  it("attaches an existing order to the correct customer workspace", async () => {
    vi.mocked(listOrders).mockResolvedValue({
      data: [orderA],
      pagination: {
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
      },
    });

    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "00001",
      }),
    );

    await waitFor(() => {
      const workspace =
        useOrderWorkspaceStore.getState().workspaces.find(
          (item) => item.customer.id === customerA.id,
        );

      expect(workspace?.activeOrder?.id).toBe(orderA.id);
    });
  });

  it("opens a new order form without requiring an active customer workspace", async () => {
    renderPage();

    await screen.findByText("No orders found.");

    fireEvent.click(
      screen.getByRole("button", {
        name: /^New order$/i,
      }),
    );

    expect(screen.getByRole("heading", { name: /new order/i }))
      .toBeInTheDocument();

    expect(screen.getByLabelText("Customer")).toHaveValue("");

    expect(vi.mocked(createOrderWithOfflineQueue)).not.toHaveBeenCalled();
  });

  it("keeps the customer workspace after creating an order", async () => {
    vi.mocked(createOrderWithOfflineQueue).mockResolvedValue({
  queued: false,
  order: orderA,
});

    renderPage();

    await screen.findByText("No orders found.");

    fireEvent.click(
      screen.getByRole("button", {
        name: /^New order$/i,
      }),
    );

    fireEvent.change(screen.getByLabelText("Customer"), {
      target: { value: customerA.id },
    });

    fireEvent.change(
      screen.getByLabelText(/garment \/ customer note/i),
      {
        target: { value: "Before creation" },
      },
    );

    const selects = screen.getAllByRole("combobox");

    fireEvent.change(selects[3]!, {
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

  it("closes only the workspace and keeps the customer available", async () => {
    renderPage();

    await screen.findByText("No orders found.");

    fireEvent.click(
      screen.getByRole("button", {
        name: /^New order$/i,
      }),
    );

    fireEvent.change(screen.getByLabelText("Customer"), {
      target: { value: customerA.id },
    });

    expect(
      screen.getByText(/Jane Doe — New order/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /close jane doe workspace/i,
      }),
    );

    expect(
      useOrderWorkspaceStore.getState().workspaces,
    ).toHaveLength(0);

    expect(
      screen.getByRole("option", {
        name: /Jane Doe/i,
      }),
    ).toBeInTheDocument();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryPage } from "../../../src/pages/inventory/InventoryPage.js";
import type {
  InventoryItem,
  InventoryStock,
} from "../../../src/lib/inventory-api.js";

const mockListInventoryItems = vi.fn();
const mockCreateInventoryItem = vi.fn();
const mockUpdateInventoryItem = vi.fn();
const mockListInventoryStock = vi.fn();
const mockListInventoryMovements = vi.fn();
const mockCreateInventoryMovement = vi.fn();
const mockAdjustInventoryStock = vi.fn();
const mockListInventorySuppliers = vi.fn();
const mockCreateInventorySupplier = vi.fn();
const mockListInventoryPurchaseOrders = vi.fn();
const mockCreateInventoryPurchaseOrder = vi.fn();
const mockReceiveInventoryPurchaseOrder = vi.fn();

vi.mock("../../../src/lib/inventory-api.js", () => ({
  listInventoryItems: (...args: unknown[]) =>
    mockListInventoryItems(...args),
  createInventoryItem: (...args: unknown[]) =>
    mockCreateInventoryItem(...args),
  updateInventoryItem: (...args: unknown[]) =>
    mockUpdateInventoryItem(...args),
  listInventoryStock: (...args: unknown[]) =>
    mockListInventoryStock(...args),
  listInventoryMovements: (...args: unknown[]) =>
    mockListInventoryMovements(...args),
  createInventoryMovement: (...args: unknown[]) =>
    mockCreateInventoryMovement(...args),
  adjustInventoryStock: (...args: unknown[]) =>
    mockAdjustInventoryStock(...args),
  listInventorySuppliers: (...args: unknown[]) => mockListInventorySuppliers(...args),
  createInventorySupplier: (...args: unknown[]) => mockCreateInventorySupplier(...args),
  listInventoryPurchaseOrders: (...args: unknown[]) => mockListInventoryPurchaseOrders(...args),
  createInventoryPurchaseOrder: (...args: unknown[]) => mockCreateInventoryPurchaseOrder(...args),
  receiveInventoryPurchaseOrder: (...args: unknown[]) => mockReceiveInventoryPurchaseOrder(...args),
}));

vi.mock("../../../src/state/auth-store.js", () => ({
  useAuthStore: (
    selector: (state: {
      accessToken: string | null;
      activeBranchId: string | null;
    }) => unknown,
  ) =>
    selector({
      accessToken: "test-token",
      activeBranchId: "branch-1",
    }),
}));

const item: InventoryItem = {
  id: "item-1",
  businessId: "business-1",
  name: "Detergent",
  sku: "DET-001",
  category: "Chemicals",
  storageLocation: "Shelf A1",
  description: "Laundry detergent",
  unit: "BOTTLE",
  reorderQuantity: 12,
  lowStockThreshold: 5,
  isActive: true,
  createdAt: "2026-09-07T10:00:00.000Z",
  updatedAt: "2026-09-07T10:00:00.000Z",
};

const inactiveItem: InventoryItem = {
  ...item,
  id: "item-2",
  name: "Bleach",
  isActive: false,
};

const stock: InventoryStock = {
  id: "stock-1",
  businessId: "business-1",
  branchId: "branch-1",
  inventoryItemId: item.id,
  quantity: 12,
  createdAt: "2026-09-07T10:00:00.000Z",
  updatedAt: "2026-09-07T10:00:00.000Z",
  inventoryItem: item,
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <InventoryPage />
    </QueryClientProvider>,
  );
}

function mockSuccessfulQueries() {
  mockListInventorySuppliers.mockResolvedValue({ suppliers: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } });
  mockListInventoryPurchaseOrders.mockResolvedValue({ purchaseOrders: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 } });
  mockListInventoryItems.mockResolvedValue({
    items: [item],
    pagination: {
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    },
  });

  mockListInventoryStock.mockResolvedValue({
    stocks: [stock],
    pagination: {
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    },
  });
  mockListInventoryMovements.mockResolvedValue({
    movements: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSuccessfulQueries();
  mockCreateInventoryItem.mockResolvedValue(item);
  mockUpdateInventoryItem.mockResolvedValue(item);
  mockCreateInventoryMovement.mockResolvedValue({
    movement: {
      id: "movement-1",
      businessId: "business-1",
      branchId: "branch-1",
      inventoryItemId: item.id,
      quantity: 3,
      type: "RECEIPT",
      resultingQuantity: 15,
      reason: null,
      reference: null,
      createdById: "user-1",
      createdAt: "2026-09-07T10:00:00.000Z",
    },
    stock,
    inventoryItem: item,
  });
  mockCreateInventorySupplier.mockResolvedValue({ data: { id: "supplier-1", name: "Test Supplier", isActive: true } });
  mockCreateInventoryPurchaseOrder.mockResolvedValue({ data: {} });
  mockReceiveInventoryPurchaseOrder.mockResolvedValue({ data: {} });
  mockAdjustInventoryStock.mockResolvedValue({
    movement: {
      id: "movement-2",
      businessId: "business-1",
      branchId: "branch-1",
      inventoryItemId: item.id,
      quantity: -2,
      type: "ADJUSTMENT",
      resultingQuantity: 10,
      reason: "Stock count correction",
      reference: null,
      createdById: "user-1",
      createdAt: "2026-09-07T10:00:00.000Z",
    },
    stock,
    inventoryItem: item,
  });
});

describe("InventoryPage", () => {
  it("loads and displays inventory items and branch stock", async () => {
    renderPage();

    expect(
      await screen.findByRole("button", { name: "Detergent" }),
    ).toBeInTheDocument();

    expect(screen.getAllByText("Bottle")).toHaveLength(2);
    expect(screen.getByText("Current Stock")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockListInventoryStock).toHaveBeenCalledWith(
        {
          lowStockOnly: undefined,
          page: 1,
          pageSize: 25,
        },
        { accessToken: "test-token" },
        "branch-1",
      );
    });
  });

  it("shows the branch-scoped stock movement ledger", async () => {
    mockListInventoryMovements.mockResolvedValue({
      movements: [{
        id: "movement-history-1",
        businessId: "business-1",
        branchId: "branch-1",
        inventoryItemId: item.id,
        quantity: 3,
        type: "RECEIPT",
        resultingQuantity: 12,
        reason: "Supplier delivery",
        reference: "PO-1001",
        createdById: "user-1",
        createdAt: "2026-09-07T10:00:00.000Z",
        inventoryItem: item,
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    renderPage();

    expect(await screen.findByText("Stock Movement History")).toBeInTheDocument();
    expect(await screen.findByText("Supplier delivery")).toBeInTheDocument();
    expect(screen.getByText("PO-1001")).toBeInTheDocument();
    await waitFor(() => {
      expect(mockListInventoryMovements).toHaveBeenCalledWith(
        { inventoryItemId: undefined, page: 1, pageSize: 20 },
        { accessToken: "test-token" },
        "branch-1",
      );
    });
  });

  it("creates an inventory item", async () => {
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "New inventory item",
      }),
    );

    fireEvent.change(
      screen.getByLabelText("Item"),
      {
        target: { value: "Fabric Softener" },
      },
    );

    const selects = screen.getAllByRole("combobox");
    const unitSelect = selects[1];

    fireEvent.change(unitSelect, {
      target: { value: "BOTTLE" },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Create item",
      }),
    );

    await waitFor(() => {
      expect(mockCreateInventoryItem).toHaveBeenCalledWith(
        {
          name: "Fabric Softener",
          sku: undefined,
          category: undefined,
          storageLocation: undefined,
          description: undefined,
          unit: "BOTTLE",
          reorderQuantity: 0,
          lowStockThreshold: 0,
        },
        { accessToken: "test-token" },
      );
    });
  });

  it("replaces the default zero when entering a low stock threshold", async () => {
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "New inventory item",
      }),
    );

    const input = screen.getByLabelText("Low Stock Threshold");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "5" } });

    expect(input).toHaveValue(5);

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "25" } });

    expect(input).toHaveValue(25);
  });

  it("validates the inventory item form before creating", async () => {
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "New inventory item",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Create item",
      }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(
      "Inventory item name is required.",
    );

    expect(mockCreateInventoryItem).not.toHaveBeenCalled();
  });

  it("activates and deactivates an inventory item", async () => {
    mockListInventoryItems.mockResolvedValue({
      items: [item, inactiveItem],
      pagination: {
        page: 1,
        pageSize: 25,
        total: 2,
        totalPages: 1,
      },
    });

    renderPage();

    expect(
      await screen.findByRole("option", { name: "Bleach" }),
    ).toBeInTheDocument();

    const buttons = screen.getAllByRole("button");

    fireEvent.click(
      buttons.find(
        (button) => button.textContent === "Deactivate",
      )!,
    );

    await waitFor(() => {
      expect(mockUpdateInventoryItem).toHaveBeenCalledWith(
        item.id,
        { isActive: false },
        { accessToken: "test-token" },
      );
    });

    fireEvent.click(
      buttons.find(
        (button) => button.textContent === "Activate",
      )!,
    );

    await waitFor(() => {
      expect(mockUpdateInventoryItem).toHaveBeenCalledWith(
        inactiveItem.id,
        { isActive: true },
        { accessToken: "test-token" },
      );
    });
  });

  it("receives stock for the selected branch", async () => {
    renderPage();

    await screen.findByRole("button", { name: "Detergent" });
    const movementSection = screen.getByRole("region", {
      name: "Stock movement",
    });

    fireEvent.change(
      screen.getByLabelText("Movement"),
      {
        target: { value: "RECEIPT" },
      },
    );

    fireEvent.change(
      screen.getAllByLabelText("Inventory Item")[0],
      {
        target: { value: item.id },
      },
    );

    fireEvent.change(
      movementSection.querySelector<HTMLInputElement>('input[type="number"]')!,
      {
        target: { value: "3" },
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Receive Stock",
      }),
    );

    await waitFor(() => {
      expect(mockCreateInventoryMovement).toHaveBeenCalledWith(
        {
          inventoryItemId: item.id,
          quantity: 3,
          type: "RECEIPT",
          reason: undefined,
          reference: undefined,
        },
        { accessToken: "test-token" },
        "branch-1",
      );
    });
  });

  it("issues stock using the existing movement API", async () => {
    renderPage();

    await screen.findByRole("button", { name: "Detergent" });

    fireEvent.change(
      screen.getByLabelText("Movement"),
      {
        target: { value: "ISSUE" },
      },
    );

    const movementSection = screen.getByRole("region", {
      name: "Stock movement",
    });

    fireEvent.change(
      movementSection.querySelectorAll("select")[1],
      {
        target: { value: item.id },
      },
    );

    fireEvent.change(
      movementSection.querySelector<HTMLInputElement>('input[type="number"]')!,
      {
        target: { value: "4" },
      },
    );

    fireEvent.change(
      movementSection.querySelector("input")?.parentElement
        ? movementSection.querySelectorAll("input")[1]
        : screen.getAllByLabelText("Reason")[0],
      {
        target: { value: "Laundry production" },
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Issue Stock",
      }),
    );

    await waitFor(() => {
      expect(mockCreateInventoryMovement).toHaveBeenCalledWith(
        {
          inventoryItemId: item.id,
          quantity: 4,
          type: "ISSUE",
          reason: "Laundry production",
          reference: undefined,
        },
        { accessToken: "test-token" },
        "branch-1",
      );
    });
  });

  it("adjusts stock with a required reason", async () => {
    renderPage();

    await screen.findByRole("button", { name: "Detergent" });

    fireEvent.change(
      screen.getAllByLabelText("Inventory Item")[1],
      {
        target: { value: item.id },
      },
    );

    fireEvent.change(
      screen.getByPlaceholderText("Positive or negative"),
      {
        target: { value: "-2" },
      },
    );

    fireEvent.change(
      screen.getAllByLabelText("Reason")[1],
      {
        target: { value: "Stock count correction" },
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Adjust Stock",
      }),
    );

    await waitFor(() => {
      expect(mockAdjustInventoryStock).toHaveBeenCalledWith(
        {
          inventoryItemId: item.id,
          quantity: -2,
          reason: "Stock count correction",
          reference: undefined,
        },
        { accessToken: "test-token" },
        "branch-1",
      );
    });
  });

  it("requires an adjustment reason", async () => {
    renderPage();

    await screen.findByRole("button", { name: "Detergent" });

    fireEvent.change(
      screen.getAllByLabelText("Inventory Item")[1],
      {
        target: { value: item.id },
      },
    );

    fireEvent.change(
      screen.getByPlaceholderText("Positive or negative"),
      {
        target: { value: "2" },
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Adjust Stock",
      }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(
      "Adjustment reason is required.",
    );

    expect(mockAdjustInventoryStock).not.toHaveBeenCalled();
  });
});

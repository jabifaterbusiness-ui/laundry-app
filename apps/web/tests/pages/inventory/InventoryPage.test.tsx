import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const mockGetInventoryReports = vi.fn();
const mockCreateInventoryTransfer = vi.fn();
const mockListInventoryTransfers = vi.fn();
const mockReceiveInventoryTransfer = vi.fn();
const mockCreateInventoryStocktake = vi.fn();
const mockListInventoryStocktakes = vi.fn();
const mockSubmitInventoryStocktake = vi.fn();
const mockApproveInventoryStocktake = vi.fn();
const mockApplyInventoryStocktake = vi.fn();
const mockCreateInventoryReservation = vi.fn();
const mockReleaseInventoryReservation = vi.fn();
const mockListInventoryReservations = vi.fn();
const mockListInventoryReorderRecommendations = vi.fn();
const mockGetInventoryBranchComparison = vi.fn();
const mockUserPermissions: string[] = [];

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
  getInventoryReports: (...args: unknown[]) => mockGetInventoryReports(...args),
  createInventoryTransfer: (...args: unknown[]) => mockCreateInventoryTransfer(...args),
  listInventoryTransfers: (...args: unknown[]) => mockListInventoryTransfers(...args),
  receiveInventoryTransfer: (...args: unknown[]) => mockReceiveInventoryTransfer(...args),
  createInventoryStocktake: (...args: unknown[]) => mockCreateInventoryStocktake(...args),
  listInventoryStocktakes: (...args: unknown[]) => mockListInventoryStocktakes(...args),
  submitInventoryStocktake: (...args: unknown[]) => mockSubmitInventoryStocktake(...args),
  approveInventoryStocktake: (...args: unknown[]) => mockApproveInventoryStocktake(...args),
  applyInventoryStocktake: (...args: unknown[]) => mockApplyInventoryStocktake(...args),
  createInventoryReservation: (...args: unknown[]) => mockCreateInventoryReservation(...args),
  releaseInventoryReservation: (...args: unknown[]) => mockReleaseInventoryReservation(...args),
  listInventoryReservations: (...args: unknown[]) => mockListInventoryReservations(...args),
  listInventoryReorderRecommendations: (...args: unknown[]) => mockListInventoryReorderRecommendations(...args),
  getInventoryBranchComparison: (...args: unknown[]) => mockGetInventoryBranchComparison(...args),
}));

vi.mock("../../../src/state/auth-store.js", () => ({
  useAuthStore: (
    selector: (state: {
      accessToken: string | null;
      activeBranchId: string | null;
      user: { branches: Array<{ id: string; name: string; isActive?: boolean }>; permissions: string[] };
    }) => unknown,
  ) =>
    selector({
      accessToken: "test-token",
      activeBranchId: "branch-1",
      user: { branches: [{ id: "branch-1", name: "Main branch" }, { id: "branch-2", name: "Second branch" }], permissions: mockUserPermissions },
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
  reservedQuantity: 0,
  averageUnitCost: 0,
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
  mockGetInventoryReports.mockResolvedValue({
    data: {
      periodDays: 30,
      totalValuation: 0,
      movementCount: 0,
      consumptionQuantity: 0,
      adjustmentQuantity: 0,
      valuation: [],
      movementTotals: {},
      supplierPerformance: [],
    },
  });
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
  mockUserPermissions.length = 0;
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
  mockCreateInventoryTransfer.mockResolvedValue({ data: {} });
  mockListInventoryTransfers.mockResolvedValue({ transfers: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } });
  mockReceiveInventoryTransfer.mockResolvedValue({ data: {} });
  mockCreateInventoryStocktake.mockResolvedValue({ data: { id: "stocktake-1", reference: "COUNT-1", status: "DRAFT", lines: [] } });
  mockListInventoryStocktakes.mockResolvedValue({ stocktakes: [] });
  mockSubmitInventoryStocktake.mockResolvedValue({ data: {} });
  mockApproveInventoryStocktake.mockResolvedValue({ data: {} });
  mockApplyInventoryStocktake.mockResolvedValue({ data: {} });
  mockCreateInventoryReservation.mockResolvedValue({ data: { id: "reservation-1" } });
  mockReleaseInventoryReservation.mockResolvedValue({ data: {} });
  mockListInventoryReservations.mockResolvedValue({ data: [] });
  mockListInventoryReorderRecommendations.mockResolvedValue({ data: [] });
  mockGetInventoryBranchComparison.mockResolvedValue({ data: [] });
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
  it("enforces the stocktake submit, approve and apply workflow in the UI", async () => {
    mockUserPermissions.push("inventory.approve");
    const lines = [{
      id: "stocktake-line-1", inventoryItemId: item.id, expectedQuantity: 12,
      countedQuantity: 10, variance: -2, inventoryItem: item,
    }];
    const stocktake = (status: "DRAFT" | "SUBMITTED" | "APPROVED" | "APPLIED") => ({
      data: { id: "stocktake-workflow", reference: "COUNT-WORKFLOW", status, lines },
    });
    mockCreateInventoryStocktake.mockResolvedValue(stocktake("DRAFT"));
    mockSubmitInventoryStocktake.mockResolvedValue(stocktake("SUBMITTED"));
    mockApproveInventoryStocktake.mockResolvedValue(stocktake("APPROVED"));
    mockApplyInventoryStocktake.mockResolvedValue(stocktake("APPLIED"));

    renderPage();
    await screen.findByRole("button", { name: "Detergent" });
    const panel = await screen.findByRole("region", { name: "Advanced inventory operations" });
    const stocktakeForm = within(panel).getByRole("heading", { name: "Physical stock count" }).closest("form")!;
    fireEvent.change(within(stocktakeForm).getByLabelText("Stocktake reference"), { target: { value: "COUNT-WORKFLOW" } });
    fireEvent.change(within(stocktakeForm).getByLabelText("Item"), { target: { value: item.id } });
    fireEvent.change(within(stocktakeForm).getByLabelText("Counted quantity"), { target: { value: "10" } });
    fireEvent.click(within(stocktakeForm).getByRole("button", { name: "Save draft count" }));

    const review = await screen.findByRole("region", { name: "Stocktake approval workflow" });
    fireEvent.click(within(review).getByRole("button", { name: "Submit for approval" }));
    await waitFor(() => expect(mockSubmitInventoryStocktake).toHaveBeenCalledWith(
      "stocktake-workflow", { accessToken: "test-token" }, "branch-1",
    ));

    fireEvent.click(await within(review).findByRole("button", { name: "Approve stocktake" }));
    await waitFor(() => expect(mockApproveInventoryStocktake).toHaveBeenCalledWith(
      "stocktake-workflow", { accessToken: "test-token" }, "branch-1",
    ));

    fireEvent.click(await within(review).findByRole("button", { name: "Apply approved count" }));
    await waitFor(() => expect(mockApplyInventoryStocktake).toHaveBeenCalledWith(
      "stocktake-workflow", { accessToken: "test-token" }, "branch-1",
    ));
    expect(await within(review).findByRole("status")).toHaveTextContent("Stock reconciliation applied successfully.");
  });

  it("creates a branch-scoped physical stocktake draft", async () => {
    mockCreateInventoryStocktake.mockResolvedValue({
      data: {
        id: "stocktake-new", reference: "COUNT-NEW", status: "DRAFT",
        lines: [{
          id: "stocktake-line-1", inventoryItemId: item.id, expectedQuantity: 12,
          countedQuantity: 10, variance: -2, inventoryItem: item,
        }],
      },
    });
    renderPage();
    await screen.findByRole("button", { name: "Detergent" });
    const panel = await screen.findByRole("region", { name: "Advanced inventory operations" });
    const stocktakeForm = within(panel).getByRole("heading", { name: "Physical stock count" }).closest("form")!;
    fireEvent.change(within(stocktakeForm).getByLabelText("Stocktake reference"), { target: { value: "COUNT-NEW" } });
    fireEvent.change(within(stocktakeForm).getByLabelText("Item"), { target: { value: item.id } });
    fireEvent.change(within(stocktakeForm).getByLabelText("Counted quantity"), { target: { value: "10" } });
    fireEvent.click(within(stocktakeForm).getByRole("button", { name: "Save draft count" }));
    await waitFor(() => {
      expect(mockCreateInventoryStocktake).toHaveBeenCalledWith({
        reference: "COUNT-NEW", lines: [{ inventoryItemId: item.id, countedQuantity: 10 }],
      }, { accessToken: "test-token" }, "branch-1");
    });
    expect(await screen.findByRole("region", { name: "Stocktake approval workflow" })).toHaveTextContent("COUNT-NEW");
  });

  it("dispatches an inter-branch transfer with the selected destination and quantity", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Detergent" });
    const panel = await screen.findByRole("region", { name: "Advanced inventory operations" });
    const transferForm = within(panel).getByRole("heading", { name: "Dispatch inter-branch transfer" }).closest("form")!;
    fireEvent.change(within(transferForm).getByLabelText("Destination branch"), { target: { value: "branch-2" } });
    fireEvent.change(within(transferForm).getByLabelText("Transfer reference"), { target: { value: "TR-100" } });
    fireEvent.change(within(transferForm).getByLabelText("Item"), { target: { value: item.id } });
    fireEvent.change(within(transferForm).getByLabelText("Quantity"), { target: { value: "4" } });
    fireEvent.click(within(transferForm).getByRole("button", { name: "Dispatch transfer" }));
    await waitFor(() => {
      expect(mockCreateInventoryTransfer).toHaveBeenCalledWith({
        destinationBranchId: "branch-2",
        transferNumber: "TR-100",
        lines: [{ inventoryItemId: item.id, quantity: 4 }],
      }, { accessToken: "test-token" }, "branch-1");
    });
  });

  it("consumes an active reservation from the branch reservation register", async () => {
    mockListInventoryReservations.mockResolvedValue({
      data: [{
        id: "reservation-active", quantity: 2, reference: "ORDER-200", status: "ACTIVE",
        expiresAt: null, inventoryItem: { id: item.id, name: item.name, unit: item.unit },
      }],
    });
    renderPage();
    await screen.findByRole("button", { name: "Detergent" });
    const panel = await screen.findByRole("region", { name: "Stock reservations and reorder recommendations" });
    fireEvent.click(await within(panel).findByRole("button", { name: "Consume" }));
    await waitFor(() => {
      expect(mockReleaseInventoryReservation).toHaveBeenCalledWith(
        "reservation-active", true, { accessToken: "test-token" }, "branch-1",
      );
    });
  });

  it("creates a branch-scoped reservation and refreshes the reservation register", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Detergent" });
    const panel = await screen.findByRole("region", { name: "Stock reservations and reorder recommendations" });
    fireEvent.change(within(panel).getByLabelText("Item"), { target: { value: item.id } });
    fireEvent.change(within(panel).getByLabelText("Quantity"), { target: { value: "3" } });
    fireEvent.change(within(panel).getByLabelText("Reference"), { target: { value: "ORDER-300" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Reserve stock" }));
    await waitFor(() => {
      expect(mockCreateInventoryReservation).toHaveBeenCalledWith({
        inventoryItemId: item.id, quantity: 3, reference: "ORDER-300", expiresAt: undefined,
      }, { accessToken: "test-token" }, "branch-1");
    });
    expect(await within(panel).findByText(/Reservation created: reservation-1/)).toBeInTheDocument();
  });

  it("loads and displays inventory items and branch stock", async () => {
    renderPage();

    expect(
      await screen.findByRole("button", { name: "Detergent" }),
    ).toBeInTheDocument();
    expect(screen.getByText("DET-001")).toBeInTheDocument();
    expect(screen.getByText("Chemicals")).toBeInTheDocument();
    expect(screen.getByText("Shelf A1")).toBeInTheDocument();

    expect(screen.getAllByText("Bottle")).toHaveLength(2);
    const currentStock = screen.getByRole("region", { name: "Current stock" });
    expect(within(currentStock).getByText("Current Stock")).toBeInTheDocument();
    expect(within(currentStock).getAllByText("12")).toHaveLength(2);

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
    const movementReason = await screen.findByText("Supplier delivery");
    expect(movementReason).not.toBeVisible();
    fireEvent.click(screen.getByText("Stock Movement History"));
    expect(movementReason).toBeVisible();
    expect(screen.getByText("PO-1001")).toBeVisible();
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
      within(screen.getByRole("region", { name: "Inventory item form" })).getByLabelText("Item"),
      {
        target: { value: "Fabric Softener" },
      },
    );
    fireEvent.change(screen.getByLabelText("SKU"), { target: { value: "FAB-002" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Fabric Care" } });
    fireEvent.change(screen.getByLabelText("Storage Location"), { target: { value: "Shelf B2" } });

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
          sku: "FAB-002",
          category: "Fabric Care",
          storageLocation: "Shelf B2",
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
      await screen.findByText("Adjustment reason is required.", { selector: 'p[role="alert"]' }),
    ).toHaveTextContent(
      "Adjustment reason is required.",
    );

    expect(mockAdjustInventoryStock).not.toHaveBeenCalled();
  });
});

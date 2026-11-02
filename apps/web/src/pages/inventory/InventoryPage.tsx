import { useState } from "react";
import "./InventoryPage.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import {
  adjustInventoryStock,
  createInventoryItem,
  createInventoryMovement,
  listInventoryItems,
  listInventoryStock,
  listInventoryMovements,
  updateInventoryItem,
  type InventoryItem,
  type InventoryMovement,
  type InventoryUnit,
  createInventorySupplier,
  listInventorySuppliers,
  createInventoryPurchaseOrder,
  listInventoryPurchaseOrders,
  receiveInventoryPurchaseOrder,
  type InventoryPurchaseOrder,
} from "../../lib/inventory-api.js";
import { useAuthStore } from "../../state/auth-store.js";

const UNITS: InventoryUnit[] = [
  "PIECE",
  "PACK",
  "BOTTLE",
  "LITRE",
  "KILOGRAM",
  "BOX",
  "ROLL",
  "OTHER",
];

const EMPTY_ITEM_FORM = {
  name: "",
  sku: "",
  category: "",
  storageLocation: "",
  description: "",
  unit: "PIECE" as InventoryUnit,
  reorderQuantity: 0,
  lowStockThreshold: 0,
};

type MovementType = "RECEIPT" | "ISSUE";

function formatUnit(unit: InventoryUnit) {
  return unit.charAt(0) + unit.slice(1).toLowerCase();
}

function formatMovementType(type: MovementType | "ADJUSTMENT") {
  if (type === "RECEIPT") return "Receive";
  if (type === "ISSUE") return "Issue";
  return "Adjustment";
}

export function InventoryPage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const activeBranchId = useAuthStore((state) => state.activeBranchId);
  const queryClient = useQueryClient();

  const [itemStatus, setItemStatus] =
    useState<"active" | "inactive" | "all">("active");
  const [search, setSearch] = useState("");
  const [itemPage, setItemPage] = useState(1);

  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM_FORM);
  const [itemFormError, setItemFormError] = useState<string | null>(null);

  const [stockPage, setStockPage] = useState(1);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [movementHistoryPage, setMovementHistoryPage] = useState(1);
  const [movementHistoryItemId, setMovementHistoryItemId] = useState("");

  const [movementType, setMovementType] =
    useState<MovementType>("RECEIPT");
  const [movementItemId, setMovementItemId] = useState("");
  const [movementQuantity, setMovementQuantity] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [movementReference, setMovementReference] = useState("");
  const [movementError, setMovementError] = useState<string | null>(null);

  const [adjustItemId, setAdjustItemId] = useState("");
  const [adjustQuantity, setAdjustQuantity] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustReference, setAdjustReference] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const itemsQuery = useQuery({
    queryKey: [
      "inventory",
      "items",
      { itemStatus, search, itemPage },
    ],
    queryFn: () =>
      listInventoryItems(
        {
          isActive:
            itemStatus === "all"
              ? undefined
              : itemStatus === "active",
          search: search || undefined,
          page: itemPage,
          pageSize: 25,
        },
        { accessToken },
      ),
  });

  const stockQuery = useQuery({
    queryKey: [
      "inventory",
      "stock",
      { activeBranchId, stockPage, lowStockOnly },
    ],
    enabled: Boolean(activeBranchId),
    queryFn: () =>
      listInventoryStock(
        {
          lowStockOnly: lowStockOnly || undefined,
          page: stockPage,
          pageSize: 25,
        },
        { accessToken },
        activeBranchId,
      ),
  });

  const saveItemMutation = useMutation({
    mutationFn: async () => {
      const input = {
        name: itemForm.name.trim(),
        sku: itemForm.sku.trim() || undefined,
        category: itemForm.category.trim() || undefined,
        storageLocation: itemForm.storageLocation.trim() || undefined,
        description: itemForm.description.trim() || undefined,
        unit: itemForm.unit,
        reorderQuantity: itemForm.reorderQuantity,
        lowStockThreshold: itemForm.lowStockThreshold,
      };

      if (editingItem) {
        return updateInventoryItem(editingItem.id, input, {
          accessToken,
        });
      }

      return createInventoryItem(input, { accessToken });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["inventory", "items"],
      });
      closeItemForm();
    },
    onError: (error) => {
      setItemFormError(
        error instanceof ApiError
          ? error.message
          : "Unable to save inventory item. Please try again.",
      );
    },
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      updateInventoryItem(
        input.id,
        { isActive: input.isActive },
        { accessToken },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["inventory", "items"],
      });
    },
  });

  const movementHistoryQuery = useQuery({
    queryKey: ["inventory", "movements", { activeBranchId, movementHistoryPage, movementHistoryItemId }],
    enabled: Boolean(activeBranchId),
    queryFn: () => listInventoryMovements(
      {
        inventoryItemId: movementHistoryItemId || undefined,
        page: movementHistoryPage,
        pageSize: 20,
      },
      { accessToken },
      activeBranchId,
    ),
  });

  const movementMutation = useMutation({
    mutationFn: () =>
      createInventoryMovement(
        {
          inventoryItemId: movementItemId,
          quantity: Number(movementQuantity),
          type: movementType,
          reason: movementReason.trim() || undefined,
          reference: movementReference.trim() || undefined,
        },
        { accessToken },
        activeBranchId,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["inventory", "stock"],
      });
      queryClient.invalidateQueries({
        queryKey: ["inventory", "movements"],
      });
      resetMovementForm();
    },
    onError: (error) => {
      setMovementError(
        error instanceof ApiError
          ? error.message
          : "Unable to record stock movement. Please try again.",
      );
    },
  });

  const adjustMutation = useMutation({
    mutationFn: () =>
      adjustInventoryStock(
        {
          inventoryItemId: adjustItemId,
          quantity: Number(adjustQuantity),
          reason: adjustReason.trim(),
          reference: adjustReference.trim() || undefined,
        },
        { accessToken },
        activeBranchId,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["inventory", "stock"],
      });
      queryClient.invalidateQueries({
        queryKey: ["inventory", "movements"],
      });
      resetAdjustmentForm();
    },
    onError: (error) => {
      setAdjustError(
        error instanceof ApiError
          ? error.message
          : "Unable to adjust stock. Please try again.",
      );
    },
  });


  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [poSupplierId, setPoSupplierId] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [poLines, setPoLines] = useState<Array<{ inventoryItemId: string; quantityOrdered: string; unitCost: string }>>([
    { inventoryItemId: "", quantityOrdered: "1", unitCost: "0" },
  ]);
  const [receiveOrderId, setReceiveOrderId] = useState("");
  const [receiveLineId, setReceiveLineId] = useState("");
  const [receiveQuantity, setReceiveQuantity] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [procurementError, setProcurementError] = useState<string | null>(null);

  const suppliersQuery = useQuery({
    queryKey: ["inventory", "suppliers"],
    queryFn: () => listInventorySuppliers({ page: 1, pageSize: 100 }, { accessToken }),
  });
  const purchaseOrdersQuery = useQuery({
    queryKey: ["inventory", "purchase-orders", activeBranchId],
    enabled: Boolean(activeBranchId),
    queryFn: () => listInventoryPurchaseOrders({ page: 1, pageSize: 50 }, { accessToken }, activeBranchId),
  });
  const supplierMutation = useMutation({
    mutationFn: () => createInventorySupplier({ name: supplierName.trim(), phone: supplierPhone.trim() || undefined, email: supplierEmail.trim() || undefined }, { accessToken }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["inventory", "suppliers"] }); setSupplierName(""); setSupplierPhone(""); setSupplierEmail(""); setProcurementError(null); },
    onError: (error) => setProcurementError(error instanceof ApiError ? error.message : "Unable to save supplier."),
  });
  const purchaseOrderMutation = useMutation({
    mutationFn: () => createInventoryPurchaseOrder({
      supplierId: poSupplierId, orderNumber: poNumber.trim(),
      lines: poLines.map((line) => ({ inventoryItemId: line.inventoryItemId, quantityOrdered: Number(line.quantityOrdered), unitCost: Number(line.unitCost) })),
    }, { accessToken }, activeBranchId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders"] }); setPoNumber(""); setPoLines([{ inventoryItemId: "", quantityOrdered: "1", unitCost: "0" }]); setProcurementError(null); },
    onError: (error) => setProcurementError(error instanceof ApiError ? error.message : "Unable to create purchase order."),
  });
  const receiveMutation = useMutation({
    mutationFn: () => receiveInventoryPurchaseOrder(receiveOrderId, {
      receiptNumber: receiptNumber.trim(),
      lines: [{ purchaseOrderLineId: receiveLineId, quantity: Number(receiveQuantity) }],
    }, { accessToken }, activeBranchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "movements"] });
      setReceiveOrderId(""); setReceiveLineId(""); setReceiveQuantity(""); setReceiptNumber(""); setProcurementError(null);
    },
    onError: (error) => setProcurementError(error instanceof ApiError ? error.message : "Unable to record goods receipt."),
  });
  const suppliers = suppliersQuery.data?.suppliers ?? [];
  const purchaseOrders = purchaseOrdersQuery.data?.purchaseOrders ?? [];
  const selectedReceiveOrder = purchaseOrders.find((order: InventoryPurchaseOrder) => order.id === receiveOrderId);
  const outstandingReceiptLines = selectedReceiveOrder?.lines.filter((line) => line.quantityReceived < line.quantityOrdered) ?? [];

  const items = itemsQuery.data?.items ?? [];
  const itemPagination = itemsQuery.data?.pagination;

  const stocks = stockQuery.data?.stocks ?? [];
  const stockPagination = stockQuery.data?.pagination;

  const activeItems = items.filter((item) => item.isActive);

  function closeItemForm() {
    setItemFormOpen(false);
    setEditingItem(null);
    setItemForm(EMPTY_ITEM_FORM);
    setItemFormError(null);
  }

  function openCreateItem() {
    setEditingItem(null);
    setItemForm(EMPTY_ITEM_FORM);
    setItemFormError(null);
    setItemFormOpen(true);
  }

  function openEditItem(item: InventoryItem) {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      sku: item.sku ?? "",
      category: item.category ?? "",
      storageLocation: item.storageLocation ?? "",
      description: item.description ?? "",
      unit: item.unit,
      reorderQuantity: item.reorderQuantity,
      lowStockThreshold: item.lowStockThreshold,
    });
    setItemFormError(null);
    setItemFormOpen(true);
  }

  function submitItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setItemFormError(null);

    if (!itemForm.name.trim()) {
      setItemFormError("Inventory item name is required.");
      return;
    }

    if (!Number.isInteger(itemForm.reorderQuantity) || itemForm.reorderQuantity < 0) {
      setItemFormError("Reorder quantity must be zero or greater.");
      return;
    }

    if (
      !Number.isInteger(itemForm.lowStockThreshold) ||
      itemForm.lowStockThreshold < 0
    ) {
      setItemFormError(
        "Low stock threshold must be zero or greater.",
      );
      return;
    }

    saveItemMutation.mutate();
  }

  function submitMovement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMovementError(null);

    if (!activeBranchId) {
      setMovementError(
        "Select an active branch before recording stock.",
      );
      return;
    }

    const quantity = Number(movementQuantity);

    if (!movementItemId) {
      setMovementError("Select an inventory item.");
      return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setMovementError(
        "Quantity must be a positive whole number.",
      );
      return;
    }

    movementMutation.mutate();
  }

  function submitAdjustment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdjustError(null);

    if (!activeBranchId) {
      setAdjustError(
        "Select an active branch before adjusting stock.",
      );
      return;
    }

    const quantity = Number(adjustQuantity);

    if (!adjustItemId) {
      setAdjustError("Select an inventory item.");
      return;
    }

    if (!Number.isInteger(quantity) || quantity === 0) {
      setAdjustError(
        "Adjustment quantity must be a non-zero whole number.",
      );
      return;
    }

    if (!adjustReason.trim()) {
      setAdjustError("Adjustment reason is required.");
      return;
    }

    adjustMutation.mutate();
  }

  function resetMovementForm() {
    setMovementItemId("");
    setMovementQuantity("");
    setMovementReason("");
    setMovementReference("");
    setMovementError(null);
  }

  function resetAdjustmentForm() {
    setAdjustItemId("");
    setAdjustQuantity("");
    setAdjustReason("");
    setAdjustReference("");
    setAdjustError(null);
  }

  return (
    <main className="inventory-workspace">
      <header className="inventory-header"><div><span className="inventory-eyebrow">OPERATIONS / CONTROL CENTRE</span><h1>Inventory Management</h1><p>Track your catalogue, branch stock levels and every stock movement in one place.</p></div><div className="inventory-header-meta"><span className="inventory-live-dot" /> Live branch data</div></header>

      <section className="inventory-panel inventory-catalogue" aria-label="Inventory items">
        <h2>Inventory Items</h2>

        <div>
          <input
            type="search"
            placeholder="Search inventory items"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setItemPage(1);
            }}
          />

          <select
            aria-label="Filter inventory items by status"
            value={itemStatus}
            onChange={(event) => {
              setItemStatus(
                event.target.value as typeof itemStatus,
              );
              setItemPage(1);
            }}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>

          <button type="button" onClick={openCreateItem}>
            New inventory item
          </button>
        </div>

        {itemsQuery.isLoading && <p>Loading inventory items...</p>}

        {itemsQuery.isError && (
          <p role="alert">
            {itemsQuery.error instanceof ApiError
              ? itemsQuery.error.message
              : "Failed to load inventory items."}
          </p>
        )}

        {itemsQuery.isSuccess && items.length === 0 && (
          <p>
            {search
              ? "No inventory items match your search."
              : "No inventory items found."}
          </p>
        )}

        {items.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Item / SKU</th>
                <th>Category</th>
                <th>Location</th>
                <th>Unit</th>
                <th>Low Stock Threshold</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>

            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => openEditItem(item)}
                    >
                      {item.name}
                    </button>
                    <small className="inventory-item-sku">{item.sku || "No SKU"}</small>
                  </td>
                  <td>{item.category || "—"}</td>
                  <td>{item.storageLocation || "—"}</td>
                  <td>{formatUnit(item.unit)}</td>
                  <td>{item.lowStockThreshold}</td>
                  <td>
                    {item.isActive ? "Active" : "Inactive"}
                  </td>
                  <td>
                    <button
                      type="button"
                      disabled={statusMutation.isPending}
                      onClick={() =>
                        statusMutation.mutate({
                          id: item.id,
                          isActive: !item.isActive,
                        })
                      }
                    >
                      {item.isActive
                        ? "Deactivate"
                        : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {itemPagination && itemPagination.totalPages > 1 && (
          <div>
            <button
              type="button"
              disabled={itemPage <= 1}
              onClick={() =>
                setItemPage((current) => current - 1)
              }
            >
              Previous
            </button>

            <span>
              Page {itemPagination.page} of{" "}
              {itemPagination.totalPages}
            </span>

            <button
              type="button"
              disabled={
                itemPage >= itemPagination.totalPages
              }
              onClick={() =>
                setItemPage((current) => current + 1)
              }
            >
              Next
            </button>
          </div>
        )}
      </section>

      {itemFormOpen && (
        <section className="inventory-panel inventory-editor" aria-label="Inventory item form">
          <h2>
            {editingItem
              ? "Edit inventory item"
              : "New inventory item"}
          </h2>

          <form onSubmit={submitItem}>
            <div>
              <label>
                Item
                <input
                  value={itemForm.name}
                  onChange={(event) =>
                    setItemForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div>
              <label>
                SKU
                <input
                  value={itemForm.sku}
                  onChange={(event) => setItemForm((current) => ({ ...current, sku: event.target.value }))}
                  maxLength={100}
                  placeholder="Optional stock keeping code"
                />
              </label>
            </div>

            <div>
              <label>
                Category
                <input
                  value={itemForm.category}
                  onChange={(event) => setItemForm((current) => ({ ...current, category: event.target.value }))}
                  maxLength={120}
                  placeholder="e.g. Chemicals, Packaging"
                />
              </label>
            </div>

            <div>
              <label>
                Storage Location
                <input
                  value={itemForm.storageLocation}
                  onChange={(event) => setItemForm((current) => ({ ...current, storageLocation: event.target.value }))}
                  maxLength={160}
                  placeholder="e.g. Store A / Shelf 2"
                />
              </label>
            </div>

            <div>
              <label>
                Description
                <textarea
                  value={itemForm.description}
                  onChange={(event) =>
                    setItemForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div>
              <label>
                Unit
                <select
                  value={itemForm.unit}
                  onChange={(event) =>
                    setItemForm((current) => ({
                      ...current,
                      unit: event.target.value as InventoryUnit,
                    }))
                  }
                >
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {formatUnit(unit)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label>
                Reorder Quantity
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={itemForm.reorderQuantity}
                  onChange={(event) => setItemForm((current) => ({ ...current, reorderQuantity: Number(event.target.value) }))}
                />
              </label>
            </div>

            <div>
              <label>
                Low Stock Threshold
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={itemForm.lowStockThreshold}
                  onFocus={(event) => {
                    if (event.currentTarget.value === "0") {
                      event.currentTarget.select();
                    }
                  }}
                  onChange={(event) =>
                    setItemForm((current) => ({
                      ...current,
                      lowStockThreshold: Number(
                        event.target.value,
                      ),
                    }))
                  }
                />
              </label>
            </div>

            {itemFormError && (
              <p role="alert">{itemFormError}</p>
            )}

            <button
              type="submit"
              disabled={saveItemMutation.isPending}
            >
              {saveItemMutation.isPending
                ? "Saving..."
                : editingItem
                  ? "Save changes"
                  : "Create item"}
            </button>

            <button
              type="button"
              onClick={closeItemForm}
              disabled={saveItemMutation.isPending}
            >
              Cancel
            </button>
          </form>
        </section>
      )}

      <section className="inventory-panel inventory-balances" aria-label="Current stock">
        <h2>Current Stock</h2>

        {!activeBranchId && (
          <p role="alert">
            Select an active branch to view and manage stock.
          </p>
        )}

        {activeBranchId && (
          <>
            <label>
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(event) => {
                  setLowStockOnly(event.target.checked);
                  setStockPage(1);
                }}
              />{" "}
              Low stock only
            </label>

            {stockQuery.isLoading && (
              <p>Loading stock...</p>
            )}

            {stockQuery.isError && (
              <p role="alert">
                {stockQuery.error instanceof ApiError
                  ? stockQuery.error.message
                  : "Failed to load stock."}
              </p>
            )}

            {stockQuery.isSuccess && stocks.length === 0 && (
              <p>
                {lowStockOnly
                  ? "No low-stock records found."
                  : "No stock records found for this branch."}
              </p>
            )}

            {stocks.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Unit</th>
                    <th>Quantity</th>
                    <th>Low Stock Threshold</th>
                  </tr>
                </thead>

                <tbody>
                  {stocks.map((stock) => (
                    <tr key={stock.id}>
                      <td>{stock.inventoryItem.name}</td>
                      <td>
                        {formatUnit(stock.inventoryItem.unit)}
                      </td>
                      <td>{stock.quantity}</td>
                      <td>
                        {stock.inventoryItem.lowStockThreshold}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {stockPagination &&
              stockPagination.totalPages > 1 && (
                <div>
                  <button
                    type="button"
                    disabled={stockPage <= 1}
                    onClick={() =>
                      setStockPage((current) => current - 1)
                    }
                  >
                    Previous
                  </button>

                  <span>
                    Page {stockPagination.page} of{" "}
                    {stockPagination.totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={
                      stockPage >= stockPagination.totalPages
                    }
                    onClick={() =>
                      setStockPage((current) => current + 1)
                    }
                  >
                    Next
                  </button>
                </div>
              )}
          </>
        )}
      </section>

      <section className="inventory-panel inventory-movements" aria-label="Stock movement">
        <h2>Receive / Issue Stock</h2>

        <form onSubmit={submitMovement}>
          <div>
            <label>
              Movement
              <select
                value={movementType}
                onChange={(event) =>
                  setMovementType(
                    event.target.value as MovementType,
                  )
                }
                disabled={movementMutation.isPending}
              >
                <option value="RECEIPT">
                  {formatMovementType("RECEIPT")}
                </option>
                <option value="ISSUE">
                  {formatMovementType("ISSUE")}
                </option>
              </select>
            </label>
          </div>

          <div>
            <label>
              Inventory Item
              <select
                value={movementItemId}
                onChange={(event) =>
                  setMovementItemId(event.target.value)
                }
                disabled={
                  movementMutation.isPending ||
                  activeItems.length === 0
                }
              >
                <option value="">Select item</option>
                {activeItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({formatUnit(item.unit)})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <label>
              Quantity
              <input
                type="number"
                min="1"
                step="1"
                value={movementQuantity}
                onChange={(event) =>
                  setMovementQuantity(event.target.value)
                }
                disabled={movementMutation.isPending}
              />
            </label>
          </div>

          <div>
            <label>
              Reason
              <input
                value={movementReason}
                onChange={(event) =>
                  setMovementReason(event.target.value)
                }
                disabled={movementMutation.isPending}
              />
            </label>
          </div>

          <div>
            <label>
              Reference
              <input
                value={movementReference}
                onChange={(event) =>
                  setMovementReference(event.target.value)
                }
                disabled={movementMutation.isPending}
              />
            </label>
          </div>

          {movementError && (
            <p role="alert">{movementError}</p>
          )}

          <button
            type="submit"
            disabled={
              movementMutation.isPending ||
              !activeBranchId
            }
          >
            {movementMutation.isPending
              ? "Saving..."
              : movementType === "RECEIPT"
                ? "Receive Stock"
                : "Issue Stock"}
          </button>

          <button
            type="button"
            onClick={resetMovementForm}
            disabled={movementMutation.isPending}
          >
            Clear
          </button>
        </form>
      </section>

      <section className="inventory-panel inventory-adjustments" aria-label="Stock adjustment">
        <h2>Adjust Stock</h2>

        <form onSubmit={submitAdjustment}>
          <div>
            <label>
              Inventory Item
              <select
                value={adjustItemId}
                onChange={(event) =>
                  setAdjustItemId(event.target.value)
                }
                disabled={
                  adjustMutation.isPending ||
                  activeItems.length === 0
                }
              >
                <option value="">Select item</option>
                {activeItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({formatUnit(item.unit)})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <label>
              Adjustment Quantity
              <input
                type="number"
                step="1"
                value={adjustQuantity}
                onChange={(event) =>
                  setAdjustQuantity(event.target.value)
                }
                disabled={adjustMutation.isPending}
                placeholder="Positive or negative"
              />
            </label>
          </div>

          <div>
            <label>
              Reason
              <input
                value={adjustReason}
                onChange={(event) =>
                  setAdjustReason(event.target.value)
                }
                disabled={adjustMutation.isPending}
              />
            </label>
          </div>

          <div>
            <label>
              Reference
              <input
                value={adjustReference}
                onChange={(event) =>
                  setAdjustReference(event.target.value)
                }
                disabled={adjustMutation.isPending}
              />
            </label>
          </div>

          {adjustError && (
            <p role="alert">{adjustError}</p>
          )}

          <button
            type="submit"
            disabled={
              adjustMutation.isPending ||
              !activeBranchId
            }
          >
            {adjustMutation.isPending
              ? "Adjusting..."
              : "Adjust Stock"}
          </button>

          <button
            type="button"
            onClick={resetAdjustmentForm}
            disabled={adjustMutation.isPending}
          >
            Clear
          </button>
        </form>
      </section>

      <section className="inventory-panel inventory-ledger" aria-label="Stock movement history">
        <div className="inventory-ledger-heading">
          <div>
            <h2>Stock Movement History</h2>
            <p>Auditable, branch-specific record of receipts, issues and adjustments.</p>
          </div>
          <label>
            Filter by item
            <select
              aria-label="Filter movement history by item"
              value={movementHistoryItemId}
              onChange={(event) => {
                setMovementHistoryItemId(event.target.value);
                setMovementHistoryPage(1);
              }}
              disabled={!activeBranchId}
            >
              <option value="">All inventory items</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
        </div>

        {!activeBranchId ? (
          <p>Select an active branch to view movement history.</p>
        ) : movementHistoryQuery.isLoading ? (
          <p>Loading movement history...</p>
        ) : movementHistoryQuery.isError ? (
          <p role="alert">
            {movementHistoryQuery.error instanceof ApiError
              ? movementHistoryQuery.error.message
              : "Failed to load stock movement history."}
          </p>
        ) : movementHistoryQuery.isSuccess && movementHistoryQuery.data.movements.length === 0 ? (
          <p>No stock movements have been recorded for this selection.</p>
        ) : movementHistoryQuery.isSuccess ? (
          <>
            <table>
              <thead>
                <tr>
                  <th>Date &amp; time</th>
                  <th>Item</th>
                  <th>Movement</th>
                  <th>Quantity</th>
                  <th>Balance after</th>
                  <th>Reason</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {movementHistoryQuery.data.movements.map((movement: InventoryMovement) => (
                  <tr key={movement.id}>
                    <td>{new Date(movement.createdAt).toLocaleString()}</td>
                    <td>{movement.inventoryItem?.name ?? "Inventory item"}</td>
                    <td>{formatMovementType(movement.type)}</td>
                    <td>{movement.quantity > 0 ? "+" : ""}{movement.quantity}</td>
                    <td>{movement.resultingQuantity}</td>
                    <td>{movement.reason ?? "—"}</td>
                    <td>{movement.reference ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {movementHistoryQuery.data.pagination.totalPages > 1 ? (
              <div className="inventory-ledger-pagination">
                <button
                  type="button"
                  disabled={movementHistoryPage <= 1}
                  onClick={() => setMovementHistoryPage((current) => current - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {movementHistoryQuery.data.pagination.page} of {movementHistoryQuery.data.pagination.totalPages}
                </span>
                <button
                  type="button"
                  disabled={movementHistoryPage >= movementHistoryQuery.data.pagination.totalPages}
                  onClick={() => setMovementHistoryPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="inventory-panel inventory-procurement" aria-label="Suppliers and procurement">
        <div className="inventory-ledger-heading">
          <div><h2>Suppliers &amp; Procurement</h2><p>Raise branch purchase orders and record full or partial deliveries directly into stock.</p></div>
          <span className="inventory-procurement-count">{purchaseOrders.length} recent orders</span>
        </div>
        <div className="inventory-procurement-grid">
          <form onSubmit={(event) => { event.preventDefault(); setProcurementError(null); if (supplierName.trim()) supplierMutation.mutate(); }}>
            <h3>Add supplier</h3>
            <label>Supplier name<input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} required maxLength={200} /></label>
            <label>Phone<input value={supplierPhone} onChange={(event) => setSupplierPhone(event.target.value)} maxLength={40} /></label>
            <label>Email<input type="email" value={supplierEmail} onChange={(event) => setSupplierEmail(event.target.value)} maxLength={254} /></label>
            <button type="submit" disabled={supplierMutation.isPending}>{supplierMutation.isPending ? "Saving..." : "Save supplier"}</button>
          </form>
          <form onSubmit={(event) => { event.preventDefault(); setProcurementError(null); if (!activeBranchId || !poSupplierId || !poNumber.trim() || poLines.some((line) => !line.inventoryItemId || !Number.isInteger(Number(line.quantityOrdered)) || Number(line.quantityOrdered) <= 0 || !Number.isInteger(Number(line.unitCost)) || Number(line.unitCost) < 0) || new Set(poLines.map((line) => line.inventoryItemId)).size !== poLines.length) { setProcurementError("Complete every purchase order line with a unique item, valid quantity and non-negative unit cost."); return; } purchaseOrderMutation.mutate(); }}>
            <h3>Create purchase order</h3>
            <label>Supplier<select value={poSupplierId} onChange={(event) => setPoSupplierId(event.target.value)} required><option value="">Select supplier</option>{suppliers.filter((supplier) => supplier.isActive).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
            <label>Order number<input value={poNumber} onChange={(event) => setPoNumber(event.target.value)} required maxLength={100} /></label>
            {poLines.map((line, index) => <div className="inventory-po-line" key={index}>
              <strong>Line {index + 1}</strong>
              <label>Inventory item<select value={line.inventoryItemId} onChange={(event) => setPoLines((current) => current.map((entry, i) => i === index ? { ...entry, inventoryItemId: event.target.value } : entry))} required><option value="">Select item</option>{activeItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Quantity<input aria-label={`Order line ${index + 1} quantity`} type="number" min="1" step="1" value={line.quantityOrdered} onChange={(event) => setPoLines((current) => current.map((entry, i) => i === index ? { ...entry, quantityOrdered: event.target.value } : entry))} required /></label>
              <label>Unit cost<input aria-label={`Order line ${index + 1} unit cost`} type="number" min="0" step="1" value={line.unitCost} onChange={(event) => setPoLines((current) => current.map((entry, i) => i === index ? { ...entry, unitCost: event.target.value } : entry))} required /></label>
              {poLines.length > 1 && <button type="button" className="inventory-po-remove" onClick={() => setPoLines((current) => current.filter((_, i) => i !== index))}>Remove line</button>}
            </div>)}
            <button type="button" className="inventory-po-add" onClick={() => setPoLines((current) => [...current, { inventoryItemId: "", quantityOrdered: "1", unitCost: "0" }])} disabled={poLines.length >= 50}>+ Add another item</button>
            <button type="submit" disabled={purchaseOrderMutation.isPending || !activeBranchId || suppliers.length === 0 || activeItems.length === 0}>{purchaseOrderMutation.isPending ? "Creating..." : "Create purchase order"}</button>
          </form>
        </div>
        {procurementError && <p role="alert">{procurementError}</p>}
        <h3>Purchase orders</h3>
        {!activeBranchId ? <p>Select a branch to manage purchase orders.</p> : purchaseOrdersQuery.isLoading ? <p>Loading purchase orders...</p> : purchaseOrdersQuery.isError ? <p role="alert">Unable to load purchase orders.</p> : purchaseOrders.length === 0 ? <p>No purchase orders have been raised for this branch.</p> : (
          <table><thead><tr><th>Order</th><th>Supplier</th><th>Items received</th><th>Status</th><th>Ordered</th></tr></thead><tbody>
            {purchaseOrders.map((order: InventoryPurchaseOrder) => <tr key={order.id}><td>{order.orderNumber}</td><td>{order.supplier.name}</td><td>{order.lines.map((line) => `${line.inventoryItem.name}: ${line.quantityReceived}/${line.quantityOrdered}`).join(", ")}</td><td>{order.status.replaceAll("_", " ")}</td><td>{order.orderedAt ? new Date(order.orderedAt).toLocaleDateString() : "—"}</td></tr>)}
          </tbody></table>
        )}
        <form onSubmit={(event) => { event.preventDefault(); if (!receiveOrderId || !receiveLineId || !receiptNumber.trim() || !Number.isInteger(Number(receiveQuantity)) || Number(receiveQuantity) <= 0) { setProcurementError("Choose an outstanding order line and enter a valid receipt quantity and reference."); return; } receiveMutation.mutate(); }}>
          <h3>Record goods received</h3>
          <label>Purchase order<select value={receiveOrderId} onChange={(event) => { setReceiveOrderId(event.target.value); setReceiveLineId(""); }} required><option value="">Select order</option>{purchaseOrders.filter((order) => order.status === "ORDERED" || order.status === "PARTIALLY_RECEIVED").map((order) => <option key={order.id} value={order.id}>{order.orderNumber} — {order.supplier.name}</option>)}</select></label>
          <label>Outstanding item<select value={receiveLineId} onChange={(event) => setReceiveLineId(event.target.value)} required><option value="">Select item</option>{outstandingReceiptLines.map((line) => <option key={line.id} value={line.id}>{line.inventoryItem.name} — {line.quantityOrdered - line.quantityReceived} outstanding</option>)}</select></label>
          <label>Quantity received<input type="number" min="1" step="1" value={receiveQuantity} onChange={(event) => setReceiveQuantity(event.target.value)} required /></label>
          <label>Goods receipt reference<input value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} required maxLength={100} /></label>
          <button type="submit" disabled={receiveMutation.isPending || !activeBranchId}>{receiveMutation.isPending ? "Recording..." : "Record delivery"}</button>
        </form>
      </section>
    </main>
  );
}

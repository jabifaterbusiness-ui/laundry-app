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
  updateInventoryItem,
  type InventoryItem,
  type InventoryUnit,
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
  description: "",
  unit: "PIECE" as InventoryUnit,
  lowStockThreshold: 0,
};

type MovementType = "RECEIPT" | "ISSUE";

function formatUnit(unit: InventoryUnit) {
  return unit.charAt(0) + unit.slice(1).toLowerCase();
}

function formatMovementType(type: MovementType) {
  return type === "RECEIPT" ? "Receive" : "Issue";
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
        description: itemForm.description.trim() || undefined,
        unit: itemForm.unit,
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
      description: item.description ?? "",
      unit: item.unit,
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
                <th>Item</th>
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
                  </td>
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
    </main>
  );
}

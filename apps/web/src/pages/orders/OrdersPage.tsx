import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Customer,
  Order,
  OrderStatus,
} from "@laundry-app/shared";
import { ApiError } from "../../lib/api-client.js";
import {
  createOrderWithOfflineQueue,
  listOrders,
  updateOrderStatusWithOfflineQueue,
} from "../../lib/orders-api.js";
import { listCustomers } from "../../lib/customers-api.js";
import { listServices, type Service } from "../../lib/services-api.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";
import { useOrderWorkspaceStore } from "../../state/order-workspace-store.js";
import { loadOrderWorkspaceState } from "../../lib/order-workspace-persistence.js";
import { OrderWorkspaceSwitcher } from "./OrderWorkspaceSwitcher.js";

const PAGE_SIZE = 25;

const STATUSES: OrderStatus[] = [
  "RECEIVED",
  "IN_PROGRESS",
  "READY_FOR_PICKUP",
  "COMPLETED",
  "CANCELLED",
];

interface OrderLine {
  serviceId: string;
  quantity: number;
  colors: string[];
}

function formatMoney(value: number) {
  return `₦${value.toLocaleString()}`;
}

function formatDate(value: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString();
}

function statusLabel(status: OrderStatus) {
  return status.replaceAll("_", " ");
}

export function OrdersPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const workspaces = useOrderWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useOrderWorkspaceStore(
    (s) => s.activeWorkspaceId,
  );
  const openWorkspace = useOrderWorkspaceStore(
    (s) => s.openWorkspace,
  );
  const switchWorkspace = useOrderWorkspaceStore(
    (s) => s.switchWorkspace,
  );
  const closeWorkspace = useOrderWorkspaceStore(
    (s) => s.closeWorkspace,
  );
  const updateWorkspace = useOrderWorkspaceStore(
    (s) => s.updateWorkspace,
  );
    const restoreWorkspaces = useOrderWorkspaceStore(
      (s) => s.restoreWorkspaces,
    );

  const activeWorkspace =
    workspaces.find(
      (workspace) => workspace.id === activeWorkspaceId,
    ) ?? null;

  useEffect(() => {
    if (!user?.businessId || !activeBranchId) {
      return;
    }

    const saved = loadOrderWorkspaceState(
      user.businessId,
      user.id,
      activeBranchId,
    );

    if (saved && saved.workspaces.length > 0) {
      restoreWorkspaces(
        saved.workspaces,
        saved.activeWorkspaceId,
      );
    }
  }, [
    user?.businessId,
    user?.id,
    activeBranchId,
    restoreWorkspaces,
  ]);


  const canCreateOrder = hasPermission(user, "orders.create");
  const canUpdateStatus = hasPermission(user, "orders.change_status");

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [customerId, setCustomerId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const ordersQuery = useQuery({
    queryKey: [
      "orders",
      {
        page,
        status,
        customerId,
        branchId: activeBranchId,
      },
    ],
    queryFn: () =>
      listOrders(
        {
          page,
          pageSize: PAGE_SIZE,
          status: status || undefined,
          customerId: customerId || undefined,
        },
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(accessToken && activeBranchId),
  });

  const customersQuery = useQuery({
    queryKey: ["customers", "order-selector"],
    queryFn: () =>
      listCustomers(
        {
          page: 1,
          pageSize: 100,
          status: "active",
        },
        { accessToken },
      ),
    enabled: Boolean(accessToken),
  });

  const servicesQuery = useQuery({
    queryKey: ["services", "order-selector"],
    queryFn: () =>
      listServices(
        {
          status: "active",
        },
        { accessToken },
      ),
    enabled: Boolean(accessToken),
  });

  const createMutation = useMutation({
    mutationKey: ["orders"],
    mutationFn: () =>
      createOrderWithOfflineQueue(
        {
          customerId: formCustomerId,
          items: lines.map((line) => ({
            serviceId: line.serviceId,
            quantity: line.quantity,
            colors: line.colors ?? [],
          })),
          garmentNote: garmentNote.trim() || undefined,
          internalNote: internalNote.trim() || undefined,
          expectedReadyAt: expectedReadyAt
            ? new Date(expectedReadyAt).toISOString()
            : undefined,
        },
        { accessToken },
        {
          businessId: user?.businessId ?? "",
          branchId: activeBranchId ?? "",
          actorUserId: user?.id ?? "",
        },
      ),
    onSuccess: (result) => {
      if (result.queued) {
        setFormError(
          "Order saved offline and will be synchronized when the connection is restored.",
        );
        return;
      }

      const order = result.order;

      queryClient.invalidateQueries({ queryKey: ["orders"] });

      if (activeWorkspaceId) {
        updateWorkspace(activeWorkspaceId, {
          activeOrder: order,
          draft: {
            lines: [{ serviceId: "", quantity: 1, colors: [] }],
            garmentNote: "",
            internalNote: "",
            expectedReadyAt: "",
          },
        });
      }

      setFormOpen(false);
      setFormError(null);
      setSelectedOrder(order);
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Unable to create order. Please try again.",
      );
    },
  });

  const statusMutation = useMutation({
    mutationKey: ["orders"],
    mutationFn: (input: { id: string; status: OrderStatus }) =>
      updateOrderStatusWithOfflineQueue(
        input.id,
        input.status,
        { accessToken },
        {
          businessId: user?.businessId ?? "",
          branchId: activeBranchId ?? "",
          actorUserId: user?.id ?? "",
        },
      ),
    onSuccess: (result) => {
      if (result.queued) {
        setFormError(
          "Order update saved offline and will be synchronized when the connection is restored.",
        );
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setSelectedOrder(result.order);
    },
  });

  const customers = customersQuery.data?.data ?? [];
  const services = servicesQuery.data?.data ?? [];
  const orders = ordersQuery.data?.data ?? [];
  const pagination = ordersQuery.data?.pagination;

  const selectedServices = useMemo(() => {
    const map = new Map<string, Service>();

    for (const service of services) {
      map.set(service.id, service);
    }

    return map;
  }, [services]);

  const formCustomerId =
    activeWorkspace?.draft.customerId ?? "";

  const lines =
    activeWorkspace?.draft.lines ?? [
      { serviceId: "", quantity: 1, colors: [] },
    ];

  const garmentNote =
    activeWorkspace?.draft.garmentNote ?? "";

  const internalNote =
    activeWorkspace?.draft.internalNote ?? "";

  const expectedReadyAt =
    activeWorkspace?.draft.expectedReadyAt ?? "";

  const formTotal = lines.reduce((sum, line) => {
    const service = selectedServices.get(line.serviceId);
    return sum + (service ? line.quantity * service.unitPrice : 0);
  }, 0);

  function closeForm() {
    setFormOpen(false);
    setFormError(null);
  }

  function openCreate() {
    setSelectedOrder(null);
    setFormError(null);
    setFormOpen(true);
  }

  function openCustomerWorkspace(customer: Customer) {
    const workspaceId = openWorkspace(customer);
    switchWorkspace(workspaceId);
    setSelectedOrder(null);
    setFormError(null);
    setFormOpen(true);
  }

  function addLine() {
    if (!activeWorkspaceId) return;

    updateWorkspace(activeWorkspaceId, {
      draft: {
        lines: [
          ...lines,
          { serviceId: "", quantity: 1, colors: [] },
        ],
      },
    });
  }

  function removeLine(index: number) {
    if (!activeWorkspaceId) return;

    updateWorkspace(activeWorkspaceId, {
      draft: {
        lines: lines.filter((_, i) => i !== index),
      },
    });
  }

  function updateLine(
    index: number,
    field: keyof OrderLine,
    value: OrderLine[typeof field],
  ) {
    if (!activeWorkspaceId) return;

    updateWorkspace(activeWorkspaceId, {
      draft: {
        lines: lines.map((line, i) =>
          i === index
            ? {
                ...line,
                [field]: value,
              }
            : line,
        ),
      },
    });
  }

  function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!activeWorkspaceId || !formCustomerId) {
      setFormError("Select or add a customer before creating an order.");
      return;
    }

    if (lines.length === 0) {
      setFormError("An order must contain at least one item.");
      return;
    }

    if (lines.some((line) => !line.serviceId)) {
      setFormError("Select a service for every order line.");
      return;
    }

    if (
      lines.some(
        (line) =>
          !Number.isInteger(line.quantity) ||
          line.quantity < 1,
      )
    ) {
      setFormError(
        "Every quantity must be a positive whole number.",
      );
      return;
    }

    createMutation.mutate();
  }

  return (
    <main>
      <h1>Orders</h1>

      <OrderWorkspaceSwitcher
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onOpenCustomer={() => {
          if (customers.length === 0) {
            setFormError("No active customers are available.");
            return;
          }

          setFormError(null);
          setFormOpen(true);
        }}
        onSwitch={(workspaceId) => {
          switchWorkspace(workspaceId);

          const workspace = workspaces.find(
            (item) => item.id === workspaceId,
          );

          setSelectedOrder(workspace?.activeOrder ?? null);
          setFormOpen(!workspace?.activeOrder);
          setFormError(null);
        }}
        onClose={(workspaceId) => {
          const closingActive =
            workspaceId === activeWorkspaceId;

          closeWorkspace(workspaceId);

          if (closingActive) {
            setSelectedOrder(null);
            setFormOpen(false);
            setFormError(null);
          }
        }}
      />

      <div>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as OrderStatus | "");
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((item) => (
            <option key={item} value={item}>
              {statusLabel(item)}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by customer"
          value={customerId}
          onChange={(event) => {
            setCustomerId(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All customers</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name} — {customer.phone}
            </option>
          ))}
        </select>

        {canCreateOrder ? (
          <button type="button" onClick={openCreate}>
            New order
          </button>
        ) : null}
      </div>

      {ordersQuery.isLoading && <p>Loading orders...</p>}

      {ordersQuery.isError && (
        <p role="alert">
          {ordersQuery.error instanceof ApiError
            ? ordersQuery.error.message
            : "Failed to load orders. Please try again."}
        </p>
      )}

      {ordersQuery.isSuccess && orders.length === 0 && (
        <p>No orders found.</p>
      )}

      {orders.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Total</th>
              <th>Expected Ready</th>
              <th>Created</th>
            </tr>
          </thead>

          <tbody>
            {orders.map((order) => {
              const customer = customers.find(
                (item) => item.id === order.customerId,
              );

              return (
                <tr key={order.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOrder(order);

                        const customer = customers.find(
                          (item) => item.id === order.customerId,
                        );

                        if (customer) {
                          const workspaceId = openWorkspace(
                            customer,
                            { order },
                          );
                          switchWorkspace(workspaceId);
                        }
                      }}
                    >
                      {order.orderNumber}
                    </button>
                  </td>
                  <td>
                    {customer?.name ?? order.customerId}
                  </td>
                  <td>{statusLabel(order.status)}</td>
                  <td>{formatMoney(order.orderTotal)}</td>
                  <td>{formatDate(order.expectedReadyAt)}</td>
                  <td>{formatDate(order.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>

          <span>
            Page {pagination.page} of {pagination.totalPages}
          </span>

          <button
            type="button"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      )}

      {formOpen && (
        <section>
          <h2>New order</h2>

          <form onSubmit={submitOrder}>
            <div>
              <label>
                Customer
                <select
                  value={formCustomerId}
                  onChange={(event) => {
                    const customer = customers.find(
                      (item) => item.id === event.target.value,
                    );

                    if (!customer) {
                      return;
                    }

                    openCustomerWorkspace(customer);
                  }}
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} — {customer.phone}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <h3>Items</h3>

            <table>
              <thead>
                <tr>
                  <th>QTY</th>
                  <th>Item</th>
                  <th>Colors</th>
                  <th>PCS</th>
                  <th>Unit Price</th>
                  <th>Total Price</th>
                  <th aria-label="Remove" />
                </tr>
              </thead>

              <tbody>
                {lines.map((line, index) => {
                  const service = selectedServices.get(
                    line.serviceId,
                  );

                  const totalPieces = service
                    ? line.quantity * service.pieces
                    : 0;

                  const lineTotal = service
                    ? line.quantity * service.unitPrice
                    : 0;

                  return (
                    <tr key={`${index}-${line.serviceId}`}>
                      <td>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={line.quantity}
                          onChange={(event) =>
                            updateLine(
                              index,
                              "quantity",
                              Number(event.target.value),
                            )
                          }
                        />
                      </td>

                      <td>
                        <select
                          value={line.serviceId}
                          onChange={(event) =>
                            updateLine(
                              index,
                              "serviceId",
                              event.target.value,
                            )
                          }
                        >
                          <option value="">
                            Select service
                          </option>

                          {services.map((item) => (
                            <option
                              key={item.id}
                              value={item.id}
                            >
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <input
                          type="text"
                          value={(line.colors ?? []).join(", ")}
                          onChange={(event) =>
                            updateLine(
                              index,
                              "colors",
                              event.target.value
                                .split(",")
                                .map((color) => color.trim())
                                .filter(Boolean),
                            )
                          }
                          placeholder="White, Blue, Black"
                          aria-label={`Colors for item ${index + 1}`}
                        />
                      </td>

                      <td>{totalPieces}</td>

                      <td>
                        {service
                          ? formatMoney(service.unitPrice)
                          : "-"}
                      </td>

                      <td>{formatMoney(lineTotal)}</td>

                      <td>
                        <button
                          type="button"
                          disabled={lines.length === 1}
                          onClick={() => removeLine(index)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <button type="button" onClick={addLine}>
              Add item
            </button>

            <p>
              <strong>Order Total: {formatMoney(formTotal)}</strong>
            </p>

            <div>
              <label>
                Expected Ready
                <input
                  type="datetime-local"
                  value={expectedReadyAt}
                  onChange={(event) => {
                    if (!activeWorkspaceId) return;

                    updateWorkspace(activeWorkspaceId, {
                      draft: {
                        expectedReadyAt: event.target.value,
                      },
                    });
                  }}
                />
              </label>
            </div>

            <div>
              <label>
                Garment / Customer Note
                <textarea
                  value={garmentNote}
                  onChange={(event) => {
                    if (!activeWorkspaceId) return;

                    updateWorkspace(activeWorkspaceId, {
                      draft: {
                        garmentNote: event.target.value,
                      },
                    });
                  }}
                  maxLength={2000}
                />
              </label>
            </div>

            <div>
              <label>
                Internal Note
                <textarea
                  value={internalNote}
                  onChange={(event) => {
                    if (!activeWorkspaceId) return;

                    updateWorkspace(activeWorkspaceId, {
                      draft: {
                        internalNote: event.target.value,
                      },
                    });
                  }}
                  maxLength={2000}
                />
              </label>
            </div>

            {formError && <p role="alert">{formError}</p>}

            <button
              type="submit"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending
                ? "Creating..."
                : "Create order"}
            </button>

            <button type="button" onClick={closeForm}>
              Cancel
            </button>
          </form>
        </section>
      )}

      {selectedOrder && (
        <section>
          <h2>Order {selectedOrder.orderNumber}</h2>

          <p>
            Status: {statusLabel(selectedOrder.status)}
          </p>

          <p>
            Total: {formatMoney(selectedOrder.orderTotal)}
          </p>

          <p>
            Expected Ready:{" "}
            {formatDate(selectedOrder.expectedReadyAt)}
          </p>

          <table>
            <thead>
              <tr>
                <th>QTY</th>
                <th>Item</th>
                <th>PCS</th>
                <th>Unit Price</th>
                <th>Total Price</th>
              </tr>
            </thead>

            <tbody>
              {selectedOrder.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.quantity}</td>
                  <td>{item.serviceName}</td>
                  <td>{item.totalPieces}</td>
                  <td>{formatMoney(item.unitPrice)}</td>
                  <td>{formatMoney(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {selectedOrder.garmentNote && (
            <p>
              <strong>Garment Note:</strong>{" "}
              {selectedOrder.garmentNote}
            </p>
          )}

          {canUpdateStatus && (
            <label>
              Update status
              <select
                value={selectedOrder.status}
                disabled={statusMutation.isPending}
                onChange={(event) =>
                  statusMutation.mutate({
                    id: selectedOrder.id,
                    status: event.target.value as OrderStatus,
                  })
                }
              >
                {STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {statusLabel(item)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {canUpdateStatus && selectedOrder.internalNote && (
            <p>
              <strong>Internal Note:</strong>{" "}
              {selectedOrder.internalNote}
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setSelectedOrder(null);

              if (activeWorkspaceId) {
                updateWorkspace(activeWorkspaceId, {
                  activeOrder: null,
                });
              }
            }}
          >
            Close
          </button>
        </section>
      )}
    </main>
  );
}

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Customer, Order, OrderStatus } from "@laundry-app/shared";
import { ApiError } from "../../lib/api-client.js";
import { getCustomer, updateCustomer } from "../../lib/customers-api.js";
import {
  getCompanyReceipt,
  getCustomerReceipt,
  getInvoiceByOrder,
} from "../../lib/invoices-api.js";
import { getBusinessBranding } from "../../lib/businesses-api.js";
import { getCustomerAccount } from "../../lib/customer-account-api.js";
import {
  createPayment,
  getInvoicePaymentSummary,
  type PaymentMethod,
} from "../../lib/payments-api.js";
import {
  SensitiveAuthorizationProvider,
  useSensitiveAuthorization,
} from "../../components/auth/SensitiveAuthorizationProvider.js";
import { CustomerReceipt } from "../invoices/receipt/CustomerReceipt.js";
import { CompanyReceipt } from "../invoices/receipt/CompanyReceipt.js";
import {
  getOrder,
  listAllOrders,
  updateOrderStatusWithOfflineQueue,
} from "../../lib/orders-api.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";

const STATUSES: OrderStatus[] = [
  "RECEIVED",
  "IN_PROGRESS",
  "READY_FOR_PICKUP",
  "COMPLETED",
  "CANCELLED",
];

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

interface OrderManagementProps {
  order: Order | null;
  customer: Customer;
  mode: "view" | "new";
  newOrderContent?: ReactNode;
  onBack: () => void;
  onNewOrder: (customer: Customer) => void;
  onSelectOrder: (order: Order) => void;
}

function OrderManagementContent({
  order,
  customer,
  mode,
  newOrderContent,
  onBack,
  onNewOrder,
  onSelectOrder,
}: OrderManagementProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { requestSensitiveAuthorization } = useSensitiveAuthorization();

  const [layer, setLayer] = useState<
    "none" | "edit" | "history" | "notes" | "payment" | "print" | "status" | "more"
  >("none");
  const [dirty, setDirty] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [address, setAddress] = useState(customer.address ?? "");
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [printInvoiceId, setPrintInvoiceId] = useState<string | null>(null);
  const [printMode, setPrintMode] =
    useState<"customer" | "company" | null>(null);

  const canUpdateCustomer = hasPermission(user, "customers.update");
  const canUpdateStatus = hasPermission(user, "orders.change_status");
  const canViewPayments = hasPermission(user, "payments.view");
  const canManagePayments = hasPermission(user, "payments.manage");
  const canViewAccount = hasPermission(user, "customer_accounts.view");
  const canViewInvoices = hasPermission(user, "invoices.view");

  const customerQuery = useQuery({
    queryKey: ["customer", customer.id, "order-management"],
    queryFn: () => getCustomer(customer.id, { accessToken }),
    enabled: Boolean(accessToken && customer.id),
    initialData: customer,
  });

  const currentCustomer = customerQuery.data ?? customer;

  const invoiceQuery = useQuery({
    queryKey: ["order-management", "invoice", order?.id, activeBranchId],
    queryFn: () =>
      getInvoiceByOrder(order!.id, { accessToken }, activeBranchId),
    enabled: Boolean(
      accessToken &&
        activeBranchId &&
        mode === "view" &&
        order?.id &&
        canViewInvoices,
    ),
  });

  const paymentSummaryQuery = useQuery({
    queryKey: [
      "order-management",
      "invoice-payment-summary",
      invoiceQuery.data?.id,
      activeBranchId,
    ],
    queryFn: () =>
      getInvoicePaymentSummary(
        invoiceQuery.data!.id,
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(
      accessToken &&
        activeBranchId &&
        invoiceQuery.data?.id &&
        canViewPayments,
    ),
  });

  const accountQuery = useQuery({
    queryKey: ["order-management", "customer-account", currentCustomer.id],
    queryFn: () =>
      getCustomerAccount(currentCustomer.id, { accessToken }),
    enabled: Boolean(
      accessToken &&
        currentCustomer.id &&
        canViewAccount &&
        paymentMethod === "PAY_FROM_ACCOUNT",
    ),
  });

  const brandingQuery = useQuery({
    queryKey: ["order-management", "business-branding", activeBranchId],
    queryFn: () => getBusinessBranding({ accessToken }, activeBranchId),
    enabled: Boolean(accessToken && activeBranchId && printInvoiceId),
  });

  const customerReceiptQuery = useQuery({
    queryKey: [
      "order-management",
      "invoice-receipt",
      "customer",
      printInvoiceId,
      activeBranchId,
    ],
    queryFn: () =>
      getCustomerReceipt(
        printInvoiceId!,
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(
      accessToken &&
        activeBranchId &&
        printInvoiceId &&
        printMode === "customer",
    ),
  });

  const companyReceiptQuery = useQuery({
    queryKey: [
      "order-management",
      "invoice-receipt",
      "company",
      printInvoiceId,
      activeBranchId,
    ],
    queryFn: () =>
      getCompanyReceipt(
        printInvoiceId!,
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(
      accessToken &&
        activeBranchId &&
        printInvoiceId &&
        printMode === "company",
    ),
  });

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!invoiceQuery.data) {
        throw new Error("No invoice is available for this order.");
      }

      if (!canManagePayments) {
        throw new Error("You do not have permission to manage payments.");
      }

      const amount = Number(paymentAmount);

      if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error("Enter a valid whole-number payment amount.");
      }

      const summary = paymentSummaryQuery.data;

      if (!summary) {
        throw new Error("Payment balance is not available.");
      }

      if (amount > summary.balance) {
        throw new Error(
          `Payment cannot exceed the outstanding balance of ${formatMoney(summary.balance)}.`,
        );
      }

      if (
        paymentMethod === "PAY_FROM_ACCOUNT" &&
        !canViewAccount
      ) {
        throw new Error(
          "You do not have permission to use Pay from Account.",
        );
      }

      if (
        paymentMethod === "PAY_FROM_ACCOUNT" &&
        (!accountQuery.data ||
          amount > accountQuery.data.balance)
      ) {
        throw new Error(
          "The customer's account balance is insufficient for this payment.",
        );
      }

      const authorization = await requestSensitiveAuthorization();

      if (!authorization) {
        throw new Error(
          "Payment authorization was cancelled or not provided.",
        );
      }

      return createPayment(
        {
          invoiceId: invoiceQuery.data.id,
          amount,
          method: paymentMethod,
          reference: paymentReference.trim() || undefined,
          note: paymentNote.trim() || undefined,
        },
        {
          accessToken,
          sensitiveAuthorization: authorization,
        },
        activeBranchId,
      );
    },
    onSuccess: () => {
      setPaymentAmount("");
      setPaymentReference("");
      setPaymentNote("");
      setPaymentMethod("CASH");
      setPaymentError(null);
      setLayer("none");

      queryClient.invalidateQueries({
        queryKey: [
          "order-management",
          "invoice-payment-summary",
          invoiceQuery.data?.id,
        ],
      });

      queryClient.invalidateQueries({
        queryKey: ["order-management", "customer-account"],
      });

      queryClient.invalidateQueries({
        queryKey: ["customer-workstation", "invoice-payment-summaries"],
      });
    },
    onError: (err) => {
      setPaymentError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to record payment.",
      );
    },
  });

  const historyQuery = useQuery({
    queryKey: ["orders", "customer-history", customer.id, activeBranchId],
    queryFn: () =>
      listAllOrders(
        { customerId: customer.id },
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(accessToken && activeBranchId && customer.id),
  });

  const statusMutation = useMutation({
    mutationFn: (status: OrderStatus) =>
      updateOrderStatusWithOfflineQueue(
        order!.id,
        status,
        { accessToken },
        {
          businessId: user?.businessId ?? "",
          branchId: activeBranchId ?? "",
          actorUserId: user?.id ?? "",
        },
      ),
    onSuccess: (result) => {
      if (!result.queued) {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({
          queryKey: ["orders", "customer-history", customer.id],
        });
        onSelectOrder(result.order);
      }
      setLayer("none");
      setError(
        result.queued
          ? "Status saved offline and will synchronize when the connection is restored."
          : null,
      );
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to update order status.",
      );
    },
  });

  const customerMutation = useMutation({
    mutationFn: () =>
      updateCustomer(
        customer.id,
        {
          phone: phone.trim(),
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        { accessToken },
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(["customer", customer.id], updated);
      queryClient.setQueryData(
        ["customer", customer.id, "order-management"],
        updated,
      );
      setDirty(false);
      setLayer("none");
      setError(null);
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to update customer details.",
      );
    },
  });

  const history = useMemo(() => {
    const rows = historyQuery.data ?? [];
    return rows.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime(),
    );
  }, [historyQuery.data]);

  function requestBack() {
    if (dirty) {
      setWarningOpen(true);
      return;
    }

    if (layer !== "none") {
      setLayer("none");
      return;
    }

    onBack();
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      requestBack();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function beginEdit() {
    setPhone(currentCustomer.phone ?? "");
    setEmail(currentCustomer.email ?? "");
    setAddress(currentCustomer.address ?? "");
    setNotes(currentCustomer.notes ?? "");
    setError(null);
    setLayer("edit");
  }

  useEffect(() => {
    if (!printInvoiceId || !printMode) return;

    const ready =
      printMode === "customer"
        ? customerReceiptQuery.data
        : companyReceiptQuery.data;

    if (!ready) return;

    const className =
      printMode === "customer"
        ? "printing-customer"
        : "printing-company";

    document.body.classList.add(className);

    const cleanup = () => {
      document.body.classList.remove(className);
      setPrintInvoiceId(null);
      setPrintMode(null);
    };

    window.addEventListener("afterprint", cleanup);

    const timer = window.setTimeout(() => {
      window.print();
    }, 50);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", cleanup);
      document.body.classList.remove(className);
    };
  }, [
    printInvoiceId,
    printMode,
    customerReceiptQuery.data,
    companyReceiptQuery.data,
  ]);

  return (
    <section
      aria-label="Order Management"
      style={{
        position: "relative",
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 20,
        marginTop: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 13 }}>ORDER MANAGEMENT</p>
          <h2 style={{ margin: "4px 0 8px" }}>
            {mode === "new" ? "New Order" : `#${order!.orderNumber}`}
          </h2>
          <strong>{currentCustomer.name}</strong>
          <div>
            {currentCustomer.phone || "No phone"}
            {currentCustomer.email
              ? ` · ${currentCustomer.email}`
              : ""}
          </div>
        </div>

        <div>
          <button type="button" onClick={requestBack}>
            ← Back
          </button>
        </div>
      </div>

      <p
        style={{
          fontSize: 12,
          margin: "12px 0",
          opacity: 0.7,
        }}
      >
        Press <strong>ESC</strong> to go back. Unsaved changes will ask
        for confirmation.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          border: "1px solid #ddd",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          disabled={mode === "new"}
          onClick={() => onNewOrder(currentCustomer)}
        >
          New Order
        </button>
        <button type="button" onClick={beginEdit}>
          Edit
        </button>
        <button type="button" onClick={() => setLayer("history")}>
          History
        </button>
        <button type="button" onClick={() => setLayer("notes")}>
          Notes
        </button>

        <button type="button" onClick={beginEdit}>
          Customer
        </button>
        <button
          type="button"
          disabled={mode !== "view" || !order}
          onClick={() => {
            setPaymentError(null);
            setLayer("payment");
          }}
        >
          Pay
        </button>
        <button
          type="button"
          disabled={
            mode !== "view" ||
            !order ||
            !invoiceQuery.data ||
            !canViewInvoices
          }
          onClick={() => setLayer("print")}
        >
          Print
        </button>
        <button
          type="button"
          disabled={!canUpdateStatus || mode !== "view" || !order}
          onClick={() => setLayer("status")}
        >
          Status
        </button>

        <button type="button" onClick={onBack}>
          Switch
        </button>
        <button type="button" onClick={() => setLayer("notes")}>
          Invoice
        </button>
        <button type="button" onClick={() => setLayer("more")}>
          More
        </button>
      </div>

      {mode === "new" ? (
        <section style={{ marginTop: 20 }}>
          {newOrderContent}
        </section>
      ) : (
      <section style={{ marginTop: 20 }}>
        <h3>Current Order</h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <strong>Status</strong>
            <div>{statusLabel(order!.status)}</div>
          </div>
          <div>
            <strong>Total</strong>
            <div>{formatMoney(order!.orderTotal)}</div>
          </div>
          <div>
            <strong>Expected Ready</strong>
            <div>{formatDate(order!.expectedReadyAt)}</div>
          </div>
          <div>
            <strong>Created</strong>
            <div>{formatDate(order!.createdAt)}</div>
          </div>
        </div>

        <table style={{ width: "100%", marginTop: 16 }}>
          <thead>
            <tr>
              <th>QTY</th>
              <th>Item</th>
              <th>PCS</th>
              <th>Unit Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {order!.items.map((item) => (
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
      </section>

      )}

      <section style={{ marginTop: 20 }}>
        <h3>Customer Order History</h3>

        <div
          style={{
            maxHeight: 240,
            overflowY: "auto",
            border: "1px solid #ddd",
            borderRadius: 8,
          }}
        >
          {historyQuery.isLoading && <p>Loading history...</p>}

          {historyQuery.isError && (
            <p role="alert">Unable to load customer order history.</p>
          )}

          {!historyQuery.isLoading && history.length === 0 && (
            <p>No previous orders found.</p>
          )}

          {history.map((historyOrder) => (
            <button
              key={historyOrder.id}
              type="button"
              onClick={() => onSelectOrder(historyOrder)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                width: "100%",
                padding: 10,
                border: 0,
                borderBottom: "1px solid #eee",
                background:
                  mode === "view" && historyOrder.id === order?.id
                    ? "#f3f3f3"
                    : "#fff",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span>
                #{historyOrder.orderNumber} ·{" "}
                {statusLabel(historyOrder.status)}
              </span>
              <span>{formatMoney(historyOrder.orderTotal)}</span>
            </button>
          ))}
        </div>
      </section>

      {error && (
        <p role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      {layer !== "none" && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "absolute",
            inset: 12,
            zIndex: 20,
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 10,
            padding: 20,
            boxShadow: "0 12px 40px rgba(0,0,0,.18)",
            overflowY: "auto",
          }}
        >
          <button type="button" onClick={() => setLayer("none")}>
            ← Close
          </button>

          {layer === "edit" && (
            <>
              <h3>Edit Customer</h3>

              {!canUpdateCustomer ? (
                <p>You do not have permission to update this customer.</p>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    customerMutation.mutate();
                  }}
                >
                  <label>
                    Phone
                    <input
                      value={phone}
                      onChange={(event) => {
                        setPhone(event.target.value);
                        setDirty(true);
                      }}
                    />
                  </label>

                  <label>
                    Email
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setDirty(true);
                      }}
                    />
                  </label>

                  <label>
                    Address
                    <textarea
                      value={address}
                      onChange={(event) => {
                        setAddress(event.target.value);
                        setDirty(true);
                      }}
                    />
                  </label>

                  <label>
                    Notes
                    <textarea
                      value={notes}
                      onChange={(event) => {
                        setNotes(event.target.value);
                        setDirty(true);
                      }}
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={customerMutation.isPending}
                  >
                    {customerMutation.isPending
                      ? "Saving..."
                      : "Save Changes"}
                  </button>
                </form>
              )}
            </>
          )}

          {layer === "history" && (
            <>
              <h3>Customer Order History</h3>
              {history.map((historyOrder) => (
                <button
                  key={historyOrder.id}
                  type="button"
                  onClick={() => {
                    onSelectOrder(historyOrder);
                    setLayer("none");
                  }}
                  style={{ display: "block", width: "100%" }}
                >
                  #{historyOrder.orderNumber} ·{" "}
                  {statusLabel(historyOrder.status)} ·{" "}
                  {formatMoney(historyOrder.orderTotal)}
                </button>
              ))}
            </>
          )}

          {layer === "status" && (
            <>
              <h3>Change Order Status</h3>
              {STATUSES.map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={
                    !canUpdateStatus ||
                    statusMutation.isPending ||
                    mode !== "view" ||
                    item === order!.status
                  }
                  onClick={() => statusMutation.mutate(item)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginBottom: 8,
                  }}
                >
                  {statusLabel(item)}
                </button>
              ))}
            </>
          )}

          {layer === "notes" && (
            <>
              <h3>Order Notes</h3>
              <p>
                <strong>Customer note:</strong>{" "}
                {order?.garmentNote || "None"}
              </p>
              <p>
                <strong>Internal note:</strong>{" "}
                {order?.internalNote || "None"}
              </p>
            </>
          )}

          {layer === "payment" && (
            <>
              <h3>Payment</h3>

              {!canViewPayments ? (
                <p>You do not have permission to view payment information.</p>
              ) : !invoiceQuery.data ? (
                <>
                  <p>
                    No invoice is currently available for this order.
                  </p>
                  {invoiceQuery.isError && (
                    <p role="alert">
                      Unable to load the invoice for this order.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p>
                    <strong>Invoice:</strong>{" "}
                    {invoiceQuery.data.invoiceNumber}
                  </p>

                  {paymentSummaryQuery.isLoading ? (
                    <p>Loading payment balance...</p>
                  ) : paymentSummaryQuery.isError ? (
                    <p role="alert">
                      Unable to load the payment balance.
                    </p>
                  ) : paymentSummaryQuery.data ? (
                    <>
                      <p>
                        <strong>Total:</strong>{" "}
                        {formatMoney(
                          paymentSummaryQuery.data.totalAmount,
                        )}
                      </p>
                      <p>
                        <strong>Paid:</strong>{" "}
                        {formatMoney(
                          paymentSummaryQuery.data.amountPaid,
                        )}
                      </p>
                      <p>
                        <strong>Balance:</strong>{" "}
                        {formatMoney(
                          paymentSummaryQuery.data.balance,
                        )}
                      </p>

                      {paymentSummaryQuery.data.balance <= 0 ? (
                        <p>
                          This invoice is already fully paid.
                        </p>
                      ) : (
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            setPaymentError(null);
                            paymentMutation.mutate();
                          }}
                          style={{
                            display: "grid",
                            gap: 12,
                            maxWidth: 520,
                            marginTop: 16,
                          }}
                        >
                          <label>
                            Amount
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={paymentAmount}
                              onChange={(event) =>
                                setPaymentAmount(event.target.value)
                              }
                              placeholder="Enter amount"
                            />
                          </label>

                          <label>
                            Payment Method
                            <select
                              value={paymentMethod}
                              onChange={(event) => {
                                setPaymentMethod(
                                  event.target.value as PaymentMethod,
                                );
                                setPaymentError(null);
                              }}
                            >
                              <option value="CASH">Cash</option>
                              <option value="TRANSFER">
                                Transfer
                              </option>
                              <option value="POS">POS</option>
                              {canViewAccount && (
                                <option value="PAY_FROM_ACCOUNT">
                                  Pay from Account
                                </option>
                              )}
                            </select>
                          </label>

                          {paymentMethod === "PAY_FROM_ACCOUNT" && (
                            <div
                              style={{
                                padding: 12,
                                border: "1px solid #ddd",
                                borderRadius: 8,
                              }}
                            >
                              {accountQuery.isLoading ? (
                                <p>Loading account balance...</p>
                              ) : accountQuery.data ? (
                                <p style={{ margin: 0 }}>
                                  <strong>Account balance:</strong>{" "}
                                  {formatMoney(
                                    accountQuery.data.balance,
                                  )}
                                </p>
                              ) : (
                                <p style={{ margin: 0 }}>
                                  Unable to load the customer's account.
                                </p>
                              )}
                            </div>
                          )}

                          <label>
                            Reference
                            <input
                              value={paymentReference}
                              onChange={(event) =>
                                setPaymentReference(event.target.value)
                              }
                              placeholder="Optional reference"
                              maxLength={200}
                            />
                          </label>

                          <label>
                            Note
                            <textarea
                              value={paymentNote}
                              onChange={(event) =>
                                setPaymentNote(event.target.value)
                              }
                              placeholder="Optional note"
                              maxLength={1000}
                            />
                          </label>

                          {paymentError && (
                            <p role="alert">{paymentError}</p>
                          )}

                          {!canManagePayments && (
                            <p>
                              You do not have permission to record
                              payments.
                            </p>
                          )}

                          <button
                            type="submit"
                            disabled={
                              paymentMutation.isPending ||
                              !canManagePayments
                            }
                          >
                            {paymentMutation.isPending
                              ? "Processing..."
                              : "Make Payment"}
                          </button>
                        </form>
                      )}
                    </>
                  ) : null}
                </>
              )}
            </>
          )}

          {layer === "print" && (
            <>
              <h3>Print Receipt</h3>

              {!invoiceQuery.data ? (
                <p>
                  No invoice is available for this order.
                </p>
              ) : (
                <>
                  <p>
                    Choose the receipt copy you want to print.
                  </p>

                  <button
                    type="button"
                    disabled={Boolean(printInvoiceId)}
                    onClick={() => {
                      setLayer("none");
                      setPrintMode("customer");
                      setPrintInvoiceId(invoiceQuery.data!.id);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      marginBottom: 8,
                    }}
                  >
                    Print Customer Copy
                  </button>

                  <button
                    type="button"
                    disabled={Boolean(printInvoiceId)}
                    onClick={() => {
                      setLayer("none");
                      setPrintMode("company");
                      setPrintInvoiceId(invoiceQuery.data!.id);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                    }}
                  >
                    Print Company Copy
                  </button>
                </>
              )}
            </>
          )}

          {layer === "more" && (
            <>
              <h3>More</h3>
              <p>Additional order actions will appear here.</p>
            </>
          )}
        </div>
      )}

      <div className="invoice-print-area" aria-hidden="true">
        <div className="invoice-print-customer">
          {customerReceiptQuery.data && (
            <CustomerReceipt
              receipt={customerReceiptQuery.data}
              branding={brandingQuery.data}
            />
          )}
        </div>

        <div className="invoice-print-company">
          {companyReceiptQuery.data && (
            <CompanyReceipt
              receipt={companyReceiptQuery.data}
              branding={brandingQuery.data}
            />
          )}
        </div>
      </div>

      {warningOpen && (
        <div
          role="alertdialog"
          aria-modal="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 30,
            background: "rgba(0,0,0,.35)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: 20,
              borderRadius: 10,
              maxWidth: 420,
            }}
          >
            <h3>Unsaved changes</h3>
            <p>
              You have unsaved changes. Are you sure you want to leave?
            </p>
            <button
              type="button"
              onClick={() => setWarningOpen(false)}
            >
              Stay
            </button>
            <button
              type="button"
              onClick={() => {
                setWarningOpen(false);
                setDirty(false);

                if (layer !== "none") {
                  setLayer("none");
                } else {
                  onBack();
                }
              }}
            >
              Discard &amp; Back
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function OrderManagement(props: OrderManagementProps) {
  return (
    <SensitiveAuthorizationProvider>
      <OrderManagementContent {...props} />
    </SensitiveAuthorizationProvider>
  );
}

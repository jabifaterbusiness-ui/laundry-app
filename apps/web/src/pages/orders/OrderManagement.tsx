import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Customer, Order, OrderStatus } from "@laundry-app/shared";
import { ApiError } from "../../lib/api-client.js";
import { getCustomer, updateCustomer } from "../../lib/customers-api.js";
import {
  deleteInvoice,
  getCompanyReceipt,
  getCustomerReceipt,
  getInvoiceByOrder,
  getInvoiceHistory,
  voidInvoice,
  type InvoiceHistoryEntry,
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
  getOrderStatusHistory,
  listAllOrders,
  updateOrderStatusWithOfflineQueue,
} from "../../lib/orders-api.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";
import { QUICK_OPERATIONS } from "../../lib/quick-operations-catalog.js";

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
  mode: "view" | "new" | "edit";
  newOrderContent?: ReactNode;
  onBack: () => void;
  onSwitchCustomer: () => void;
  onNewOrder: (customer: Customer) => void;
  onSelectOrder: (order: Order) => void;
  onEditOrder: (order: Order) => void;
}

function OrderManagementContent({
  order,
  customer,
  mode,
  newOrderContent,
  onBack,
  onSwitchCustomer,
  onNewOrder,
  onSelectOrder,
  onEditOrder,
}: OrderManagementProps) {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { requestSensitiveAuthorization } = useSensitiveAuthorization();

  const [layer, setLayer] = useState<
    | "none"
    | "edit"
    | "history"
    | "notes"
    | "payment"
    | "print"
    | "status"
    | "more"
    | "invoice-void"
    | "invoice-delete"
    | "invoice-history"
    | "status-history"
  >("none");
  const [dirty, setDirty] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [address, setAddress] = useState(customer.address ?? "");
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [printInvoiceId, setPrintInvoiceId] = useState<string | null>(null);
  const [printMode, setPrintMode] =
    useState<"customer" | "company" | null>(null);

  const [invoiceCorrectionReason, setInvoiceCorrectionReason] = useState("");
  const [invoiceCorrectionConfirmed, setInvoiceCorrectionConfirmed] =
    useState(false);
  const [invoiceCorrectionError, setInvoiceCorrectionError] = useState<
    string | null
  >(null);

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

  const invoiceHistoryQuery = useQuery<InvoiceHistoryEntry[]>({
    queryKey: [
      "order-management",
      "invoice-history",
      invoiceQuery.data?.id,
      activeBranchId,
    ],
    queryFn: () =>
      getInvoiceHistory(
        invoiceQuery.data!.id,
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(
      accessToken &&
        activeBranchId &&
        invoiceQuery.data?.id &&
        canViewInvoices &&
        layer === "invoice-history",
    ),
  });

  const statusHistoryQuery = useQuery({
    queryKey: ["order-management", "status-history", order?.id, activeBranchId],
    queryFn: () => getOrderStatusHistory(order!.id, { accessToken }, activeBranchId),
    enabled: Boolean(
      accessToken &&
        activeBranchId &&
        mode === "view" &&
        order?.id &&
        (layer === "status-history" || layer === "invoice-history"),
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

  const invoiceCorrectionMutation = useMutation({
    mutationFn: async () => {
      if (!invoiceQuery.data) {
        throw new Error("No invoice is available for this order.");
      }

      if (!hasPermission(user, "invoices.manage")) {
        throw new Error(
          "You do not have permission to perform invoice corrections.",
        );
      }

      const reason = invoiceCorrectionReason.trim();

      if (!reason) {
        throw new Error("Enter a reason for this invoice correction.");
      }

      if (!invoiceCorrectionConfirmed) {
        throw new Error(
          "Confirm that you want to perform this invoice correction.",
        );
      }

      const authorization = await requestSensitiveAuthorization();

      if (!authorization) {
        throw new Error(
          "Invoice correction authorization was cancelled or not provided.",
        );
      }

      if (layer === "invoice-void") {
        return voidInvoice(
          invoiceQuery.data.id,
          {
            reason,
            confirmed: true,
          },
          {
            accessToken,
            sensitiveAuthorization: authorization,
          },
          activeBranchId,
        );
      }

      if (layer === "invoice-delete") {
        return deleteInvoice(
          invoiceQuery.data.id,
          {
            reason,
            confirmed: true,
          },
          {
            accessToken,
            sensitiveAuthorization: authorization,
          },
          activeBranchId,
        );
      }

      throw new Error("Choose an invoice correction.");
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["order-management", "invoice", order?.id, activeBranchId],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            "order-management",
            "invoice-payment-summary",
            invoiceQuery.data?.id,
            activeBranchId,
          ],
        }),
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
        queryClient.invalidateQueries({
          queryKey: [
            "order-management",
            "invoice-history",
            invoiceQuery.data?.id,
            activeBranchId,
          ],
        }),
      ]);

      setInvoiceCorrectionReason("");
      setInvoiceCorrectionConfirmed(false);
      setInvoiceCorrectionError(null);
      setLayer("none");
    },
    onError: (err: unknown) => {
      setInvoiceCorrectionError(
        err instanceof Error
          ? err.message
          : "Unable to complete the invoice correction.",
      );
    },
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
      setStatusFeedback(null);
      if (!result.queued) {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({
          queryKey: ["orders", "customer-history", customer.id],
        });
        onSelectOrder(result.order);

        const deliveries = result.order.notificationResults ?? [];
        const sent = deliveries.filter((item) => item.status === "SENT").length;
        const failed = deliveries.filter((item) => item.status === "FAILED").length;
        const duplicate = deliveries.filter((item) => item.status === "DUPLICATE").length;
        const deliverySummary = deliveries.length
          ? `Customer notification: ${sent} sent, ${failed} failed, ${duplicate} already processed.`
          : "No enabled customer notification rule applies to this status.";

        setError(null);
        setStatusFeedback(
          result.order.notificationError
            ? `Order status updated, but notification processing failed: ${result.order.notificationError}`
            : `Order status updated. ${deliverySummary}`,
        );
      } else {
        setError(null);
        setStatusFeedback("Status saved offline and will synchronize when the connection is restored.");
      }
      setLayer("none");
    },
    onError: (err) => {
      setStatusFeedback(null);
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

  function openDigitalReceipt() {
    if (!invoiceQuery.data || !canViewInvoices) return;

    const operation = QUICK_OPERATIONS.find(
      (item) => item.code === "RS",
    );

    if (!operation) {
      setError("Digital receipt operation is unavailable.");
      return;
    }

    setLayer("none");

    window.dispatchEvent(
      new CustomEvent("quick-operation:open", {
        detail: {
          ...operation,
          recordId: invoiceQuery.data.id,
        },
      }),
    );
  }

  function startInvoiceCorrection(
    correction: "invoice-void" | "invoice-delete",
  ) {
    if (!invoiceQuery.data || !hasPermission(user, "invoices.manage")) {
      return;
    }

    setInvoiceCorrectionReason("");
    setInvoiceCorrectionConfirmed(false);
    setInvoiceCorrectionError(null);
    setLayer(correction);
  }

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
      if (
        mode === "view" &&
        order &&
        invoiceQuery.data &&
        canViewInvoices &&
        event.key === "F1"
      ) {
        event.preventDefault();

        if (event.ctrlKey && event.shiftKey) {
          openDigitalReceipt();
          return;
        }

        setLayer("none");
        setPrintMode(event.ctrlKey ? "company" : "customer");
        setPrintInvoiceId(invoiceQuery.data.id);
        return;
      }

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

    const receiptQuery =
      printMode === "customer"
        ? customerReceiptQuery
        : companyReceiptQuery;

    if (receiptQuery.isLoading || receiptQuery.isFetching) return;

    if (receiptQuery.isError || !receiptQuery.data) {
      setError(
        receiptQuery.error instanceof Error
          ? receiptQuery.error.message
          : `Unable to load the ${printMode} receipt. Please try again.`,
      );
      setPrintInvoiceId(null);
      setPrintMode(null);
      return;
    }

    const className =
      printMode === "customer"
        ? "printing-customer"
        : "printing-company";

    setError(null);
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
    customerReceiptQuery.isLoading,
    customerReceiptQuery.isFetching,
    customerReceiptQuery.isError,
    customerReceiptQuery.error,
    customerReceiptQuery.data,
    companyReceiptQuery.isLoading,
    companyReceiptQuery.isFetching,
    companyReceiptQuery.isError,
    companyReceiptQuery.error,
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
            {mode === "new"
              ? "New Order"
              : mode === "edit"
                ? "Edit Invoice"
                : `#${order!.orderNumber}`}
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
          disabled={mode !== "view"}
          onClick={() => onNewOrder(currentCustomer)}
        >
          New Order
        </button>
        <button
          type="button"
          disabled={mode !== "view" || !order || !hasPermission(user, "orders.update")}
          onClick={() => {
            if (order) onEditOrder(order);
          }}
        >
          Edit Invoice
        </button>
        <button
          type="button"
          disabled={
            mode !== "view" ||
            !order ||
            !invoiceQuery.data ||
            !canViewInvoices
          }
          onClick={() =>
            navigate(
              `/invoices?invoiceId=${encodeURIComponent(
                invoiceQuery.data!.id,
              )}&action=transfer`,
            )
          }
        >
          Transfer Invoice
        </button>
        <button type="button" onClick={() => setLayer("history")}>
          History
        </button>
        <button
          type="button"
          disabled={mode !== "view" || !order}
          onClick={() => setLayer("status-history")}
        >
          Status History
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
          onClick={() => {
            setPrintMode("customer");
            setPrintInvoiceId(invoiceQuery.data!.id);
          }}
        >
          Print Customer Copy (F1)
        </button>

        <button
          type="button"
          disabled={
            mode !== "view" ||
            !order ||
            !invoiceQuery.data ||
            !canViewInvoices
          }
          onClick={() => {
            setPrintMode("company");
            setPrintInvoiceId(invoiceQuery.data!.id);
          }}
        >
          Print Company Copy (Ctrl+F1)
        </button>

        <button
          type="button"
          disabled={
            mode !== "view" ||
            !order ||
            !invoiceQuery.data ||
            !canViewInvoices
          }
          onClick={() => {
            openDigitalReceipt();
          }}
        >
          Digital Receipt (Ctrl+Shift+F1)
        </button>
        <button
          type="button"
          disabled={!canUpdateStatus || mode !== "view" || !order}
          onClick={() => setLayer("status")}
        >
          Status
        </button>

        <button type="button" onClick={onSwitchCustomer}>
          Switch Customer
        </button>
        <button type="button" onClick={() => setLayer("more")}>
          More
        </button>
      </div>

      {mode === "new" || mode === "edit" ? (
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
          {[
            {
              label: "Status",
              value: statusLabel(order!.status),
              border: "#2563eb",
              background: "#eff6ff",
              labelColor: "#1d4ed8",
              valueColor: "#1e40af",
            },
            {
              label: "Total",
              value: formatMoney(order!.orderTotal),
              border: "#7c3aed",
              background: "#f5f3ff",
              labelColor: "#6d28d9",
              valueColor: "#5b21b6",
            },
            {
              label: "Paid",
              value: paymentSummaryQuery.data
                ? formatMoney(paymentSummaryQuery.data.amountPaid)
                : "Loading...",
              border: "#16a34a",
              background: "#f0fdf4",
              labelColor: "#15803d",
              valueColor: "#166534",
            },
            {
              label: "Balance",
              value: paymentSummaryQuery.data
                ? formatMoney(paymentSummaryQuery.data.balance)
                : "Loading...",
              border: "#ea580c",
              background: "#fff7ed",
              labelColor: "#c2410c",
              valueColor: "#9a3412",
            },
          ].map((summary) => (
            <div
              key={summary.label}
              style={{
                padding: 14,
                border: `1px solid ${summary.border}`,
                borderRadius: 10,
                background: summary.background,
              }}
            >
              <strong
                style={{
                  display: "block",
                  color: summary.labelColor,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: ".04em",
                }}
              >
                {summary.label}
              </strong>
              <div
                style={{
                  marginTop: 5,
                  color: summary.valueColor,
                  fontSize: 20,
                  fontWeight: 800,
                }}
              >
                {summary.value}
              </div>
            </div>
          ))}
          <div>
            <strong>Expected Ready</strong>
            <div>{formatDate(order!.expectedReadyAt)}</div>
          </div>
          <div>
            <strong>Created</strong>
            <div>{formatDate(order!.createdAt)}</div>
          </div>
        </div>

        {paymentSummaryQuery.data?.payments?.length ? (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              border: "1px solid #ddd",
              borderRadius: 8,
            }}
          >
            <strong>Payment History</strong>
            {paymentSummaryQuery.data.payments.map((payment) => (
              <div
                key={payment.id}
                style={{
                  marginTop: 10,
                  padding: 10,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  background: "#fafafa",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 6,
                  }}
                >
                  <span>
                    <strong>Amount:</strong> {formatMoney(payment.amount)}
                  </span>
                  <span>
                    <strong>Method:</strong>{" "}
                    {payment.method.replaceAll("_", " ")}
                  </span>
                  <span>
                    <strong>Authorized by:</strong>{" "}
                    {payment.authorizedByName ||
                      payment.authorizedByUserId ||
                      "Unknown user"}
                  </span>
                  <span>
                    <strong>Date/Time:</strong>{" "}
                    {formatDate(payment.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <table style={{ width: "100%", marginTop: 16 }}>
          <thead>
            <tr>
              <th>QTY</th>
              <th>Item</th>
              <th>Colours</th>
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
                <td>{(item.colors ?? []).length ? item.colors.join(", ") : "—"}</td>
                <td>{item.totalPieces}</td>
                <td>{formatMoney(item.unitPrice)}</td>
                <td>{formatMoney(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {invoiceQuery.isLoading && <p role="status">Loading invoice financial breakdown...</p>}
        {invoiceQuery.isError && <p role="alert">Unable to load the invoice financial breakdown.</p>}
        {invoiceQuery.data && (
          <section aria-label="Order financial breakdown" style={{ marginTop: 18, padding: 16, border: "1px solid #d8dee8", borderRadius: 12, display: "grid", gap: 9, maxWidth: 620 }}>
            <h3 style={{ margin: 0 }}>Financial breakdown</h3>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span>Service subtotal</span><strong>{formatMoney(invoiceQuery.data.subtotal)}</strong></div>
            {(invoiceQuery.data.appliedAdjustments ?? []).map((adjustment) => (
              <div key={adjustment.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>{adjustment.name} ({adjustment.percentage > 0 ? "+" : ""}{adjustment.percentage}%)</span>
                <strong>{adjustment.amount < 0 ? "−" : adjustment.amount > 0 ? "+" : ""}{formatMoney(Math.abs(adjustment.amount))}</strong>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span>Adjusted taxable amount</span><strong>{formatMoney(invoiceQuery.data.adjustedSubtotal)}</strong></div>
            {(invoiceQuery.data.appliedTaxes ?? []).map((tax) => (
              <div key={tax.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>{tax.name} ({tax.kind === "PERCENTAGE" ? tax.value + "%" : "Fixed"}) · {tax.treatment === "WITHHOLDING" ? "Withheld" : "Added"}</span>
                <strong>{tax.treatment === "WITHHOLDING" ? "−" : "+"}{formatMoney(tax.amount)}</strong>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: "1px solid #d8dee8", paddingTop: 8 }}>
              <span>Adjustment total</span><strong>{formatMoney(invoiceQuery.data.adjustmentTotal)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: "2px solid #111827", paddingTop: 10, fontSize: 18 }}>
              <strong>Total amount</strong><strong>{formatMoney(invoiceQuery.data.totalAmount)}</strong>
            </div>
          </section>
        )}
      </section>

      )}

      {statusFeedback && (
        <p role="status" style={{ marginTop: 12, color: "#166534" }}>
          {statusFeedback}
        </p>
      )}
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

          {(layer === "invoice-void" || layer === "invoice-delete") && (
            <>
              <h3>
                {layer === "invoice-void" ? "Void Invoice" : "Delete Invoice"}
              </h3>
              <p>
                {layer === "invoice-void"
                  ? "Voiding marks this invoice as void. The invoice history is retained."
                  : "Deleting removes this invoice from active records. The invoice history is retained."}
              </p>

              <label style={{ display: "block", marginTop: 12 }}>
                Reason for this edit
                <textarea
                  value={invoiceCorrectionReason}
                  onChange={(event) => {
                    setInvoiceCorrectionReason(event.target.value);
                    setInvoiceCorrectionError(null);
                  }}
                  maxLength={1000}
                  rows={4}
                  style={{ display: "block", width: "100%", marginTop: 6 }}
                />
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <input
                  type="checkbox"
                  checked={invoiceCorrectionConfirmed}
                  onChange={(event) =>
                    setInvoiceCorrectionConfirmed(event.target.checked)
                  }
                />
                I confirm that I want to perform this invoice correction.
              </label>

              {invoiceCorrectionError && (
                <p role="alert">{invoiceCorrectionError}</p>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  disabled={invoiceCorrectionMutation.isPending}
                  onClick={() => invoiceCorrectionMutation.mutate()}
                >
                  {invoiceCorrectionMutation.isPending
                    ? "Processing..."
                    : "Confirm Edit"}
                </button>
                <button
                  type="button"
                  onClick={() => setLayer("more")}
                  disabled={invoiceCorrectionMutation.isPending}
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {layer === "status-history" && (
            <>
              <h3>Order Status History</h3>
              {statusHistoryQuery.isLoading ? (
                <p>Loading status history...</p>
              ) : statusHistoryQuery.isError ? (
                <p role="alert">Unable to load order status history.</p>
              ) : statusHistoryQuery.data?.length ? (
                <ol style={{ display: "grid", gap: 10, paddingLeft: 22 }}>
                  {statusHistoryQuery.data.map((entry) => (
                    <li key={entry.id}>
                      <strong>
                        {entry.previousStatus
                          ? entry.previousStatus.replaceAll("_", " ")
                          : "Status set to"}{" "}
                        {entry.previousStatus ? "→ " : ""}{entry.status.replaceAll("_", " ")}
                      </strong>
                      <div>Date/Time: {formatDate(entry.changedAt)}</div>
                      <div>Changed by: {entry.changedBy}</div>
                       <div>Branch: {entry.branchName}</div>
                      <div>
                        <strong>Notifications:</strong>{" "}
                        {entry.notificationResults?.length
                          ? entry.notificationResults.map((result) => `${result.channel}: ${result.status}${result.error ? ` — ${result.error}` : ""}`).join(" · ")
                          : "No notification attempt recorded"}
                      </div>
                      {entry.notificationError && <div role="alert">{entry.notificationError}</div>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No status changes have been recorded for this order yet.</p>
              )}
            </>
          )}

          {layer === "invoice-history" && (
            <>
              <h3>Edited History</h3>
              <section aria-label="Order status and notification history" style={{ marginBottom: 16 }}>
                <h4>Order status changes & notification outcomes</h4>
                {statusHistoryQuery.isLoading ? <p>Loading status history...</p> : null}
                {statusHistoryQuery.isError ? <p role="alert">Unable to load order status history.</p> : null}
                {statusHistoryQuery.data?.length ? (
                  <ol>
                    {statusHistoryQuery.data.map((entry) => (
                      <li key={entry.id}>
                        <strong>{entry.previousStatus ?? "Created"} → {entry.status}</strong>
                        <div>{entry.changedBy} · {formatDate(entry.changedAt)}</div>
                         <div>Branch: {entry.branchName}</div>
                        <div>
                          <strong>Notifications:</strong>{" "}
                          {entry.notificationResults?.length
                            ? entry.notificationResults.map((result) => `${result.channel}: ${result.status}${result.error ? ` — ${result.error}` : ""}`).join(" · ")
                            : "No notification attempt recorded"}
                        </div>
                        {entry.notificationError && <div role="alert">{entry.notificationError}</div>}
                      </li>
                    ))}
                  </ol>
                ) : (
                  !statusHistoryQuery.isLoading && <p>No order status changes have been recorded yet.</p>
                )}
              </section>
              <h4>Invoice edits</h4>
              {invoiceHistoryQuery.isLoading ? (
                <p>Loading edited history...</p>
              ) : invoiceHistoryQuery.isError ? (
                <p role="alert">Unable to load edited history.</p>
              ) : invoiceHistoryQuery.data?.length ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {invoiceHistoryQuery.data.map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        padding: 12,
                        border: "1px solid #ddd",
                        borderRadius: 8,
                      }}
                    >
                      <strong>{entry.action}</strong>
                      <div>Version: {entry.version}</div>
                      <div>Reason: {entry.reason}</div>
                      <div>
                        Date/Time: {formatDate(entry.createdAt)}
                      </div>
                      <div>Authorized by: {entry.actorUserId}</div>                       <details>                         <summary>View Snapshot — Version {entry.version}</summary>                         <pre
                          style={{
                            marginTop: 12,
                            padding: 12,
                            overflowX: "auto",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            background: "#f7f7f7",
                            borderRadius: 6,
                          }}                         >
                          {JSON.stringify(entry.snapshot, null, 2)}                         </pre>                       </details>                     </div>
                  ))}
                </div>
              ) : (
                <p>No edited history is available for this invoice.</p>
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
                  {historyOrder.items.some((item) => (item.colors ?? []).length > 0) ? (
                    <small
                      style={{
                        display: "block",
                        marginTop: 5,
                        color: "var(--text-muted, #64748b)",
                        whiteSpace: "normal",
                      }}
                    >
                      {historyOrder.items
                        .filter((item) => (item.colors ?? []).length > 0)
                        .map((item) => `${item.serviceName}: ${(item.colors ?? []).join(", ")}`)
                        .join(" · ")}
                    </small>
                  ) : null}
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
              {!invoiceQuery.data ? (
                <p>No invoice is available for this order.</p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  }}
                >
                  <button
                    type="button"
                    disabled={!hasPermission(user, "invoices.manage")}
                    onClick={() => startInvoiceCorrection("invoice-void")}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid #dc2626",
                      background: "#fee2e2",
                      color: "#991b1b",
                      fontWeight: 600,
                    }}
                  >
                    Void Invoice
                  </button>

                  <button
                    type="button"
                    disabled={!hasPermission(user, "invoices.manage")}
                    onClick={() => startInvoiceCorrection("invoice-delete")}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid #b91c1c",
                      background: "#fecaca",
                      color: "#7f1d1d",
                      fontWeight: 600,
                    }}
                  >
                    Delete Invoice
                  </button>

                  <button
                    type="button"
                    disabled={!canViewInvoices}
                    onClick={() => setLayer("invoice-history")}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid #2563eb",
                      background: "#dbeafe",
                      color: "#1e3a8a",
                      fontWeight: 600,
                    }}
                  >
                    Edited History
                  </button>

                </div>
              )}
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

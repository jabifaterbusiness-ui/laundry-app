import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import {
  createPayment,
  getPayment,
  getInvoicePaymentSummary,
  listPayments,
  voidPayment,
  type PaymentMethod,
  type PaymentStatus,
} from "../../lib/payments-api.js";
import { listInvoices } from "../../lib/invoices-api.js";
import { getCustomerAccount } from "../../lib/customer-account-api.js";
import { useAuthStore } from "../../state/auth-store.js";
import { useSensitiveAuthorization } from "../../components/auth/SensitiveAuthorizationProvider.js";

const PAGE_SIZE = 25;

function formatMoney(value: number) {
  return `₦${value.toLocaleString()}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function PaymentsPage() {
  const [searchParams] = useSearchParams();
  const paymentIdFromUrl = searchParams.get("paymentId");
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const user = useAuthStore((s) => s.user);
  const { requestSensitiveAuthorization } =
    useSensitiveAuthorization();
  const queryClient = useQueryClient();

  const canVoidPayment =
    user?.role === "BUSINESS_OWNER" ||
    user?.role === "BRANCH_MANAGER";

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<PaymentStatus | "">("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  );
  const [formOpen, setFormOpen] = useState(false);

  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const paymentsQuery = useQuery({
    queryKey: [
      "payments",
      {
        page,
        status,
        branchId: activeBranchId,
      },
    ],
    queryFn: () =>
      listPayments(
        {
          page,
          pageSize: PAGE_SIZE,
          status: status || undefined,
        },
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(accessToken && activeBranchId),
  });

  const invoicesQuery = useQuery({
    queryKey: ["invoices", "payment-selector", activeBranchId],
    queryFn: () =>
      listInvoices(
        {
          page: 1,
          pageSize: 100,
          status: "ISSUED",
        },
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(accessToken && activeBranchId && formOpen),
  });

  const formSummaryQuery = useQuery({
    queryKey: [
      "invoice-payment-summary",
      "form",
      invoiceId,
      activeBranchId,
    ],
    queryFn: () =>
      getInvoicePaymentSummary(
        invoiceId,
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(
      accessToken && activeBranchId && formOpen && invoiceId,
    ),
  });

  const paymentFromUrlQuery = useQuery({
    queryKey: ["payment", paymentIdFromUrl, activeBranchId],
    queryFn: () =>
      getPayment(paymentIdFromUrl!, { accessToken }, activeBranchId),
    enabled: Boolean(accessToken && activeBranchId && paymentIdFromUrl),
  });

  useEffect(() => {
    const payment = paymentFromUrlQuery.data;
    if (payment && selectedInvoiceId !== payment.invoiceId) {
      setSelectedInvoiceId(payment.invoiceId);
    }
  }, [paymentFromUrlQuery.data, selectedInvoiceId]);

  const summaryQuery = useQuery({
    queryKey: [
      "invoice-payment-summary",
      selectedInvoiceId,
      activeBranchId,
    ],
    queryFn: () =>
      getInvoicePaymentSummary(
        selectedInvoiceId!,
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(
      accessToken && activeBranchId && selectedInvoiceId,
    ),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const authorization = await requestSensitiveAuthorization();

      if (!authorization) {
        throw new Error("Sensitive authorization was cancelled.");
      }

      return createPayment(
        {
          invoiceId,
          amount: Number(amount),
          method,
          reference: reference.trim() || undefined,
          note: note.trim() || undefined,
        },
        {
          accessToken,
          sensitiveAuthorization: authorization,
        },
        activeBranchId,
      );
    },
    onSuccess: async (payment) => {
      await queryClient.invalidateQueries({
        queryKey: ["payments"],
      });

      await queryClient.invalidateQueries({
        queryKey: [
          "invoice-payment-summary",
          payment.invoiceId,
          activeBranchId,
        ],
      });

      resetForm();
      setSelectedInvoiceId(payment.invoiceId);
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Unable to record payment. Please try again.",
      );
    },
  });

  const voidMutation = useMutation({
    mutationFn: async ({
      paymentId,
      reason,
    }: {
      paymentId: string;
      reason: string;
    }) => {
      const authorization = await requestSensitiveAuthorization();

      if (!authorization) {
        throw new Error("Sensitive authorization was cancelled.");
      }

      return voidPayment(
        paymentId,
        {
          accessToken,
          sensitiveAuthorization: authorization,
        },
        activeBranchId,
        reason,
      );
    },
    onSuccess: async (payment) => {
      await queryClient.invalidateQueries({
        queryKey: ["payments"],
      });

      await queryClient.invalidateQueries({
        queryKey: ["invoice-payment-summary", payment.invoiceId],
      });

      if (selectedInvoiceId === payment.invoiceId) {
        await queryClient.invalidateQueries({
          queryKey: [
            "invoice-payment-summary",
            payment.invoiceId,
            activeBranchId,
          ],
        });
      }
    },
  });

  function handleVoidPayment(payment: {
    id: string;
    invoiceId: string;
    amount: number;
  }) {
    const confirmed = window.confirm(
      `Void this payment of ${formatMoney(payment.amount)}? This action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    const reason = window.prompt(
      "Enter the reason for voiding this payment:",
    )?.trim();

    if (!reason) {
      return;
    }

    voidMutation.mutate({
      paymentId: payment.id,
      reason,
    });
  }

  const payments = paymentsQuery.data?.data ?? [];
  const pagination = paymentsQuery.data?.pagination;
  const invoices = invoicesQuery.data?.data ?? [];

  const selectedFormInvoice = invoices.find(
    (invoice) => invoice.id === invoiceId,
  );

  const selectedFormCustomerId =
    selectedFormInvoice?.order.customer.id ?? null;

  const formAccountQuery = useQuery({
    queryKey: ["customer-account", selectedFormCustomerId],
    queryFn: () =>
      getCustomerAccount(selectedFormCustomerId!, {
        accessToken,
      }),
    enabled:
      method === "PAY_FROM_ACCOUNT" && Boolean(selectedFormCustomerId),
  });
  const summary = summaryQuery.data;
  const formSummary = formSummaryQuery.data;
  const formBalance = formSummary?.balance ?? null;
  const formAccountBalance = formAccountQuery.data?.balance ?? null;

  function resetForm() {
    setFormOpen(false);
    setInvoiceId("");
    setAmount("");
    setMethod("CASH");
    setReference("");
    setNote("");
    setFormError(null);
  }

  function openPaymentForm() {
    setFormError(null);
    setFormOpen(true);
  }

  function submitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!invoiceId) {
      setFormError("Invoice is required.");
      return;
    }

    const numericAmount = Number(amount);

    if (!Number.isInteger(numericAmount) || numericAmount <= 0) {
      setFormError(
        "Payment amount must be a positive whole number.",
      );
      return;
    }

    if (formSummaryQuery.isLoading) {
      setFormError("Please wait while the invoice balance is loaded.");
      return;
    }

    if (formSummaryQuery.isError || !formSummary) {
      setFormError(
        "Unable to load the invoice balance. Please try again.",
      );
      return;
    }

    if (formSummary.balance <= 0) {
      setFormError("This invoice has already been fully paid.");
      return;
    }

    if (numericAmount > formSummary.balance) {
      setFormError(
        `Payment amount cannot exceed the outstanding balance of ${formatMoney(formSummary.balance)}.`,
      );
      return;
    }

    if (method === "PAY_FROM_ACCOUNT") {
      if (formAccountQuery.isLoading) {
        setFormError("Please wait while the customer account balance is loaded.");
        return;
      }

      if (formAccountQuery.isError || !formAccountQuery.data) {
        setFormError("Unable to load the customer account balance. Please try again.");
        return;
      }

      if (formAccountQuery.data.balance < numericAmount) {
        setFormError(
          `Payment amount cannot exceed the available account balance of ${formatMoney(formAccountQuery.data.balance)}.`,
        );
        return;
      }
    }

    createMutation.mutate();
  }

  return (
    <main>
      <h1>Payments</h1>

      <div>
        <select
          aria-label="Filter payments by status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as PaymentStatus | "");
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="POSTED">Posted</option>
          <option value="VOID">Void</option>
        </select>

        <button type="button" onClick={openPaymentForm}>
          Record Payment
        </button>
      </div>

      {paymentsQuery.isLoading && <p>Loading payments...</p>}

      {paymentsQuery.isError && (
        <p role="alert">
          {paymentsQuery.error instanceof ApiError
            ? paymentsQuery.error.message
            : "Failed to load payments. Please try again."}
        </p>
      )}

      {paymentsQuery.isSuccess && payments.length === 0 && (
        <p>No payments found.</p>
      )}

      {payments.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Status</th>
              <th>Reference</th>
              <th>Created</th>
              {canVoidPayment && <th>Action</th>}
            </tr>
          </thead>

          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedInvoiceId(payment.invoiceId)
                    }
                  >
                    {payment.invoice?.invoiceNumber ??
                      payment.invoiceId}
                  </button>
                </td>

                <td>
                  {payment.invoice?.customerName ?? "-"}
                </td>

                <td>{formatMoney(payment.amount)}</td>
                <td>{payment.method}</td>
                <td>{statusLabel(payment.status)}</td>
                <td>{payment.reference ?? "-"}</td>
                <td>{formatDate(payment.createdAt)}</td>

                {canVoidPayment && (
                  <td>
                    {payment.status === "POSTED" ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleVoidPayment({
                            id: payment.id,
                            invoiceId: payment.invoiceId,
                            amount: payment.amount,
                          })
                        }
                        disabled={voidMutation.isPending}
                      >
                        {voidMutation.isPending &&
                        voidMutation.variables?.paymentId === payment.id
                          ? "Voiding..."
                          : "Void"}
                      </button>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
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

      {voidMutation.isError && (
        <p role="alert">
          {voidMutation.error instanceof ApiError
            ? voidMutation.error.message
            : "Unable to void payment. Please try again."}
        </p>
      )}

      {formOpen && (
        <section aria-label="Record payment">
          <h2>Record Payment</h2>

          <form onSubmit={submitPayment}>
            <div>
              <label htmlFor="payment-invoice">
                Invoice
              </label>

              <select
                id="payment-invoice"
                value={invoiceId}
                onChange={(event) => {
                  setInvoiceId(event.target.value);
                  setAmount("");
                  setFormError(null);
                }}
                disabled={createMutation.isPending}
              >
                <option value="">Select invoice</option>

                {invoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoiceNumber} —{" "}
                    {invoice.customerName} —{" "}
                    {formatMoney(invoice.totalAmount)}
                  </option>
                ))}
              </select>
            </div>

            {invoiceId && (
              <div aria-label="Selected invoice payment summary">
                <p>
                  <strong>Customer:</strong>{" "}
                  {selectedFormInvoice?.customerName ?? "-"}
                </p>

                <p>
                  <strong>Invoice Total:</strong>{" "}
                  {formSummary
                    ? formatMoney(formSummary.totalAmount)
                    : selectedFormInvoice
                      ? formatMoney(selectedFormInvoice.totalAmount)
                      : "-"}
                </p>

                {formSummaryQuery.isLoading && (
                  <p>Loading payment balance...</p>
                )}

                {formSummaryQuery.isError && (
                  <p role="alert">
                    {formSummaryQuery.error instanceof ApiError
                      ? formSummaryQuery.error.message
                      : "Failed to load the invoice payment balance."}
                  </p>
                )}

                {formSummary && (
                  <>
                    <p>
                      <strong>Amount Paid:</strong>{" "}
                      {formatMoney(formSummary.amountPaid)}
                    </p>

                    <p>
                      <strong>Outstanding Balance:</strong>{" "}
                      {formatMoney(formSummary.balance)}
                    </p>

                    <p>
                      <strong>Payment Status:</strong>{" "}
                      {statusLabel(formSummary.paymentStatus)}
                    </p>
                  </>
                )}
              </div>
            )}

            <div>
              <label htmlFor="payment-amount">
                Amount
              </label>

              <input
                id="payment-amount"
                type="number"
                min="1"
                step="1"
                max={formBalance !== null && formBalance > 0
                  ? formBalance
                  : undefined}
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setFormError(null);
                }}
                disabled={
                  createMutation.isPending ||
                  formSummaryQuery.isLoading ||
                  formBalance === 0
                }
              />

              {formBalance !== null && formBalance > 0 && (
                <p>
                  Maximum payment: {formatMoney(formBalance)}
                </p>
              )}

              {formBalance === 0 && (
                <p>This invoice is already fully paid.</p>
              )}
            </div>

            <div>
              <label htmlFor="payment-method">
                Payment Method
              </label>

              <select
                id="payment-method"
                value={method}
                onChange={(event) =>
                  setMethod(
                    event.target.value as PaymentMethod,
                  )
                }
                disabled={createMutation.isPending}
              >
                <option value="CASH">Cash</option>
                <option value="TRANSFER">Transfer</option>
                <option value="POS">POS</option>
                <option value="PAY_FROM_ACCOUNT">Pay from Account</option>
              </select>

              {method === "PAY_FROM_ACCOUNT" && (
                <div className="form-help">
                  {formAccountQuery.isLoading && "Loading customer account balance..."}
                  {formAccountQuery.isError && (
                    <span>
                      Unable to load the customer account balance.
                    </span>
                  )}
                  {formAccountBalance !== null && (
                    <span>
                      Available account balance:{" "}
                      <strong>{formatMoney(formAccountBalance)}</strong>
                    </span>
                  )}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="payment-reference">
                Reference
              </label>

              <input
                id="payment-reference"
                type="text"
                value={reference}
                onChange={(event) =>
                  setReference(event.target.value)
                }
                disabled={createMutation.isPending}
                placeholder="Transfer/POS reference"
              />
            </div>

            <div>
              <label htmlFor="payment-note">
                Note
              </label>

              <textarea
                id="payment-note"
                value={note}
                onChange={(event) =>
                  setNote(event.target.value)
                }
                disabled={createMutation.isPending}
              />
            </div>

            {formError && <p role="alert">{formError}</p>}

            <button
              type="submit"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending
                ? "Recording..."
                : "Record Payment"}
            </button>

            <button
              type="button"
              onClick={resetForm}
              disabled={createMutation.isPending}
            >
              Cancel
            </button>
          </form>
        </section>
      )}

      {selectedInvoiceId && (
        <section aria-label="Invoice payment summary">
          <h2>Invoice Payment Summary</h2>

          {summaryQuery.isLoading && (
            <p>Loading summary...</p>
          )}

          {summaryQuery.isError && (
            <p role="alert">
              {summaryQuery.error instanceof ApiError
                ? summaryQuery.error.message
                : "Failed to load payment summary."}
            </p>
          )}

          {summary && (
            <>
              <p>
                <strong>Invoice:</strong>{" "}
                {summary.invoiceNumber}
              </p>

              <p>
                <strong>Total:</strong>{" "}
                {formatMoney(summary.totalAmount)}
              </p>

              <p>
                <strong>Amount Paid:</strong>{" "}
                {formatMoney(summary.amountPaid)}
              </p>

              <p>
                <strong>Balance:</strong>{" "}
                {formatMoney(summary.balance)}
              </p>

              <p>
                <strong>Payment Status:</strong>{" "}
                {statusLabel(summary.paymentStatus)}
              </p>

              {summary.payments.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Status</th>
                      <th>Reference</th>
                      <th>Date</th>
                    </tr>
                  </thead>

                  <tbody>
                    {summary.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{formatMoney(payment.amount)}</td>
                        <td>{payment.method}</td>
                        <td>{statusLabel(payment.status)}</td>
                        <td>{payment.reference ?? "-"}</td>
                        <td>{formatDate(payment.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <button
                type="button"
                onClick={() =>
                  setSelectedInvoiceId(null)
                }
              >
                Close Summary
              </button>
            </>
          )}
        </section>
      )}
    </main>
  );
}

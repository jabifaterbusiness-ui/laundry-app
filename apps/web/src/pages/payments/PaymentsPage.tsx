import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import {
  createPayment,
  getInvoicePaymentSummary,
  listPayments,
  type PaymentMethod,
  type PaymentStatus,
} from "../../lib/payments-api.js";
import { listInvoices } from "../../lib/invoices-api.js";
import { useAuthStore } from "../../state/auth-store.js";

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
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const queryClient = useQueryClient();

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
    mutationFn: () =>
      createPayment(
        {
          invoiceId,
          amount: Number(amount),
          method,
          reference: reference.trim() || undefined,
          note: note.trim() || undefined,
        },
        { accessToken },
        activeBranchId,
      ),
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

  const payments = paymentsQuery.data?.data ?? [];
  const pagination = paymentsQuery.data?.pagination;
  const invoices = invoicesQuery.data?.data ?? [];
  const summary = summaryQuery.data;

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
                onChange={(event) =>
                  setInvoiceId(event.target.value)
                }
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

            <div>
              <label htmlFor="payment-amount">
                Amount
              </label>

              <input
                id="payment-amount"
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value)
                }
                disabled={createMutation.isPending}
              />
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
              </select>
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

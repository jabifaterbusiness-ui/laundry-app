import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { InvoiceStatus } from "@laundry-app/shared";
import { ApiError } from "../../lib/api-client.js";
import {
  getCompanyReceipt,
  getCustomerReceipt,
  getInvoice,
  listInvoices,
} from "../../lib/invoices-api.js";
import { useAuthStore } from "../../state/auth-store.js";
import { CustomerReceipt } from "./receipt/CustomerReceipt.js";
import { CompanyReceipt } from "./receipt/CompanyReceipt.js";

const PAGE_SIZE = 25;

function formatMoney(value: number) {
  return `₦${value.toLocaleString()}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function statusLabel(status: InvoiceStatus) {
  return status.replaceAll("_", " ");
}

export function InvoicesPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<InvoiceStatus | "">("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  );
  const [printMode, setPrintMode] = useState<"customer" | "company" | null>(
    null,
  );

  const invoicesQuery = useQuery({
    queryKey: [
      "invoices",
      {
        page,
        status,
        branchId: activeBranchId,
      },
    ],
    queryFn: () =>
      listInvoices(
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

  const selectedInvoiceQuery = useQuery({
    queryKey: ["invoice", selectedInvoiceId, activeBranchId],
    queryFn: () =>
      getInvoice(
        selectedInvoiceId!,
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(
      accessToken && activeBranchId && selectedInvoiceId,
    ),
  });

  const invoices = invoicesQuery.data?.data ?? [];
  const pagination = invoicesQuery.data?.pagination;
  const selectedInvoice = selectedInvoiceQuery.data;

  const customerReceiptQuery = useQuery({
    queryKey: ["invoice-receipt", "customer", selectedInvoiceId, activeBranchId],
    queryFn: () =>
      getCustomerReceipt(
        selectedInvoiceId!,
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(
      accessToken &&
        activeBranchId &&
        selectedInvoiceId &&
        printMode === "customer",
    ),
  });

  const companyReceiptQuery = useQuery({
    queryKey: ["invoice-receipt", "company", selectedInvoiceId, activeBranchId],
    queryFn: () =>
      getCompanyReceipt(
        selectedInvoiceId!,
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(
      accessToken &&
        activeBranchId &&
        selectedInvoiceId &&
        printMode === "company",
    ),
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "F1" || !selectedInvoiceId || !selectedInvoice) {
        return;
      }

      event.preventDefault();
      setPrintMode(event.ctrlKey ? "company" : "customer");
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedInvoiceId, selectedInvoice]);

  useEffect(() => {
    if (!printMode || !selectedInvoice) {
      return;
    }

    const printClass =
      printMode === "customer"
        ? "printing-customer"
        : "printing-company";

    document.body.classList.add(printClass);

    const timer = window.setTimeout(() => {
      window.print();
    }, 50);

    function handleAfterPrint() {
      window.clearTimeout(timer);
      document.body.classList.remove(
        "printing-customer",
        "printing-company",
      );
      setPrintMode(null);
    }

    window.addEventListener("afterprint", handleAfterPrint);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", handleAfterPrint);
      document.body.classList.remove(
        "printing-customer",
        "printing-company",
      );
    };
  }, [printMode, selectedInvoice]);

  return (
    <main>
      <h1>Invoices & Receipts</h1>

      <div>
        <select
          aria-label="Filter invoices by status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as InvoiceStatus | "");
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="ISSUED">Issued</option>
          <option value="VOID">Void</option>
        </select>
      </div>

      {invoicesQuery.isLoading && <p>Loading invoices...</p>}

      {invoicesQuery.isError && (
        <p role="alert">
          {invoicesQuery.error instanceof ApiError
            ? invoicesQuery.error.message
            : "Failed to load invoices. Please try again."}
        </p>
      )}

      {invoicesQuery.isSuccess && invoices.length === 0 && (
        <p>No invoices found.</p>
      )}

      {invoices.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Customer</th>
              <th>Order</th>
              <th>Status</th>
              <th>Total</th>
              <th>Created</th>
            </tr>
          </thead>

          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>
                  <button
                    type="button"
                    onClick={() => setSelectedInvoiceId(invoice.id)}
                  >
                    {invoice.invoiceNumber}
                  </button>
                </td>
                <td>{invoice.customerName}</td>
                <td>{invoice.orderId}</td>
                <td>{statusLabel(invoice.status)}</td>
                <td>{formatMoney(invoice.totalAmount)}</td>
                <td>{formatDate(invoice.createdAt)}</td>
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

      {selectedInvoice && (
        <section aria-label="Invoice details">
          <h2>Invoice {selectedInvoice.invoiceNumber}</h2>

          <p>
            <strong>Customer:</strong> {selectedInvoice.customerName}
          </p>

          <p>
            <strong>Status:</strong>{" "}
            {statusLabel(selectedInvoice.status)}
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
              {selectedInvoice.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.quantity}</td>
                  <td>{item.itemName}</td>
                  <td>{item.totalPieces}</td>
                  <td>{formatMoney(item.unitPrice)}</td>
                  <td>{formatMoney(item.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p>
            <strong>
              Total: {formatMoney(selectedInvoice.totalAmount)}
            </strong>
          </p>

          {selectedInvoice.garmentNote && (
            <p>
              <strong>Garment Note:</strong>{" "}
              {selectedInvoice.garmentNote}
            </p>
          )}

          <p>
            <strong>Customer Agreement:</strong>{" "}
            {selectedInvoice.customerAgreement}
          </p>

          <div>
            <button
              type="button"
              onClick={() => setPrintMode("customer")}
            >
              Print Customer Copy (F1)
            </button>

            <button
              type="button"
              onClick={() => setPrintMode("company")}
            >
              Print Company Copy (Ctrl+F1)
            </button>

            <button
              type="button"
              onClick={() => setSelectedInvoiceId(null)}
            >
              Close
            </button>
          </div>
        </section>
      )}

      {selectedInvoice && (
        <div className="invoice-print-area" aria-hidden="true">
          <div className="invoice-print-customer">
            {customerReceiptQuery.data && (
              <CustomerReceipt receipt={customerReceiptQuery.data} />
            )}
          </div>

          <div className="invoice-print-company">
            {companyReceiptQuery.data && (
              <CompanyReceipt receipt={companyReceiptQuery.data} />
            )}
          </div>
        </div>
      )}
    </main>
  );
}

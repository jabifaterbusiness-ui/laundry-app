import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBusinessBranding } from "../../lib/businesses-api.js";
import type { InvoiceStatus } from "@laundry-app/shared";
import { ApiError } from "../../lib/api-client.js";
import {
  deleteInvoice,
  getCompanyReceipt,
  getCustomerReceipt,
  getInvoice,
  getInvoiceHistory,
  listInvoices,
  transferInvoice,
  updateInvoice,
  updateInvoiceFinancialRules,
  voidInvoice,
} from "../../lib/invoices-api.js";
import { listCustomers } from "../../lib/customers-api.js";
import { listPricingRules } from "../../lib/services-api.js";
import { useSensitiveAuthorization } from "../../components/auth/SensitiveAuthorizationProvider.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";
import { QUICK_OPERATIONS } from "../../lib/quick-operations-catalog.js";
import { CustomerReceipt } from "./receipt/CustomerReceipt.js";
import { CompanyReceipt } from "./receipt/CompanyReceipt.js";

const PAGE_SIZE = 25;

function formatMoney(value: number) {
  return `₦${value.toLocaleString()}`;
}

function appliedAdjustmentItemIndexes(
  rule: { itemIndexes?: number[]; itemIds?: string[] },
  items: Array<{ id: string }>,
): number[] {
  if (rule.itemIndexes?.length) return [...rule.itemIndexes];
  return (rule.itemIds ?? [])
    .map((itemId) => items.findIndex((item) => item.id === itemId))
    .filter((index) => index >= 0);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function statusLabel(status: InvoiceStatus) {
  return status.replaceAll("_", " ");
}

export function InvoicesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const invoiceIdFromUrl = searchParams.get("invoiceId");
  const invoiceActionFromUrl = searchParams.get("action");
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const canManageInvoices = hasPermission(user, "invoices.manage");
  const canViewInvoices = hasPermission(user, "invoices.view");
  const canViewPayments = hasPermission(user, "payments.view");

  const [page, setPage] = useState(1);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "">("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  );
  const [printMode, setPrintMode] = useState<"customer" | "company" | null>(
    null,
  );
  const [correctionMode, setCorrectionMode] = useState<
    "edit" | "financial" | "transfer" | "void" | "delete" | "history" | null
  >(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [targetCustomerId, setTargetCustomerId] = useState("");
  const [garmentNote, setGarmentNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [customerAgreement, setCustomerAgreement] = useState("");
  const [financialAdjustments, setFinancialAdjustments] = useState<Record<string, { scope: "INVOICE" | "ITEMS"; itemIndexes: number[] }>>({});
  const [financialTaxRuleIds, setFinancialTaxRuleIds] = useState<string[]>([]);
  const { requestSensitiveAuthorization } = useSensitiveAuthorization();
  const [editItems, setEditItems] = useState<
    Array<{
      itemName: string;
      colors: string[];
      piecesPerUnit: number;
      quantity: number;
      unitPrice: number;
    }>
  >([]);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  const brandingQuery = useQuery({
    queryKey: ["business-branding", activeBranchId],
    queryFn: () =>
      getBusinessBranding(
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(accessToken && activeBranchId),
  });

  const invoicesQuery = useQuery({
    queryKey: [
      "invoices",
      {
        page,
        status,
        search: invoiceSearch,
        branchId: activeBranchId,
      },
    ],
    queryFn: () =>
      listInvoices(
        {
          page,
          pageSize: PAGE_SIZE,
          status: status || undefined,
          search: invoiceSearch.trim() || undefined,
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

  const pricingRulesQuery = useQuery({
    queryKey: ["pricing-rules", "invoice-correction", activeBranchId],
    queryFn: () => listPricingRules({ accessToken }),
    enabled: Boolean(accessToken && activeBranchId && canManageInvoices),
  });

  const invoices = invoicesQuery.data?.data ?? [];
  const pagination = invoicesQuery.data?.pagination;
  const selectedInvoice = selectedInvoiceQuery.data;
  const pricingAdjustments = pricingRulesQuery.data?.adjustments ?? [];
  const manualPricingAdjustments = pricingAdjustments.filter(
    (rule) => rule.targetScope === "MANUAL",
  );
  const manualPricingAdjustmentIds = new Set(manualPricingAdjustments.map((rule) => rule.id));
  const existingNonManualAdjustments = (selectedInvoice?.appliedAdjustments ?? []).filter(
    (rule) => !manualPricingAdjustmentIds.has(rule.id),
  );

  useEffect(() => {
    if (invoiceIdFromUrl && selectedInvoiceId !== invoiceIdFromUrl) {
      setSelectedInvoiceId(invoiceIdFromUrl);
    }
  }, [invoiceIdFromUrl, selectedInvoiceId]);

  const customersQuery = useQuery({
    queryKey: ["invoice-transfer-customers", customerSearch],
    queryFn: () =>
      listCustomers(
        {
          page: 1,
          pageSize: 25,
          search: customerSearch.trim() || undefined,
          status: "all",
        },
        { accessToken },
      ),
    enabled: Boolean(
      accessToken &&
        activeBranchId &&
        correctionMode === "transfer",
    ),
  });

  const historyQuery = useQuery({
    queryKey: ["invoice-history", selectedInvoiceId, activeBranchId],
    queryFn: () =>
      getInvoiceHistory(
        selectedInvoiceId!,
        { accessToken },
        activeBranchId,
      ),
    enabled: Boolean(
      accessToken &&
        activeBranchId &&
        selectedInvoiceId &&
        correctionMode === "history",
    ),
  });

  function resetCorrectionState() {
    setCorrectionMode(null);
    setReason("");
    setConfirmed(false);
    setCustomerSearch("");
    setTargetCustomerId("");
    setCorrectionError(null);
    setFinancialAdjustments({});
    setFinancialTaxRuleIds([]);
  }

  function startEdit() {
    if (!selectedInvoice) return;

    setCorrectionError(null);
    setReason("");
    setConfirmed(false);
    setGarmentNote(selectedInvoice.garmentNote ?? "");
    setInternalNote(selectedInvoice.internalNote ?? "");
    setCustomerAgreement(selectedInvoice.customerAgreement);
    setEditItems(
      selectedInvoice.items.map((item) => ({
        itemName: item.itemName,
        colors: item.colors ?? [],
        piecesPerUnit: item.piecesPerUnit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    );
    setCorrectionMode("edit");
  }

  function startFinancialCorrection() {
    if (!selectedInvoice || selectedInvoice.status !== "ISSUED") return;
    setCorrectionError(null);
    setReason("");
    setConfirmed(false);
    setFinancialAdjustments(Object.fromEntries(
      (selectedInvoice.appliedAdjustments ?? []).map((rule) => [rule.id, {
        scope: rule.scope,
        itemIndexes: rule.scope === "ITEMS"
          ? appliedAdjustmentItemIndexes(rule, selectedInvoice.items)
          : [],
      }]),
    ));
    setFinancialTaxRuleIds((selectedInvoice.appliedTaxes ?? []).map((tax) => tax.id));
    setCorrectionMode("financial");
  }

  function startTransfer() {
    setCorrectionError(null);
    setReason("");
    setConfirmed(false);
    setCustomerSearch("");
    setTargetCustomerId("");
    setCorrectionMode("transfer");
  }

  function startDestructiveCorrection(
    mode: "void" | "delete",
  ) {
    setCorrectionError(null);
    setReason("");
    setConfirmed(false);
    setCorrectionMode(mode);
  }

  useEffect(() => {
    if (
      !selectedInvoice ||
      selectedInvoiceId !== invoiceIdFromUrl ||
      !invoiceActionFromUrl ||
      !canManageInvoices ||
      correctionMode
    ) {
      return;
    }

    if (invoiceActionFromUrl === "edit") {
      startEdit();
    } else if (invoiceActionFromUrl === "transfer") {
      startTransfer();
    } else if (invoiceActionFromUrl === "void") {
      startDestructiveCorrection("void");
    } else if (invoiceActionFromUrl === "delete") {
      startDestructiveCorrection("delete");
    } else if (invoiceActionFromUrl === "history") {
      setCorrectionError(null);
      setCorrectionMode("history");
    } else {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.delete("action");
    setSearchParams(next, { replace: true });
  }, [
    selectedInvoice,
    selectedInvoiceId,
    invoiceIdFromUrl,
    invoiceActionFromUrl,
    canManageInvoices,
    correctionMode,
    searchParams,
    setSearchParams,
  ]);

  const correctionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInvoiceId) {
        throw new Error("Select an invoice first.");
      }

      const trimmedReason = reason.trim();

      if (!trimmedReason) {
        throw new Error(
          "A reason is required before completing this correction.",
        );
      }

      if (!confirmed) {
        throw new Error(
          "Please confirm that you want to perform this correction.",
        );
      }

      if (correctionMode === "edit") {
        return updateInvoice(
          selectedInvoiceId,
          {
            reason: trimmedReason,
            confirmed: true,
            garmentNote: garmentNote.trim() || null,
            internalNote: internalNote.trim() || null,
            customerAgreement: customerAgreement.trim(),
            items: editItems,
          },
          { accessToken },
          activeBranchId,
        );
      }

      if (correctionMode === "financial") {
        const authorization = await requestSensitiveAuthorization();
        if (!authorization) throw new Error("Sensitive authorization is required for financial corrections.");
        return updateInvoiceFinancialRules(
          selectedInvoiceId,
          {
            reason: trimmedReason,
            confirmed: true,
            adjustments: Object.entries(financialAdjustments).map(([adjustmentId, selection]) => ({
              adjustmentId, scope: selection.scope,
              ...(selection.scope === "ITEMS" ? { itemIndexes: selection.itemIndexes } : {}),
            })),
            taxRuleIds: financialTaxRuleIds,
          },
          { accessToken, sensitiveAuthorization: authorization },
          activeBranchId,
        );
      }

      if (correctionMode === "transfer") {
        if (!targetCustomerId) {
          throw new Error(
            "Select the customer to receive this invoice.",
          );
        }

        return transferInvoice(
          selectedInvoiceId,
          {
            customerId: targetCustomerId,
            reason: trimmedReason,
            confirmed: true,
          },
          { accessToken },
          activeBranchId,
        );
      }

      if (correctionMode === "void") {
        return voidInvoice(
          selectedInvoiceId,
          {
            reason: trimmedReason,
            confirmed: true,
          },
          { accessToken },
          activeBranchId,
        );
      }

      if (correctionMode === "delete") {
        return deleteInvoice(
          selectedInvoiceId,
          {
            reason: trimmedReason,
            confirmed: true,
          },
          { accessToken },
          activeBranchId,
        );
      }

      throw new Error("Choose an invoice correction.");
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
        queryClient.invalidateQueries({
          queryKey: ["invoice", selectedInvoiceId, activeBranchId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["invoice-history", selectedInvoiceId, activeBranchId],
        }),
      ]);

      resetCorrectionState();
    },
    onError: (error: unknown) => {
      setCorrectionError(
        error instanceof Error
          ? error.message
          : "Unable to complete the invoice correction.",
      );
    },
  });

  const customerReceiptQuery = useQuery({
    queryKey: ["invoice-receipt", "customer", selectedInvoiceId, activeBranchId],
    queryFn: () =>
      getCustomerReceipt(
        selectedInvoiceId!,
        { accessToken },
        activeBranchId,
      ),
    // Load the customer-safe receipt projection for the on-screen invoice
    // as well as printing, so payment history and balance stay in sync.
    enabled: Boolean(accessToken && activeBranchId && selectedInvoiceId && (canViewPayments || printMode === "customer")),
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

      if (event.ctrlKey && event.shiftKey) {
        const resendReceiptOperation = QUICK_OPERATIONS.find(
          (operation) => operation.code === "RS",
        );

        if (!resendReceiptOperation) {
          return;
        }

        window.dispatchEvent(
          new CustomEvent("quick-operation:open", {
            detail: {
              ...resendReceiptOperation,
              recordId: selectedInvoiceId,
            },
          }),
        );
        return;
      }

      setPrintError(null);
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

    const receiptQuery =
      printMode === "customer"
        ? customerReceiptQuery
        : companyReceiptQuery;

    if (receiptQuery.isLoading || receiptQuery.isFetching) {
      return;
    }

    if (receiptQuery.isError || !receiptQuery.data) {
      setPrintError(
        receiptQuery.error instanceof Error
          ? receiptQuery.error.message
          : `Unable to load the ${printMode} receipt. Please try again.`,
      );
      setPrintMode(null);
      return;
    }

    setPrintError(null);

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
  }, [
    printMode,
    selectedInvoice,
    customerReceiptQuery.isLoading,
    customerReceiptQuery.isFetching,
    customerReceiptQuery.isError,
    customerReceiptQuery.data,
    companyReceiptQuery.isLoading,
    companyReceiptQuery.isFetching,
    companyReceiptQuery.isError,
    companyReceiptQuery.data,
  ]);

  return (
    <main>
      <h1>Invoices & Receipts</h1>
      <label style={{ display: "block", maxWidth: 520, margin: "12px 0" }}>
        Search invoices
        <input type="search" name="invoices-search" autoComplete="off" placeholder="Invoice or order number, customer name, phone or email" value={invoiceSearch} onChange={(event) => { setInvoiceSearch(event.target.value); setPage(1); }} style={{ width: "100%", boxSizing: "border-box", marginTop: 6 }} />
      </label>

      {printError && (
        <p role="alert">
          {printError}
        </p>
      )}

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
                <th>Colours</th>
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
                  <td>{(item.colors ?? []).length ? item.colors.join(", ") : "—"}</td>
                  <td>{item.totalPieces}</td>
                  <td>{formatMoney(item.unitPrice)}</td>
                  <td>{formatMoney(item.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section
            aria-label="Invoice financial breakdown"
            style={{
              marginTop: 16,
              padding: 14,
              border: "1px solid #d8dee8",
              borderRadius: 12,
              display: "grid",
              gap: 8,
            }}
          >
            <h3 style={{ margin: 0 }}>Financial breakdown</h3>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>Service subtotal</span>
              <strong>{formatMoney(selectedInvoice.subtotal)}</strong>
            </div>
            {(selectedInvoice.appliedAdjustments ?? []).map((adjustment) => (
              <div key={adjustment.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>{adjustment.name} ({adjustment.percentage > 0 ? "+" : ""}{adjustment.percentage}%)</span>
                <strong>{adjustment.amount < 0 ? "−" : adjustment.amount > 0 ? "+" : ""}{formatMoney(Math.abs(adjustment.amount))}</strong>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>Adjusted taxable amount</span>
              <strong>{formatMoney(selectedInvoice.adjustedSubtotal)}</strong>
            </div>
            {(selectedInvoice.appliedTaxes ?? []).map((tax) => (
              <div key={tax.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>{tax.name} ({tax.kind === "PERCENTAGE" ? `${tax.value}%` : "Fixed"}) · {tax.treatment === "WITHHOLDING" ? "Withheld" : "Added"}</span>
                <strong>{tax.treatment === "WITHHOLDING" ? "−" : "+"}{formatMoney(tax.amount)}</strong>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: "1px solid #d8dee8", paddingTop: 8 }}>
              <span>Total pieces</span>
              <strong>{selectedInvoice.items.reduce((total, item) => total + item.totalPieces, 0)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 18, borderTop: "2px solid #111827", paddingTop: 8 }}>
              <strong>TOTAL AMOUNT</strong>
              <strong>{formatMoney(selectedInvoice.totalAmount)}</strong>
            </div>
          </section>

          {canViewPayments ? (
            <section
              aria-label="Invoice payment history"
              style={{
                marginTop: 14,
                padding: 14,
                border: "1px solid #d8dee8",
                borderRadius: 12,
              }}
            >
              <h3 style={{ margin: "0 0 10px" }}>Payment history</h3>
              {customerReceiptQuery.isLoading ? <p>Loading payment history...</p> : null}
              {customerReceiptQuery.isError ? (
                <p role="alert">Unable to load payment history. The invoice total above remains available.</p>
              ) : null}
              {customerReceiptQuery.data?.payments.length ? (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Method</th><th>Reference</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                      {customerReceiptQuery.data.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td>{formatDate(payment.createdAt)}</td>
                          <td>{payment.type === "REFUND" ? "Refund" : ({
                            CASH: "Cash",
                            TRANSFER: "Bank transfer",
                            POS: "POS",
                            PAY_FROM_ACCOUNT: "Customer account",
                          } as const)[payment.method]}</td>
                          <td>{payment.reference || "—"}</td>
                          <td>{payment.type === "REFUND" ? "−" : ""}{formatMoney(payment.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : customerReceiptQuery.data ? (
                <p>No payments recorded.</p>
              ) : null}
              {customerReceiptQuery.data && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 12, borderTop: "1px solid #d8dee8", paddingTop: 10 }}>
                  <div><span>Total amount</span><strong style={{ display: "block" }}>{formatMoney(customerReceiptQuery.data.totalAmount)}</strong></div>
                  <div><span>Amount paid</span><strong style={{ display: "block" }}>{formatMoney(customerReceiptQuery.data.totalPaid)}</strong></div>
                  <div><span>Balance due</span><strong style={{ display: "block" }}>{formatMoney(customerReceiptQuery.data.balanceDue)}</strong></div>
                </div>
              )}
            </section>
          ) : (
            <p>Payment details require the payments.view permission.</p>
          )}

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

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 16,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setPrintError(null);
                setPrintMode("customer");
              }}
            >
              Print Customer Copy (FN+F1)
            </button>

            <button
              type="button"
              onClick={() => {
                setPrintError(null);
                setPrintMode("company");
              }}
            >
              Print Company Copy (Ctrl+F1)
            </button>

            <button
              type="button"
              onClick={() => {
                const resendReceiptOperation = QUICK_OPERATIONS.find(
                  (operation) => operation.code === "RS",
                );

                if (!resendReceiptOperation) {
                  return;
                }

                window.dispatchEvent(
                  new CustomEvent("quick-operation:open", {
                    detail: {
                      ...resendReceiptOperation,
                      recordId: selectedInvoice.id,
                    },
                  }),
                );
              }}
            >
              Digital Receipt (Ctrl+Shift+F1)
            </button>

            {canManageInvoices ? (
              <>
                <button type="button" onClick={startEdit}>
                  Edit Invoice
                </button>
                {selectedInvoice.status === "ISSUED" ? (
                  <button type="button" onClick={startFinancialCorrection}>Adjust Discounts & Taxes</button>
                ) : null}

                <button type="button" onClick={startTransfer}>
                  Transfer Invoice
                </button>

                {selectedInvoice.status === "ISSUED" ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        startDestructiveCorrection("void")
                      }
                    >
                      Void Invoice
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        startDestructiveCorrection("delete")
                      }
                    >
                      Delete Invoice
                    </button>
                  </>
                ) : null}
              </>
            ) : null}

            {canViewInvoices ? (
              <button
                type="button"
                onClick={() => setCorrectionMode("history")}
              >
                Edited History
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                resetCorrectionState();
                setSelectedInvoiceId(null);
              }}
            >
              Close
            </button>
          </div>
        </section>
      )}

      {selectedInvoice && correctionMode && correctionMode !== "history" ? (
        <section
          role="dialog"
          aria-label={`Correct invoice ${selectedInvoice.invoiceNumber}`}
          style={{
            marginTop: 20,
            padding: 20,
            border: "1px solid #ddd",
            borderRadius: 10,
          }}
        >
          <h3>
            {correctionMode === "edit"
              ? "Edit Invoice"
              : correctionMode === "financial"
                ? "Adjust Discounts & Taxes"
                : correctionMode === "transfer"
                  ? "Transfer Invoice"
                  : correctionMode === "void"
                    ? "Void Invoice"
                    : "Delete Invoice"}
          </h3>

          {correctionMode === "edit" ? (
            <>
              <label>
                Garment / Customer Note
                <textarea
                  value={garmentNote}
                  onChange={(event) =>
                    setGarmentNote(event.target.value)
                  }
                  maxLength={2000}
                  style={{ display: "block", width: "100%" }}
                />
              </label>

              <label>
                Internal Note
                <textarea
                  value={internalNote}
                  onChange={(event) =>
                    setInternalNote(event.target.value)
                  }
                  maxLength={2000}
                  style={{ display: "block", width: "100%" }}
                />
              </label>

              <label>
                Customer Agreement
                <textarea
                  value={customerAgreement}
                  onChange={(event) =>
                    setCustomerAgreement(event.target.value)
                  }
                  maxLength={2000}
                  style={{ display: "block", width: "100%" }}
                />
              </label>

              <h4>Invoice Items</h4>

              {editItems.map((item, index) => (
                <div
                  key={`${selectedInvoice.id}-edit-item-${index}`}
                  style={{
                    display: "grid",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <input
                    aria-label={`Item ${index + 1} name`}
                    value={item.itemName}
                    onChange={(event) =>
                      setEditItems((current) =>
                        current.map((entry, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...entry,
                                itemName: event.target.value,
                              }
                            : entry,
                        ),
                      )
                    }
                  />

                  <input
                    aria-label={`Item ${index + 1} colours`}
                    value={item.colors.join(", ")}
                    onChange={(event) =>
                      setEditItems((current) =>
                        current.map((entry, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...entry,
                                colors: event.target.value
                                  .split(",")
                                  .map((value) => value.trim())
                                  .filter(Boolean),
                              }
                            : entry,
                        ),
                      )
                    }
                  />

                  <input
                    aria-label={`Item ${index + 1} pieces per unit`}
                    type="number"
                    min="1"
                    value={item.piecesPerUnit}
                    onChange={(event) =>
                      setEditItems((current) =>
                        current.map((entry, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...entry,
                                piecesPerUnit: Number(
                                  event.target.value,
                                ),
                              }
                            : entry,
                        ),
                      )
                    }
                  />

                  <input
                    aria-label={`Item ${index + 1} quantity`}
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(event) =>
                      setEditItems((current) =>
                        current.map((entry, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...entry,
                                quantity: Number(event.target.value),
                              }
                            : entry,
                        ),
                      )
                    }
                  />

                  <input
                    aria-label={`Item ${index + 1} unit price`}
                    type="number"
                    min="0"
                    value={item.unitPrice}
                    onChange={(event) =>
                      setEditItems((current) =>
                        current.map((entry, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...entry,
                                unitPrice: Number(
                                  event.target.value,
                                ),
                              }
                            : entry,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </>
          ) : null}

          {correctionMode === "financial" ? (
            <section aria-label="Adjust invoice discounts and taxes">
              <p>Apply or remove financial rules on this existing invoice. The original invoice state is saved in Edited History. A change that would make the amount paid exceed the new invoice total is blocked.</p>
              <h4>Manual adjustments</h4>
              {manualPricingAdjustments.map((rule) => {
                const selection = financialAdjustments[rule.id];
                return <div key={rule.id} style={{ padding: "8px 0", borderBottom: "1px solid #e5e7eb" }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(selection)}
                      disabled={!rule.isActive && !selection}
                      onChange={(event) => setFinancialAdjustments((current) => {
                        const next = { ...current };
                        if (event.target.checked) next[rule.id] = { scope: "INVOICE", itemIndexes: [] };
                        else delete next[rule.id];
                        return next;
                      })}
                    />
                    {rule.name} ({rule.percentage > 0 ? "+" : ""}{rule.percentage}%)
                    {!rule.isActive ? " · Inactive" : ""}
                  </label>
                  {selection ? <div style={{ marginLeft: 24 }}>
                    <label>Apply to<select value={selection.scope} onChange={(event) => setFinancialAdjustments((current) => ({ ...current, [rule.id]: { scope: event.target.value as "INVOICE" | "ITEMS", itemIndexes: [] } }))}>
                      <option value="INVOICE">Entire invoice</option><option value="ITEMS">Selected items only</option>
                    </select></label>
                    {selection.scope === "ITEMS" && selectedInvoice.items.map((item, index) => <label key={item.id} style={{ display: "block" }}>
                      <input type="checkbox" checked={selection.itemIndexes.includes(index)} onChange={(event) => setFinancialAdjustments((current) => {
                        const existing = current[rule.id] ?? { scope: "ITEMS" as const, itemIndexes: [] };
                        return { ...current, [rule.id]: { scope: "ITEMS", itemIndexes: event.target.checked ? [...existing.itemIndexes, index] : existing.itemIndexes.filter((value) => value !== index) } };
                      })} /> {item.itemName} × {item.quantity}
                    </label>)}
                  </div> : null}
                </div>;
              })}
              {manualPricingAdjustments.length === 0 && <p>No manual adjustments are available for this branch.</p>}
              {existingNonManualAdjustments.length > 0 && (
                <>
                  <h4>Previously applied customer/group discounts</h4>
                  <p>These discounts were applied automatically to this invoice. You may keep or remove an existing discount, but new automatic discounts cannot be selected manually.</p>
                  {existingNonManualAdjustments.map((rule) => {
                    const selection = financialAdjustments[rule.id];
                    return <label key={rule.id} style={{ display: "block", padding: "6px 0" }}>
                      <input type="checkbox" checked={Boolean(selection)} onChange={(event) => setFinancialAdjustments((current) => {
                        const next = { ...current };
                        if (event.target.checked) next[rule.id] = {
                          scope: rule.scope,
                          itemIndexes: rule.scope === "ITEMS"
                            ? appliedAdjustmentItemIndexes(rule, selectedInvoice.items)
                            : [],
                        };
                        else delete next[rule.id];
                        return next;
                      })} />
                      {rule.name} ({rule.percentage > 0 ? "+" : ""}{rule.percentage}%) · Previously applied
                    </label>;
                  })}
                </>
              )}
              <h4>Taxes</h4>
              {(pricingRulesQuery.data?.taxes ?? []).filter((rule) => rule.isActive).map((rule) => <label key={rule.id} style={{ display: "block", padding: "4px 0" }}>
                <input type="checkbox" checked={financialTaxRuleIds.includes(rule.id)} onChange={(event) => setFinancialTaxRuleIds((current) => event.target.checked ? [...current, rule.id] : current.filter((id) => id !== rule.id))} />
                {rule.name} — {rule.kind === "PERCENTAGE" ? `${rule.value}%` : formatMoney(rule.value)} · {rule.treatment === "ADDITIVE" ? "Added" : "Withheld"}
              </label>)}
              {pricingRulesQuery.isError && <p role="alert">Unable to load the current Price List rules.</p>}
            </section>
          ) : null}

          {correctionMode === "transfer" ? (
            <>
              <p>
                Invoice number{" "}
                <strong>{selectedInvoice.invoiceNumber}</strong>{" "}
                will be retained.
              </p>

              <label>
                Search customer
                <input
                  type="search"
                  value={customerSearch}
                  onChange={(event) =>
                    setCustomerSearch(event.target.value)
                  }
                  placeholder="Search by customer name or phone"
                  style={{ display: "block", width: "100%" }}
                />
              </label>

              <label>
                Target customer
                <select
                  value={targetCustomerId}
                  onChange={(event) =>
                    setTargetCustomerId(event.target.value)
                  }
                  style={{ display: "block", width: "100%" }}
                >
                  <option value="">Select customer</option>
                  {(customersQuery.data?.data ?? []).map(
                    (customer) => (
                      <option
                        key={customer.id}
                        value={customer.id}
                      >
                        {customer.name} — {customer.phone}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </>
          ) : null}

          {correctionMode === "void" ||
          correctionMode === "delete" ? (
            <p role="alert">
              {correctionMode === "delete"
                ? "Delete removes this invoice from active use. Its invoice number and edited history are retained."
                : "Voiding marks this invoice as void. The invoice history is retained."}
            </p>
          ) : null}

          <label>
            Reason for this edit
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Enter the reason for this change"
              maxLength={1000}
              required
              style={{ display: "block", width: "100%" }}
            />
          </label>

          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              marginTop: 12,
            }}
          >
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) =>
                setConfirmed(event.target.checked)
              }
              disabled={correctionMutation.isPending}
            />
            <span>
              I confirm that I want to perform this invoice edit.
            </span>
          </label>

          {correctionError ? (
            <p role="alert">{correctionError}</p>
          ) : null}

          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 14,
            }}
          >
            <button
              type="button"
              disabled={
                correctionMutation.isPending ||
                !reason.trim() ||
                !confirmed ||
                (correctionMode === "transfer" &&
                  !targetCustomerId)
              }
              onClick={() => correctionMutation.mutate()}
            >
              {correctionMutation.isPending
                ? "Saving..."
                : "Confirm Edit"}
            </button>

            <button
              type="button"
              disabled={correctionMutation.isPending}
              onClick={resetCorrectionState}
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {selectedInvoice && correctionMode === "history" ? (
        <section
          role="dialog"
          aria-label={`Invoice edited history ${selectedInvoice.invoiceNumber}`}
          style={{
            marginTop: 20,
            padding: 20,
            border: "1px solid #ddd",
            borderRadius: 10,
          }}
        >
          <h3>
            Edited History — {selectedInvoice.invoiceNumber}
          </h3>

          <p>
            Complete invoice snapshots are retained for 60 days from
            each correction.
          </p>

          {historyQuery.isLoading ? (
            <p>Loading edited history...</p>
          ) : null}

          {historyQuery.isError ? (
            <p role="alert">
              Unable to load invoice edited history.
            </p>
          ) : null}

          {historyQuery.data?.length === 0 ? (
            <p>No edited history exists for this invoice.</p>
          ) : null}

          {historyQuery.data && historyQuery.data.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Action</th>
                    <th>Reason</th>
                    <th>Actor</th>
                    <th>Created</th>
                    <th>Snapshot expires</th>
                  </tr>
                </thead>
                <tbody>
                  {historyQuery.data.map((entry) => (
                    <React.Fragment key={entry.id}>
                      <tr>
                        <td>{entry.version}</td>
                        <td>{entry.action}</td>
                        <td>{entry.reason}</td>
                        <td>{entry.actorName ?? "Unavailable user"}</td>
                        <td>{formatDate(entry.createdAt)}</td>
                        <td>{formatDate(entry.expiresAt)}</td>
                      </tr>
                      <tr>
                        <td colSpan={6}>
                          <details>
                            <summary>
                              View Snapshot — Version {entry.version}
                            </summary>
                            <pre
                              style={{
                                marginTop: 12,
                                padding: 12,
                                overflowX: "auto",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                background: "#f7f7f7",
                                borderRadius: 6,
                              }}
                            >
                              {JSON.stringify(entry.snapshot, null, 2)}
                            </pre>
                          </details>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <button
            type="button"
            onClick={resetCorrectionState}
          >
            Close History
          </button>
        </section>
      ) : null}

      {selectedInvoice && (
        <div className="invoice-print-area" aria-hidden="true">
          <div className="invoice-print-customer">
            {customerReceiptQuery.data && (
              <CustomerReceipt receipt={customerReceiptQuery.data} branding={brandingQuery.data} />
            )}
          </div>

          <div className="invoice-print-company">
            {companyReceiptQuery.data && (
              <CompanyReceipt receipt={companyReceiptQuery.data} branding={brandingQuery.data} />
            )}
          </div>
        </div>
      )}
    </main>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Customer } from "@laundry-app/shared";
import { ApiError } from "../../lib/api-client.js";
import {
  getCustomer,
  listCustomers,
  updateCustomer,
} from "../../lib/customers-api.js";
import {
  fundCustomerAccount,
  getCustomerAccount,
} from "../../lib/customer-account-api.js";
import { listOrders } from "../../lib/orders-api.js";
import {
  getCompanyReceipt,
  getCustomerReceipt,
  listInvoices,
} from "../../lib/invoices-api.js";
import {
  createPayment,
  getInvoicePaymentSummary,
  type InvoicePaymentSummary,
  type PaymentMethod,
} from "../../lib/payments-api.js";
import { useSensitiveAuthorization } from "../../components/auth/SensitiveAuthorizationProvider.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";
import { CustomerReceipt } from "../invoices/receipt/CustomerReceipt.js";
import { CompanyReceipt } from "../invoices/receipt/CompanyReceipt.js";

function formatMoney(value: number) {
  return `₦${value.toLocaleString()}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

async function listAllCustomerOrders(
  customerId: string,
  accessToken: string | null,
  branchId: string,
) {
  const pageSize = 100;

  const firstPage = await listOrders(
    { page: 1, pageSize, customerId },
    { accessToken },
    branchId,
  );

  if (firstPage.pagination.totalPages <= 1) {
    return firstPage.data;
  }

  const remainingPages = await Promise.all(
    Array.from(
      { length: firstPage.pagination.totalPages - 1 },
      (_, index) =>
        listOrders(
          { page: index + 2, pageSize, customerId },
          { accessToken },
          branchId,
        ),
    ),
  );

  return [
    ...firstPage.data,
    ...remainingPages.flatMap((result) => result.data),
  ];
}

async function listAllCustomerInvoices(
  customerId: string,
  accessToken: string | null,
  branchId: string,
) {
  const pageSize = 100;

  const firstPage = await listInvoices(
    { page: 1, pageSize, customerId },
    { accessToken },
    branchId,
  );

  if (firstPage.pagination.totalPages <= 1) {
    return firstPage.data;
  }

  const remainingPages = await Promise.all(
    Array.from(
      { length: firstPage.pagination.totalPages - 1 },
      (_, index) =>
        listInvoices(
          { page: index + 2, pageSize, customerId },
          { accessToken },
          branchId,
        ),
    ),
  );

  return [
    ...firstPage.data,
    ...remainingPages.flatMap((result) => result.data),
  ];
}

export function CustomerWorkstationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const activeBranchId = useAuthStore((state) => state.activeBranchId);
  const user = useAuthStore((state) => state.user);
  const { requestSensitiveAuthorization } = useSensitiveAuthorization();

  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] =
    useState<Customer | null>(null);
  const firstTimelineEventRef = useRef<HTMLElement | null>(null);

  const customerIdFromUrl = searchParams.get("customerId");
  const [fundingOpen, setFundingOpen] = useState(false);
  const [fundingAmount, setFundingAmount] = useState("");
  const [fundingNote, setFundingNote] = useState("");
  const [fundingError, setFundingError] = useState<string | null>(null);

  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(
    null,
  );
  const [printInvoiceId, setPrintInvoiceId] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<
    "customer" | "company" | null
  >(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [notesOpen, setNotesOpen] = useState(false);
  const [customerNotes, setCustomerNotes] = useState("");
  const [notesError, setNotesError] = useState<string | null>(null);

  const canViewCustomers = hasPermission(user, "customers.view");
  const canViewOrders = hasPermission(user, "orders.view");
  const canCreateOrders = hasPermission(user, "orders.create");
  const canViewInvoices = hasPermission(user, "invoices.view");
  const canViewAccount = hasPermission(
    user,
    "customer_accounts.view",
  );
  const canManageAccount = hasPermission(
    user,
    "customer_accounts.manage",
  );
  const canViewPayments = hasPermission(user, "payments.view");
  const canManagePayments = hasPermission(user, "payments.manage");
  const canUpdateCustomers = hasPermission(user, "customers.update");

  const customerFromUrlQuery = useQuery({
    queryKey: ["customer-workstation", "customer", customerIdFromUrl],
    queryFn: () =>
      getCustomer(customerIdFromUrl!, { accessToken }),
    enabled: Boolean(
      accessToken && canViewCustomers && customerIdFromUrl,
    ),
  });

  const customerReceiptQuery = useQuery({
    queryKey: [
      "customer-workstation",
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
      "customer-workstation",
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

  const customersQuery = useQuery({
    queryKey: ["customer-workstation", "customers", search],
    queryFn: () =>
      listCustomers(
        {
          page: 1,
          pageSize: 25,
          search: search.trim() || undefined,
          status: "all",
        },
        { accessToken },
      ),
    enabled: Boolean(accessToken && canViewCustomers),
  });

  const accountQuery = useQuery({
    queryKey: ["customer-workstation", "account", selectedCustomer?.id],
    queryFn: () =>
      getCustomerAccount(selectedCustomer!.id, { accessToken }),
    enabled: Boolean(
      accessToken && selectedCustomer && canViewAccount,
    ),
  });

  const ordersQuery = useQuery({
    queryKey: [
      "customer-workstation",
      "orders",
      selectedCustomer?.id,
      activeBranchId,
    ],
    queryFn: () =>
      listAllCustomerOrders(
        selectedCustomer!.id,
        accessToken,
        activeBranchId!,
      ),
    enabled: Boolean(
      accessToken &&
        selectedCustomer &&
        activeBranchId &&
        canViewOrders,
    ),
  });

  const invoicesQuery = useQuery({
    queryKey: [
      "customer-workstation",
      "invoices",
      selectedCustomer?.id,
      activeBranchId,
    ],
    queryFn: () =>
      listAllCustomerInvoices(
        selectedCustomer!.id,
        accessToken,
        activeBranchId!,
      ),
    enabled: Boolean(
      accessToken &&
        selectedCustomer &&
        activeBranchId &&
        canViewInvoices,
    ),
  });

  const invoices = useMemo(
    () => invoicesQuery.data ?? [],
    [invoicesQuery.data],
  );

  const paymentSummariesQuery = useQuery({
    queryKey: [
      "customer-workstation",
      "invoice-payment-summaries",
      invoices.map((invoice) => invoice.id),
      activeBranchId,
    ],
    queryFn: async () => {
      const summaries = await Promise.all(
        invoices.map((invoice) =>
          getInvoicePaymentSummary(
            invoice.id,
            { accessToken },
            activeBranchId,
          ),
        ),
      );

      return summaries;
    },
    enabled: Boolean(
      accessToken &&
        activeBranchId &&
        selectedCustomer &&
        canViewPayments,
    ),
  });

  const paymentSummaries = useMemo(() => {
    const map = new Map<string, InvoicePaymentSummary>();

    paymentSummariesQuery.data?.forEach((summary) => {
      map.set(summary.invoiceId, summary);
    });

    return map;
  }, [paymentSummariesQuery.data]);

  useEffect(() => {
    if (!printMode || !printInvoiceId) {
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
      setPrintInvoiceId(null);
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
    printInvoiceId,
    customerReceiptQuery.isLoading,
    customerReceiptQuery.isFetching,
    customerReceiptQuery.isError,
    customerReceiptQuery.data,
    companyReceiptQuery.isLoading,
    companyReceiptQuery.isFetching,
    companyReceiptQuery.isError,
    companyReceiptQuery.data,
  ]);

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer || !paymentInvoiceId) {
        throw new Error("Customer and invoice are required.");
      }

      const numericAmount = Number(paymentAmount);

      if (!Number.isInteger(numericAmount) || numericAmount <= 0) {
        throw new Error(
          "Payment amount must be a positive whole number.",
        );
      }

      const summary = paymentSummaries.get(paymentInvoiceId);

      if (!summary) {
        throw new Error("Unable to load the invoice balance.");
      }

      if (numericAmount > summary.balance) {
        throw new Error(
          `Payment amount cannot exceed the outstanding balance of ${formatMoney(summary.balance)}.`,
        );
      }

      if (paymentMethod === "PAY_FROM_ACCOUNT") {
        if (!canViewAccount) {
          throw new Error(
            "Account access is required to pay from the customer account.",
          );
        }

        if (!accountQuery.data) {
          throw new Error(
            "Unable to load the customer account balance.",
          );
        }

        if (numericAmount > accountQuery.data.balance) {
          throw new Error(
            `Payment amount cannot exceed the available account balance of ${formatMoney(accountQuery.data.balance)}.`,
          );
        }
      }

      const authorization = await requestSensitiveAuthorization();

      if (!authorization) {
        throw new Error("Sensitive authorization was cancelled.");
      }

      return createPayment(
        {
          invoiceId: paymentInvoiceId,
          amount: numericAmount,
          method: paymentMethod,
          ...(paymentReference.trim()
            ? { reference: paymentReference.trim() }
            : {}),
          ...(paymentNote.trim()
            ? { note: paymentNote.trim() }
            : {}),
        },
        {
          accessToken,
          sensitiveAuthorization: authorization,
        },
        activeBranchId,
      );
    },
    onSuccess: async () => {
      setPaymentInvoiceId(null);
      setPaymentAmount("");
      setPaymentMethod("CASH");
      setPaymentReference("");
      setPaymentNote("");
      setPaymentError(null);

      await queryClient.invalidateQueries({
        queryKey: ["customer-workstation", "invoice-payment-summaries"],
      });

      if (selectedCustomer) {
        await queryClient.invalidateQueries({
          queryKey: [
            "customer-workstation",
            "account",
            selectedCustomer.id,
          ],
        });
      }
    },
    onError: (error) => {
      setPaymentError(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Unable to record payment.",
      );
    },
  });

  const notesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) {
        throw new Error("Customer is required.");
      }

      const authorization = await requestSensitiveAuthorization();

      if (!authorization) {
        throw new Error("Sensitive authorization is required.");
      }

      return updateCustomer(
        selectedCustomer.id,
        { notes: customerNotes.trim() },
        {
          accessToken,
          sensitiveAuthorization: authorization,
        },
      );
    },
    onSuccess: (updatedCustomer) => {
      setSelectedCustomer(updatedCustomer);
      setCustomerNotes(updatedCustomer.notes ?? "");
      setNotesOpen(false);
      setNotesError(null);
    },
    onError: (error) => {
      setNotesError(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Unable to update customer notes.",
      );
    },
  });

  const fundMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) {
        throw new Error("Customer is required.");
      }

      const amount = Number(fundingAmount);

      if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error("Funding amount must be a positive whole number.");
      }

      const authorization = await requestSensitiveAuthorization();

      if (!authorization) {
        throw new Error("Sensitive authorization was cancelled.");
      }

      return fundCustomerAccount(
        selectedCustomer.id,
        {
          amount,
          ...(fundingNote.trim()
            ? { note: fundingNote.trim() }
            : {}),
        },
        {
          accessToken,
          sensitiveAuthorization: authorization,
        },
        activeBranchId,
      );
    },
    onSuccess: async () => {
      setFundingAmount("");
      setFundingNote("");
      setFundingError(null);
      setFundingOpen(false);

      if (selectedCustomer) {
        await queryClient.invalidateQueries({
          queryKey: [
            "customer-workstation",
            "account",
            selectedCustomer.id,
          ],
        });
      }
    },
    onError: (error) => {
      setFundingError(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Unable to fund customer account.",
      );
    },
  });

  const customers = useMemo(
    () => customersQuery.data?.data ?? [],
    [customersQuery.data],
  );

  const orders = useMemo(
    () =>
      [...(ordersQuery.data ?? [])].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime(),
      ),
    [ordersQuery.data],
  );

  const accountTransactions = useMemo(
    () =>
      [...(accountQuery.data?.transactions ?? [])].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime(),
      ),
    [accountQuery.data],
  );

  const timeline = useMemo(() => {
    if (!selectedCustomer) return [];

    const events = [
      {
        id: `customer-created-${selectedCustomer.id}`,
        date: selectedCustomer.createdAt,
        title: "Customer joined",
        description: "Customer account created.",
      },
      ...orders.map((order) => ({
        id: `order-${order.id}`,
        date: order.createdAt,
        title: `Order ${order.orderNumber}`,
        description: `${statusLabel(order.status)} — ${formatMoney(
          order.orderTotal,
        )}`,
      })),
      ...invoices.map((invoice) => ({
        id: `invoice-${invoice.id}`,
        date: invoice.createdAt,
        title: `Invoice ${invoice.invoiceNumber}`,
        description: `${statusLabel(invoice.status)} — ${formatMoney(
          invoice.totalAmount,
        )}`,
      })),
      ...accountTransactions.map((transaction) => ({
        id: `account-${transaction.id}`,
        date: transaction.createdAt,
        title: `Account ${transaction.type}`,
        description: `${formatMoney(transaction.amount)}${
          transaction.note ? ` — ${transaction.note}` : ""
        }`,
      })),
      ...Array.from(paymentSummaries.values()).flatMap((summary) =>
        summary.payments.map((payment) => ({
          id: `payment-${payment.id}`,
          date: payment.createdAt,
          title: `Payment — ${payment.invoice?.invoiceNumber ?? "Invoice"}`,
          description: `${formatMoney(payment.amount)} via ${payment.method}${
            payment.status === "VOID" ? " — VOID" : ""
          }`,
        })),
      ),
    ];

    return events.sort(
      (a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  }, [
    selectedCustomer,
    orders,
    invoices,
    accountTransactions,
    paymentSummaries,
  ]);

  function selectCustomer(customer: Customer) {
    setSelectedCustomer(customer);
  }

  useEffect(() => {
    const customer = customerFromUrlQuery.data;

    if (!customer || customer.id !== customerIdFromUrl) {
      return;
    }

    setSelectedCustomer(customer);
  }, [customerFromUrlQuery.data, customerIdFromUrl]);


  return (
    <div className="page-container">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <h1>Customer Workstation</h1>
          <p>
            Search and manage the complete customer context from one
            workspace.
          </p>
        </div>
      </div>

      <section
        aria-label="Customer search"
        style={{
          padding: 18,
          border: "1px solid #ddd",
          borderRadius: 10,
          background: "#fff",
          marginBottom: 20,
        }}
      >
        <label
          htmlFor="customer-workstation-search"
          style={{
            display: "block",
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          Search customer, order or invoice
        </label>

        <input
          id="customer-workstation-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name, phone, email, order number or invoice number"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 14px",
            border: "1px solid #ccc",
            borderRadius: 8,
            fontSize: 15,
          }}
        />
      </section>

      {!selectedCustomer && (
        <section aria-label="Customer results">
          <h2>Customers</h2>

          {customersQuery.isLoading && <p>Searching...</p>}

          {customersQuery.isError && (
            <p role="alert">
              Unable to load customers. Please try again.
            </p>
          )}

          {!customersQuery.isLoading && customers.length === 0 && (
            <p>No customers found.</p>
          )}

          <div
            style={{
              display: "grid",
              gap: 10,
            }}
          >
            {customers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => selectCustomer(customer)}
                style={{
                  textAlign: "left",
                  padding: 16,
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                <strong>{customer.name}</strong>
                <div>{customer.phone || "No phone"}</div>
                <div>{customer.email || "No email"}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {selectedCustomer && (
        <section aria-label="Customer workspace">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 16,
              marginBottom: 20,
            }}
          >
            <div>
              <h2>{selectedCustomer.name}</h2>
              <p>
                {selectedCustomer.phone || "No phone"}{" "}
                {selectedCustomer.email
                  ? `• ${selectedCustomer.email}`
                  : ""}
              </p>
              <small>
                Customer since {formatDate(selectedCustomer.createdAt)}
              </small>
            </div>

            <button
              type="button"
              onClick={() => setSelectedCustomer(null)}
            >
              Back to customers
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
              marginBottom: 20,
            }}
          >
            <div className="card">
              <strong>Account Balance</strong>
              {canViewAccount ? (
                <h2>
                  {accountQuery.isLoading
                    ? "Loading..."
                    : accountQuery.data
                      ? formatMoney(accountQuery.data.balance)
                      : "₦0"}
                </h2>
              ) : (
                <p>No account access</p>
              )}
            </div>

            <div className="card">
              <strong>Orders</strong>
              <h2>{orders.length}</h2>
            </div>

            <div className="card">
              <strong>Invoices</strong>
              <h2>{invoices.length}</h2>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: 24,
            }}
          >
            {canCreateOrders && (
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/orders?customerId=${encodeURIComponent(
                      selectedCustomer.id,
                    )}&returnTo=customer-workstation`,
                  )
                }
              >
                Add New Order
              </button>
            )}

            {canUpdateCustomers && (
              <button
                type="button"
                onClick={() => {
                  setCustomerNotes(selectedCustomer.notes ?? "");
                  setNotesError(null);
                  setNotesOpen((open) => !open);
                }}
              >
                {notesOpen ? "Close Notes" : "Customer Notes"}
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                navigate(`/customers/${selectedCustomer.id}`)
              }
            >
              Customer Details
            </button>

            {notesOpen && canUpdateCustomers && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setNotesError(null);
                  notesMutation.mutate();
                }}
                style={{
                  flexBasis: "100%",
                  display: "grid",
                  gap: 10,
                  marginTop: 4,
                }}
              >
                <h3>Customer Notes</h3>

                <textarea
                  aria-label="Customer notes"
                  maxLength={2000}
                  value={customerNotes}
                  onChange={(event) => {
                    setCustomerNotes(event.target.value);
                    setNotesError(null);
                  }}
                  disabled={notesMutation.isPending}
                  rows={4}
                />

                {notesError && (
                  <p role="alert">{notesError}</p>
                )}

                <button
                  type="submit"
                  disabled={notesMutation.isPending}
                >
                  {notesMutation.isPending
                    ? "Saving..."
                    : "Save Notes"}
                </button>
              </form>
            )}

            {canManageAccount && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setFundingError(null);
                    setFundingOpen((open) => !open);
                  }}
                >
                  {fundingOpen
                    ? "Close POA"
                    : "POA / Put Money on Account"}
                </button>

                {fundingOpen && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      setFundingError(null);
                      fundMutation.mutate();
                    }}
                    style={{
                      flexBasis: "100%",
                      display: "grid",
                      gap: 10,
                      marginTop: 4,
                    }}
                  >
                    <h3>Put Money on Account</h3>

                    <div>
                      <label htmlFor="workstation-funding-amount">
                        Amount
                      </label>
                      <input
                        id="workstation-funding-amount"
                        type="number"
                        min="1"
                        step="1"
                        value={fundingAmount}
                        onChange={(event) => {
                          setFundingAmount(event.target.value);
                          setFundingError(null);
                        }}
                        disabled={fundMutation.isPending}
                      />
                    </div>

                    <div>
                      <label htmlFor="workstation-funding-note">
                        Note
                      </label>
                      <input
                        id="workstation-funding-note"
                        type="text"
                        maxLength={1000}
                        value={fundingNote}
                        onChange={(event) =>
                          setFundingNote(event.target.value)
                        }
                        disabled={fundMutation.isPending}
                        placeholder="Optional note"
                      />
                    </div>

                    {fundingError && (
                      <p role="alert">{fundingError}</p>
                    )}

                    <button
                      type="submit"
                      disabled={fundMutation.isPending}
                    >
                      {fundMutation.isPending
                        ? "Funding..."
                        : "Fund Account"}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>

          {canViewOrders && (
            <section className="card" aria-label="Customer orders">
            <h3>Orders</h3>

            {ordersQuery.isLoading && <p>Loading orders...</p>}

            {ordersQuery.isError && (
              <p role="alert">Unable to load customer orders.</p>
            )}

            {!ordersQuery.isLoading && orders.length === 0 && (
              <p>No orders yet.</p>
            )}

            {orders.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.orderNumber}</td>
                      <td>{statusLabel(order.status)}</td>
                      <td>{formatMoney(order.orderTotal)}</td>
                      <td>{formatDate(order.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            </section>
          )}

          {canViewInvoices && (
            <section className="card" aria-label="Customer invoices">
            <h3>Invoices & Payments</h3>

            {invoicesQuery.isLoading && <p>Loading invoices...</p>}

            {invoicesQuery.isError && (
              <p role="alert">Unable to load customer invoices.</p>
            )}

            {!invoicesQuery.isLoading && invoices.length === 0 && (
              <p>No invoices yet.</p>
            )}

            {invoices.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Order</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => {
                    const paymentSummary = paymentSummaries.get(
                      invoice.id,
                    );

                    return (
                      <tr key={invoice.id}>
                        <td>{invoice.invoiceNumber}</td>
                        <td>{invoice.order.orderNumber}</td>
                        <td>{statusLabel(invoice.status)}</td>
                        <td>{formatMoney(invoice.totalAmount)}</td>
                        <td>
                          {paymentSummary
                            ? formatMoney(paymentSummary.amountPaid)
                            : canViewPayments
                              ? "Loading..."
                              : "No payment access"}
                        </td>
                        <td>
                          {paymentSummary
                            ? formatMoney(paymentSummary.balance)
                            : "—"}
                        </td>
                        <td>
                          {canManagePayments && (
                            <button
                              type="button"
                              onClick={() => {
                                setPaymentError(null);
                                setPaymentInvoiceId(
                                  paymentInvoiceId === invoice.id
                                    ? null
                                    : invoice.id,
                                );
                                setPaymentAmount(
                                  paymentSummary?.balance
                                    ? String(paymentSummary.balance)
                                    : "",
                                );
                                setPaymentMethod("CASH");
                                setPaymentReference("");
                                setPaymentNote("");
                              }}
                            >
                              {paymentInvoiceId === invoice.id
                                ? "Close Payment"
                                : "Record Payment"}
                            </button>
                          )}

                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setPrintInvoiceId(invoice.id);
                                setPrintMode("customer");
                              }}
                            >
                              Print Customer
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setPrintInvoiceId(invoice.id);
                                setPrintMode("company");
                              }}
                            >
                              Print Company
                            </button>
                          </div>

                          {canManagePayments &&
                            paymentInvoiceId === invoice.id && (
                              <form
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  setPaymentError(null);
                                  paymentMutation.mutate();
                                }}
                                style={{
                                  display: "grid",
                                  gap: 8,
                                  marginTop: 10,
                                  minWidth: 220,
                                }}
                              >
                                <label>
                                  Amount
                                  <input
                                    aria-label={`Payment amount for ${invoice.invoiceNumber}`}
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={paymentAmount}
                                    onChange={(event) => {
                                      setPaymentAmount(
                                        event.target.value,
                                      );
                                      setPaymentError(null);
                                    }}
                                    disabled={
                                      paymentMutation.isPending
                                    }
                                  />
                                </label>

                                <label>
                                  Method
                                  <select
                                    aria-label={`Payment method for ${invoice.invoiceNumber}`}
                                    value={paymentMethod}
                                    onChange={(event) =>
                                      setPaymentMethod(
                                        event.target.value as PaymentMethod,
                                      )
                                    }
                                    disabled={
                                      paymentMutation.isPending
                                    }
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

                                {paymentMethod ===
                                  "PAY_FROM_ACCOUNT" && (
                                  <p>
                                    Available account balance:{" "}
                                    {accountQuery.data
                                      ? formatMoney(
                                          accountQuery.data.balance,
                                        )
                                      : "Loading..."}
                                  </p>
                                )}

                                <label>
                                  Reference
                                  <input
                                    type="text"
                                    value={paymentReference}
                                    onChange={(event) =>
                                      setPaymentReference(
                                        event.target.value,
                                      )
                                    }
                                    disabled={
                                      paymentMutation.isPending
                                    }
                                    placeholder="Transfer/POS reference"
                                  />
                                </label>

                                <label>
                                  Note
                                  <textarea
                                    value={paymentNote}
                                    onChange={(event) =>
                                      setPaymentNote(
                                        event.target.value,
                                      )
                                    }
                                    disabled={
                                      paymentMutation.isPending
                                    }
                                    rows={2}
                                  />
                                </label>

                                {paymentError && (
                                  <p role="alert">{paymentError}</p>
                                )}

                                <button
                                  type="submit"
                                  disabled={paymentMutation.isPending}
                                >
                                  {paymentMutation.isPending
                                    ? "Recording..."
                                    : "Confirm Payment"}
                                </button>
                              </form>
                            )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            </section>
          )}

          {canViewAccount && (
            <section className="card" aria-label="Customer account history">
              <h3>Account History</h3>

              {accountTransactions.length === 0 ? (
                <p>No account transactions yet.</p>
              ) : (
                <ul>
                  {accountTransactions.map((transaction) => (
                    <li key={transaction.id}>
                      <strong>{transaction.type}</strong>{" "}
                      {formatMoney(transaction.amount)}
                      {" — "}
                      {formatDate(transaction.createdAt)}
                      {transaction.note
                        ? ` — ${transaction.note}`
                        : ""}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="card" aria-label="Customer timeline">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <h3>Customer Timeline</h3>

              {timeline.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    firstTimelineEventRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    })
                  }
                >
                  Jump to first day
                </button>
              )}
            </div>

            {timeline.length === 0 ? (
              <p>No customer activity yet.</p>
            ) : (
              <ol>
                {timeline.map((event, index) => (
                  <li
                    key={event.id}
                    ref={
                      index === 0
                        ? (element) => {
                            firstTimelineEventRef.current = element;
                          }
                        : undefined
                    }
                  >
                    <strong>{event.title}</strong>
                    {" — "}
                    {formatDate(event.date)}
                    <div>{event.description}</div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </section>
      )}

      <div className="invoice-print-area">
        {printMode === "customer" && customerReceiptQuery.data && (
          <div className="invoice-print-customer">
            <CustomerReceipt receipt={customerReceiptQuery.data} />
          </div>
        )}

        {printMode === "company" && companyReceiptQuery.data && (
          <div className="invoice-print-company">
            <CompanyReceipt receipt={companyReceiptQuery.data} />
          </div>
        )}
      </div>
    </div>
  );
}

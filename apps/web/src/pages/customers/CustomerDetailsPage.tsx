import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../lib/api-client.js";
import { getCustomer } from "../../lib/customers-api.js";
import {
  fundCustomerAccount,
  getCustomerAccount,
} from "../../lib/customer-account-api.js";
import { useSensitiveAuthorization } from "../../components/auth/SensitiveAuthorizationProvider.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";

function formatMoney(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-NG");
}

export function CustomerDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const user = useAuthStore((s) => s.user);
  const { requestSensitiveAuthorization } = useSensitiveAuthorization();

  const canViewAccount = hasPermission(user, "customer_accounts.view");
  const canManageAccount = hasPermission(user, "customer_accounts.manage");

  const [fundingOpen, setFundingOpen] = useState(false);
  const [fundingAmount, setFundingAmount] = useState("");
  const [fundingNote, setFundingNote] = useState("");
  const [fundingError, setFundingError] = useState<string | null>(null);

  const customerQuery = useQuery({
    queryKey: ["customer", id],
    queryFn: () => getCustomer(id!, { accessToken }),
    enabled: Boolean(id),
  });

  const accountQuery = useQuery({
    queryKey: ["customer-account", id],
    queryFn: () => getCustomerAccount(id!, { accessToken }),
    enabled: Boolean(id) && canViewAccount,
  });

  const fundMutation = useMutation({
    mutationFn: async () => {
      if (!id) {
        throw new Error("Customer ID is required.");
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
        id,
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

      await queryClient.invalidateQueries({
        queryKey: ["customer-account", id],
      });
    },
    onError: (error) => {
      setFundingError(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Unable to fund customer account.",
      );
    },
  });

  if (!id) {
    return (
      <main>
        <h1>Customer details</h1>
        <p role="alert">Customer ID is required.</p>
      </main>
    );
  }

  if (customerQuery.isLoading) {
    return (
      <main>
        <h1>Customer details</h1>
        <p>Loading customer...</p>
      </main>
    );
  }

  if (customerQuery.isError || !customerQuery.data) {
    return (
      <main>
        <h1>Customer details</h1>
        <p role="alert">
          {customerQuery.error instanceof ApiError
            ? customerQuery.error.message
            : "Unable to load customer details. Please try again."}
        </p>
        <button type="button" onClick={() => navigate("/customers")}>
          Back to customers
        </button>
      </main>
    );
  }

  const customer = customerQuery.data;
  const account = accountQuery.data;

  function submitFunding(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFundingError(null);
    fundMutation.mutate();
  }

  return (
    <main>
      <div>
        <button type="button" onClick={() => navigate("/customers")}>
          Back to customers
        </button>
      </div>

      <h1>{customer.name}</h1>

      <div>
        <p><strong>Customer ID:</strong> {customer.id}</p>
        <p><strong>Phone:</strong> {customer.phone}</p>
        <p><strong>Email:</strong> {customer.email ?? "-"}</p>
        <p><strong>Address:</strong> {customer.address ?? "-"}</p>
        <p><strong>Status:</strong> {customer.lifecycleStatus}</p>
        <p><strong>Status reason:</strong> {customer.statusReason ?? "-"}</p>
        <p><strong>Notes:</strong> {customer.notes ?? "-"}</p>
      </div>

      <section aria-label="Customer account">
        <h2>Customer Account</h2>

        {accountQuery.isLoading && <p>Loading account...</p>}

        {accountQuery.isError && (
          <p role="alert">
            {accountQuery.error instanceof ApiError
              ? accountQuery.error.message
              : "Unable to load customer account."}
          </p>
        )}

        {account && (
          <>
            <p>
              <strong>Available balance:</strong>{" "}
              {formatMoney(account.balance)}
            </p>

            {canManageAccount && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setFundingError(null);
                    setFundingOpen((open) => !open);
                  }}
                >
                  {fundingOpen ? "Close POA" : "POA / Put Money on Account"}
                </button>

                {fundingOpen && (
              <form onSubmit={submitFunding}>
                <h3>Put Money on Account</h3>

                <div>
                  <label htmlFor="customer-account-funding-amount">
                    Amount
                  </label>
                  <input
                    id="customer-account-funding-amount"
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
                  <label htmlFor="customer-account-funding-note">
                    Note
                  </label>
                  <input
                    id="customer-account-funding-note"
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

            <h3>Account History</h3>

            {account.transactions.length === 0 ? (
              <p>No account transactions yet.</p>
            ) : (
              <ul>
                {account.transactions
                  .slice()
                  .reverse()
                  .map((transaction) => (
                    <li key={transaction.id}>
                      <strong>
                        {transaction.type}
                      </strong>{" "}
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
          </>
        )}
      </section>

      <div>
        <button
          type="button"
          onClick={() =>
            navigate(
              `/orders?customerId=${encodeURIComponent(customer.id)}`,
            )
          }
        >
          Add New Order
        </button>
      </div>
    </main>
  );
}

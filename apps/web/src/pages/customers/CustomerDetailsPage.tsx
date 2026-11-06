import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../lib/api-client.js";
import { getCustomer } from "../../lib/customers-api.js";
import { listBranchResourceShares } from "../../lib/branch-sharing-api.js";
import { listCustomerGroups } from "../../lib/communications-api.js";
import { listServices, listCustomerServicePrices, saveCustomerServicePrice, deleteCustomerServicePrice } from "../../lib/services-api.js";
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
  const canManageServicePrices = hasPermission(user, "services.update");
  const canViewBranchSharing = hasPermission(user, "branches.view");
  const canManageBranchSharing = hasPermission(user, "branches.update");

  const [fundingOpen, setFundingOpen] = useState(false);
  const [fundingAmount, setFundingAmount] = useState("");
  const [fundingNote, setFundingNote] = useState("");
  const [fundingError, setFundingError] = useState<string | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  const customerQuery = useQuery({
    queryKey: ["customer", activeBranchId, id],
    queryFn: () => getCustomer(id!, { accessToken }),
    enabled: Boolean(id && activeBranchId),
  });

  const branchSharesQuery = useQuery({
    queryKey: ["branch-resource-shares", "customer", id, activeBranchId],
    queryFn: () => listBranchResourceShares(accessToken!),
    enabled: Boolean(accessToken && id && canViewBranchSharing && customerQuery.data?.ownerBranchId),
  });

  const groupsQuery = useQuery({
    queryKey: ["communications", "customer-groups"],
    queryFn: () => listCustomerGroups({ accessToken }),
    enabled: Boolean(accessToken && id),
  });

  const servicesQuery = useQuery({
    queryKey: ["services", "active", activeBranchId],
    queryFn: () => listServices({ status: "active" }, { accessToken }),
    enabled: Boolean(activeBranchId && canManageServicePrices),
  });
  const customerPricesQuery = useQuery({
    queryKey: ["customer-service-prices", activeBranchId, id],
    queryFn: () => listCustomerServicePrices(id!, { accessToken }),
    enabled: Boolean(id && activeBranchId && canManageServicePrices),
  });
  const savePriceMutation = useMutation({
    mutationFn: async (input: { serviceId: string; unitPrice: number }) =>
      saveCustomerServicePrice({ customerId: id!, ...input }, { accessToken }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customer-service-prices", activeBranchId, id] }),
  });
  const removePriceMutation = useMutation({
    mutationFn: (priceId: string) => deleteCustomerServicePrice(priceId, { accessToken }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customer-service-prices", activeBranchId, id] }),
  });

  const accountQuery = useQuery({
    queryKey: ["customer-account", activeBranchId, id],
    queryFn: () => getCustomerAccount(id!, { accessToken }),
    enabled: Boolean(id && activeBranchId && canViewAccount),
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
        queryKey: ["customer-account", activeBranchId, id],
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
  const customerBranchShares = (branchSharesQuery.data ?? []).filter((share) =>
    Boolean(
      customer?.ownerBranchId &&
      share.resourceType === "CUSTOMERS" &&
      share.ownerBranchId === customer.ownerBranchId &&
      (share.resourceId === null || share.resourceId === customer.id),
    ),
  );
  const canManageCustomerSharing = Boolean(
    canManageBranchSharing &&
    customer?.ownerBranchId &&
    (user?.securityRole === "BUSINESS_OWNER" || customer.ownerBranchId === activeBranchId),
  );

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
        <p><strong>Customer groups:</strong> {(groupsQuery.data?.data ?? []).filter((group) => group.members.some((member) => member.customerId === customer.id)).map((group) => group.name).join(", ") || "No group membership"}</p>
      </div>

      <section aria-label="Branch ownership and sharing" style={{ margin: "1.25rem 0", padding: "1rem", border: "1px solid var(--border, #d9dce3)", borderRadius: 12 }}>
        <h2>Branch ownership & access</h2>
        <p><strong>Owning branch:</strong> {customer.ownerBranch?.name ?? (customer.ownerBranchId ? "Branch details unavailable" : "Business-wide legacy record (no owning branch assigned)")}</p>
        {customer.ownerBranchId ? (
          <>
            {canViewBranchSharing && (
              <>
                {branchSharesQuery.isLoading ? <p>Loading authorized branch access...</p> : null}
                {branchSharesQuery.isError ? <p role="alert">Unable to load branch-sharing details.</p> : null}
                {customerBranchShares.length > 0 ? (
                  <ul>
                    {customerBranchShares.map((share) => (
                      <li key={share.id}>
                        <strong>{share.targetBranch.name}</strong>
                        {" — "}
                        {share.accessLevel === "EDIT" ? "Edit access" : "View-only access"}
                        {share.user ? ` for ${share.user.fullName}` : " for authorized branch users"}
                        {share.resourceId === null ? " (branch-wide customer share)" : " (this customer)"}
                      </li>
                    ))}
                  </ul>
                ) : (
                  !branchSharesQuery.isLoading && <p>No additional branch shares are configured for this customer.</p>
                )}
              </>
            )}
            {canManageCustomerSharing && (
              <button
                type="button"
                onClick={() => navigate(`/branches/sharing?ownerBranchId=${encodeURIComponent(customer.ownerBranchId!)}&resourceType=CUSTOMERS&resourceId=${encodeURIComponent(customer.id)}`)}
              >
                Manage customer sharing
              </button>
            )}
          </>
        ) : (
          <p>This legacy customer has no assigned owning branch and retains business-wide visibility. It has not been assigned to a branch automatically.</p>
        )}
      </section>

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

      {canManageServicePrices && (
        <section aria-label="Customer-specific service prices">
          <h2>Special Customer Pricing</h2>
          <p>Set individual service prices for this customer. New orders use these prices automatically. Remove an override to return that service to the standard Price List price. Existing orders are not changed.</p>
          {servicesQuery.isLoading || customerPricesQuery.isLoading ? <p>Loading service prices...</p> : (
            <div>
              {(servicesQuery.data?.data ?? []).map((service) => {
                const override = customerPricesQuery.data?.data.find((entry) => entry.serviceId === service.id);
                const value = priceDrafts[service.id] ?? String(override?.unitPrice ?? service.unitPrice);
                return (
                  <div key={service.id} style={{ display: "flex", alignItems: "end", gap: "0.75rem", flexWrap: "wrap", margin: "0.75rem 0", padding: "0.75rem", border: "1px solid var(--border, #ddd)", borderRadius: "10px" }}>
                    <div style={{ flex: "1 1 180px" }}>
                      <strong>{service.name}</strong>
                      <div><small>Standard: {formatMoney(service.unitPrice)}{override ? " · Special price active" : ""}</small></div>
                      {override && <div><small>Special price owner: {override.branch?.name ?? (override.branchId ? "Branch details unavailable" : "Business-wide legacy")}</small></div>}
                    </div>
                    <label>Customer price (₦)
                      <input type="number" min="0" step="1" value={value} onChange={(event) => setPriceDrafts((current) => ({ ...current, [service.id]: event.target.value }))} />
                    </label>
                    <button type="button" disabled={savePriceMutation.isPending} onClick={() => {
                      const amount = Number(value);
                      if (Number.isSafeInteger(amount) && amount >= 0) savePriceMutation.mutate({ serviceId: service.id, unitPrice: amount });
                    }}>Save price</button>
                    {override && <button type="button" disabled={removePriceMutation.isPending} onClick={() => removePriceMutation.mutate(override.id)}>Use standard price</button>}
                    {override?.branchId && canManageBranchSharing && (user?.securityRole === "BUSINESS_OWNER" || override.branchId === activeBranchId) && (
                      <button
                        type="button"
                        onClick={() => navigate(`/branches/sharing?ownerBranchId=${encodeURIComponent(override.branchId!)}&resourceType=CUSTOMER_PRICING&resourceId=${encodeURIComponent(override.id)}`)}
                      >
                        Manage price sharing
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {(savePriceMutation.isError || removePriceMutation.isError) && <p role="alert">Unable to update this customer price. Please check the amount and try again.</p>}
        </section>
      )}

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

import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Customer } from "@laundry-app/shared";
import { ApiError, apiFetch } from "../../lib/api-client.js";
import {
  createCustomerWithOfflineQueue,
  listCustomers,
  listLegacyUnassignedCustomers,
  assignLegacyCustomerOwnerBranch,
  setCustomerLifecycleStatus,
  updateCustomerWithOfflineQueue,
  type CreateCustomerInput,
} from "../../lib/customers-api.js";
import { useAuthStore } from "../../state/auth-store.js";
import { CustomerFormDialog } from "./CustomerFormDialog.js";
import { TableExportActions } from "../../components/exports/TableExportActions.js";
import { useSensitiveAuthorization } from "../../components/auth/SensitiveAuthorizationProvider.js";

const PAGE_SIZE = 25;

export function CustomersPage() {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const queryClient = useQueryClient();
  const { requestSensitiveAuthorization } = useSensitiveAuthorization();

  const [offlineMessage, setOfflineMessage] = useState<string | null>(null);
  const [legacySearch, setLegacySearch] = useState("");
  const [legacyPage, setLegacyPage] = useState(1);
  const [legacyBranchSelections, setLegacyBranchSelections] = useState<Record<string, string>>({});
  const isBusinessOwner = user?.securityRole === "BUSINESS_OWNER";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<
    "active" | "dormant" | "blocked" | "blacklisted" | "inactive" | "all"
  >("active");
  const [editingCustomer, setEditingCustomer] = useState<Customer | null | undefined>(undefined);
  const [statusChange, setStatusChange] = useState<{
    customer: Customer;
    status: Customer["lifecycleStatus"];
  } | null>(null);
  const [statusReason, setStatusReason] = useState("");

  const listQuery = useQuery({
    queryKey: ["customers", activeBranchId, { page, search, status }],
    queryFn: () => listCustomers({ page, pageSize: PAGE_SIZE, search: search || undefined, status }, { accessToken }),
  });

  const legacyCustomersQuery = useQuery({
    queryKey: ["customers", "legacy-unassigned", activeBranchId, legacyPage, legacySearch],
    queryFn: () => listLegacyUnassignedCustomers(
      { page: legacyPage, pageSize: 10, search: legacySearch || undefined },
      { accessToken },
    ),
    enabled: Boolean(accessToken && activeBranchId && isBusinessOwner),
  });

  const branchesQuery = useQuery({
    queryKey: ["branches", "legacy-customer-assignment"],
    queryFn: () => apiFetch<Array<{ id: string; name: string }>>("/branches?status=active", { accessToken }),
    enabled: Boolean(accessToken && activeBranchId && isBusinessOwner),
  });

  const assignLegacyOwnerMutation = useMutation({
    mutationFn: (input: { customerId: string; branchId: string; sensitiveAuthorization: string }) =>
      assignLegacyCustomerOwnerBranch(input.customerId, input.branchId, {
        accessToken,
        sensitiveAuthorization: input.sensitiveAuthorization,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers", "legacy-unassigned"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setLegacyBranchSelections({});
    },
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateCustomerInput) =>
      createCustomerWithOfflineQueue(
        input,
        { accessToken, branchId: activeBranchId },
        {
          businessId: user?.businessId ?? null,
          branchId: activeBranchId,
          actorUserId: user?.id ?? null,
        },
      ),
    onSuccess: (result) => {
      if (result.queued) {
        setOfflineMessage(
          "Customer saved offline. It will synchronize automatically when the connection is restored.",
        );
      } else {
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        setOfflineMessage("Customer created successfully.");
      }

      setEditingCustomer(undefined);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; data: CreateCustomerInput; sensitiveAuthorization: string }) =>
      updateCustomerWithOfflineQueue(
        input.id,
        input.data,
        { accessToken, branchId: activeBranchId, sensitiveAuthorization: input.sensitiveAuthorization },
        {
          businessId: user?.businessId ?? null,
          branchId: activeBranchId,
          actorUserId: user?.id ?? null,
        },
      ),
    onSuccess: (result) => {
      if (result.queued) {
        setOfflineMessage(
          "Customer update saved offline. It will synchronize automatically when the connection is restored.",
        );
      } else {
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        setOfflineMessage("Customer details saved successfully, including any WhatsApp consent changes.");
      }

      setEditingCustomer(undefined);
    },
  });

  const lifecycleMutation = useMutation({
    mutationFn: (input: {
      id: string;
      status: Customer["lifecycleStatus"];
      reason: string;
    }) =>
      setCustomerLifecycleStatus(
        input.id,
        input.status,
        input.reason,
        { accessToken },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setStatusChange(null);
      setStatusReason("");
    },
  });

  async function handleFormSubmit(input: CreateCustomerInput) {
    if (editingCustomer) {
      const sensitiveAuthorization = await requestSensitiveAuthorization();
      if (!sensitiveAuthorization) {
        setOfflineMessage("Customer update cancelled. No changes were saved.");
        return;
      }
      await updateMutation.mutateAsync({
        id: editingCustomer.id,
        data: input,
        sensitiveAuthorization,
      });
    } else {
      await createMutation.mutateAsync(input);
    }
  }

  async function loadAllCustomersForExport(): Promise<Customer[]> {
    const all: Customer[] = []; let pageNumber = 1; let totalPages = 1;
    do {
      const result = await listCustomers({ page: pageNumber, pageSize: 100, status: "all" }, { accessToken });
      all.push(...result.data); totalPages = result.pagination.totalPages; pageNumber += 1;
    } while (pageNumber <= totalPages);
    return all;
  }
  const customers = listQuery.data?.data ?? [];
  const pagination = listQuery.data?.pagination;

  return (
    <main>
      <h1>Customers</h1>
      <button type="button" onClick={() => navigate("/customers/groups")} style={{ marginBottom: 16 }}>Customer Groups</button>
      {isBusinessOwner && (
        <section aria-label="Legacy customer ownership review" style={{ margin: "16px 0 24px", padding: 16, border: "1px solid #d7dee8", borderRadius: 12, background: "#f8fafc" }}>
          <h2>Legacy customer ownership review</h2>
          <p>Customers with missing or ambiguous historical branch ownership stay hidden from branch users until you assign them to the correct branch.</p>
          <input
            type="search"
            aria-label="Search unassigned legacy customers"
            placeholder="Search legacy customers by name, phone or email"
            value={legacySearch}
            onChange={(event) => { setLegacySearch(event.target.value); setLegacyPage(1); }}
          />
          {legacyCustomersQuery.isLoading && <p>Loading unassigned customers...</p>}
          {legacyCustomersQuery.isError && <p role="alert">Unable to load the legacy customer review queue.</p>}
          {assignLegacyOwnerMutation.isError && <p role="alert">{assignLegacyOwnerMutation.error instanceof Error ? assignLegacyOwnerMutation.error.message : "Unable to assign customer ownership."}</p>}
          {legacyCustomersQuery.data?.data.length === 0 && <p>No unassigned legacy customers require review.</p>}
          {!!legacyCustomersQuery.data?.data.length && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th align="left">Customer</th><th align="left">Phone</th><th align="left">Historical orders</th><th align="left">Assign owning branch</th><th align="left">Action</th></tr></thead>
                <tbody>
                  {legacyCustomersQuery.data.data.map((customer) => (
                    <tr key={customer.id}>
                      <td>{customer.name}</td>
                      <td>{customer.phone}</td>
                      <td>{customer._count.orders}</td>
                      <td>
                        <select
                          aria-label={`Owning branch for ${customer.name}`}
                          value={legacyBranchSelections[customer.id] ?? ""}
                          onChange={(event) => setLegacyBranchSelections((current) => ({ ...current, [customer.id]: event.target.value }))}
                        >
                          <option value="">Select verified branch</option>
                          {(branchesQuery.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={!legacyBranchSelections[customer.id] || assignLegacyOwnerMutation.isPending}
                          onClick={async () => {
                            const sensitiveAuthorization = await requestSensitiveAuthorization();
                            if (!sensitiveAuthorization) return;
                            assignLegacyOwnerMutation.mutate({
                              customerId: customer.id,
                              branchId: legacyBranchSelections[customer.id]!,
                              sensitiveAuthorization,
                            });
                          }}
                        >Assign branch</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {legacyCustomersQuery.data && legacyCustomersQuery.data.pagination.totalPages > 1 && (
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
              <button type="button" disabled={legacyPage <= 1} onClick={() => setLegacyPage((page) => page - 1)}>Previous</button>
              <span>Page {legacyPage} of {legacyCustomersQuery.data.pagination.totalPages}</span>
              <button type="button" disabled={legacyPage >= legacyCustomersQuery.data.pagination.totalPages} onClick={() => setLegacyPage((page) => page + 1)}>Next</button>
            </div>
          )}
        </section>
      )}

      <TableExportActions title="Complete customer list" filename="laundryangel-customers" loadRows={loadAllCustomersForExport} columns={[
        { header: "Customer name", value: (row) => row.name }, { header: "Phone", value: (row) => row.phone },
        { header: "Email", value: (row) => row.email }, { header: "Address", value: (row) => row.address },
        { header: "Owning branch", value: (row) => row.ownerBranch?.name ?? "Branch details unavailable" },
        { header: "Status", value: (row) => row.lifecycleStatus }, { header: "Created", value: (row) => row.createdAt },
      ]} />

      {offlineMessage && (
        <p role="status">
          {offlineMessage}
          <button type="button" onClick={() => setOfflineMessage(null)}>
            Dismiss
          </button>
        </p>
      )}

      <div>
        <input
          type="search"
          placeholder="Search by name or phone"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
        >
          <option value="active">Active</option>
          <option value="dormant">Dormant</option>
          <option value="blocked">Blocked</option>
          <option value="blacklisted">Blacklisted</option>
          <option value="inactive">Legacy inactive</option>
          <option value="all">All</option>
        </select>
        <button type="button" onClick={() => setEditingCustomer(null)}>
          New customer
        </button>
      </div>

      {listQuery.isLoading && <p>Loading customers...</p>}

      {listQuery.isError && (
        <p role="alert">
          {listQuery.error instanceof ApiError ? listQuery.error.message : "Failed to load customers. Please try again."}
        </p>
      )}

      {listQuery.isSuccess && customers.length === 0 && (
        <p>{search ? "No customers match your search." : "No customers yet. Add your first customer to get started."}</p>
      )}

      {customers.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Owning branch</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td>
                  <button type="button" onClick={() => navigate(`/customers/${encodeURIComponent(customer.id)}`)}>
                    {customer.name}
                  </button>
                </td>
                <td>{customer.phone}</td>
                <td>{customer.email ?? "-"}</td>
                <td>{customer.ownerBranch?.name ?? "Branch details unavailable"}</td>
                <td>{customer.lifecycleStatus}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => setEditingCustomer(customer)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusChange({ customer, status: customer.lifecycleStatus });
                      setStatusReason(customer.statusReason ?? "");
                    }}
                  >
                    Change status
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {statusChange && (
        <section role="dialog" aria-label="Change customer status">
          <h2>Change customer status</h2>
          <p>
            Customer: <strong>{statusChange.customer.name}</strong>
          </p>

          <label>
            Status
            <select
              value={statusChange.status}
              onChange={(event) =>
                setStatusChange({
                  ...statusChange,
                  status: event.target.value as Customer["lifecycleStatus"],
                })
              }
            >
              <option value="ACTIVE">Active</option>
              <option value="DORMANT">Dormant</option>
              <option value="BLOCKED">Blocked</option>
              <option value="BLACKLISTED">Blacklisted</option>
            </select>
          </label>

          <label>
            Reason
            <textarea
              value={statusReason}
              onChange={(event) => setStatusReason(event.target.value)}
              required
              placeholder="Enter the reason for this status change"
            />
          </label>

          {lifecycleMutation.isError && (
            <p role="alert">
              {lifecycleMutation.error instanceof ApiError
                ? lifecycleMutation.error.message
                : "Unable to change customer status. Please try again."}
            </p>
          )}

          <button
            type="button"
            disabled={
              lifecycleMutation.isPending ||
              !statusReason.trim()
            }
            onClick={() =>
              lifecycleMutation.mutate({
                id: statusChange.customer.id,
                status: statusChange.status,
                reason: statusReason.trim(),
              })
            }
          >
            Save status
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusChange(null);
              setStatusReason("");
            }}
          >
            Cancel
          </button>
        </section>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div>
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}

      {editingCustomer !== undefined && (
        <CustomerFormDialog customer={editingCustomer} onCancel={() => setEditingCustomer(undefined)} onSubmit={handleFormSubmit} />
      )}
    </main>
  );
}

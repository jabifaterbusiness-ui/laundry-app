import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Customer } from "@laundry-app/shared";
import { ApiError } from "../../lib/api-client.js";
import {
  createCustomer,
  listCustomers,
  setCustomerActive,
  updateCustomer,
  type CreateCustomerInput,
} from "../../lib/customers-api.js";
import { useAuthStore } from "../../state/auth-store.js";
import { CustomerFormDialog } from "./CustomerFormDialog.js";

const PAGE_SIZE = 25;

export function CustomersPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [editingCustomer, setEditingCustomer] = useState<Customer | null | undefined>(undefined); // undefined = dialog closed

  const listQuery = useQuery({
    queryKey: ["customers", { page, search, status }],
    queryFn: () => listCustomers({ page, pageSize: PAGE_SIZE, search: search || undefined, status }, { accessToken }),
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateCustomerInput) => createCustomer(input, { accessToken }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditingCustomer(undefined);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; data: CreateCustomerInput }) => updateCustomer(input.id, input.data, { accessToken }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditingCustomer(undefined);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) => setCustomerActive(input.id, input.isActive, { accessToken }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });

  async function handleFormSubmit(input: CreateCustomerInput) {
    if (editingCustomer) {
      await updateMutation.mutateAsync({ id: editingCustomer.id, data: input });
    } else {
      await createMutation.mutateAsync(input);
    }
  }

  const customers = listQuery.data?.data ?? [];
  const pagination = listQuery.data?.pagination;

  return (
    <main>
      <h1>Customers</h1>

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
          <option value="inactive">Inactive</option>
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
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td>
                  <button type="button" onClick={() => setEditingCustomer(customer)}>
                    {customer.name}
                  </button>
                </td>
                <td>{customer.phone}</td>
                <td>{customer.email ?? "-"}</td>
                <td>{customer.isActive ? "Active" : "Inactive"}</td>
                <td>
                  <button
                    type="button"
                    disabled={toggleActiveMutation.isPending}
                    onClick={() => toggleActiveMutation.mutate({ id: customer.id, isActive: !customer.isActive })}
                  >
                    {customer.isActive ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

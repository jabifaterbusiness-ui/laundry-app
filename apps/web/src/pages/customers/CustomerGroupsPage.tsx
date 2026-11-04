import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../lib/api-client.js";
import { listCustomers } from "../../lib/customers-api.js";
import { deleteCustomerGroup, listCustomerGroups, saveCustomerGroup } from "../../lib/communications-api.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";

const PAGE_SIZE = 100;

export function CustomerGroupsPage() {
  const navigate = useNavigate();
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const canView = hasPermission(user, "customers.view");
  const canManage = hasPermission(user, "customers.update");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [customerIds, setCustomerIds] = useState<string[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);

  const groupsQuery = useQuery({
    queryKey: ["communications", "customer-groups"],
    queryFn: () => listCustomerGroups({ accessToken }),
    enabled: Boolean(accessToken && canView),
  });
  const customersQuery = useQuery({
    queryKey: ["customer-groups", "customer-picker", customerPage, customerSearch],
    queryFn: () => listCustomers({
      page: customerPage,
      pageSize: PAGE_SIZE,
      status: "all",
      ...(customerSearch.trim() ? { search: customerSearch.trim() } : {}),
    }, { accessToken }),
    enabled: Boolean(accessToken && canManage),
  });
  const groups = groupsQuery.data?.data ?? [];
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
  const customers = customersQuery.data?.data ?? [];
  const pagination = customersQuery.data?.pagination;

  const saveMutation = useMutation({
    mutationFn: () => saveCustomerGroup({
      name: name.trim(),
      description: description.trim() || null,
      customerIds,
    }, { accessToken }, editingGroupId),
    onSuccess: async (group) => {
      setFeedback(editingGroupId ? "Customer group updated." : "Customer group created.");
      setSelectedGroupId(group.id);
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["communications", "customer-groups"] });
    },
    onError: (error) => setFeedback(error instanceof ApiError ? error.message : "Unable to save customer group."),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCustomerGroup(id, { accessToken }),
    onSuccess: async (_result, id) => {
      if (selectedGroupId === id) setSelectedGroupId(null);
      if (editingGroupId === id) resetForm();
      setFeedback("Customer group deleted.");
      await queryClient.invalidateQueries({ queryKey: ["communications", "customer-groups"] });
    },
    onError: (error) => setFeedback(error instanceof ApiError ? error.message : "Unable to delete customer group."),
  });

  function resetForm() {
    setEditingGroupId(undefined);
    setName("");
    setDescription("");
    setCustomerIds([]);
  }
  function startEdit(group: (typeof groups)[number]) {
    setEditingGroupId(group.id);
    setSelectedGroupId(group.id);
    setName(group.name);
    setDescription(group.description ?? "");
    setCustomerIds(group.members.map((member) => member.customerId));
    setFeedback(null);
  }
  function toggleCustomer(id: string, checked: boolean) {
    setCustomerIds((current) => checked
      ? (current.includes(id) ? current : [...current, id])
      : current.filter((customerId) => customerId !== id));
  }

  if (!canView) {
    return <main><h1>Customer Groups</h1><p role="alert">You do not have permission to view customers.</p></main>;
  }

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "1.25rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <button type="button" onClick={() => navigate("/customers")}>← Back to Customers</button>
          <p style={{ color: "#0f766e", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>Customer management</p>
          <h1 style={{ marginTop: 0 }}>Customer Groups</h1>
          <p>Organise customers into reusable segments for targeted announcements and automatic group discounts.</p>
        </div>
        {canManage && <button type="button" onClick={() => { resetForm(); setFeedback(null); }}>＋ Create group</button>}
      </header>
      {feedback && <p role="status" style={{ padding: "0.8rem 1rem", borderRadius: 10, background: "#ecfdf5", color: "#065f46" }}>{feedback}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 0.9fr) minmax(340px, 1.1fr)", gap: 18, alignItems: "start" }}>
        <section style={{ border: "1px solid #d8dee8", borderRadius: 16, padding: 18, background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <h2 style={{ marginTop: 0 }}>Your groups</h2><strong>{groups.length}</strong>
          </div>
          {groupsQuery.isLoading && <p>Loading customer groups...</p>}
          {groupsQuery.isError && <p role="alert">Unable to load customer groups.</p>}
          {!groupsQuery.isLoading && groups.length === 0 && <p>No customer groups yet. Create your first group to organise customers.</p>}
          <div style={{ display: "grid", gap: 10 }}>
            {groups.map((group) => (
              <article key={group.id} style={{ border: selectedGroupId === group.id ? "2px solid #0f766e" : "1px solid #e2e8f0", borderRadius: 12, padding: 12, background: selectedGroupId === group.id ? "#f0fdfa" : "#fff" }}>
                <button type="button" onClick={() => setSelectedGroupId(group.id)} style={{ border: 0, padding: 0, background: "transparent", textAlign: "left", width: "100%", cursor: "pointer" }}>
                  <strong>{group.name}</strong>
                  <span style={{ display: "block", color: "#64748b", fontSize: 13 }}>{group._count.members} customers</span>
                  {group.description && <span style={{ display: "block", color: "#475569", marginTop: 5 }}>{group.description}</span>}
                </button>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button type="button" onClick={() => setSelectedGroupId(group.id)}>View members</button>
                  {canManage && <button type="button" onClick={() => startEdit(group)}>Edit</button>}
                  {canManage && <button type="button" disabled={deleteMutation.isPending} onClick={() => {
                    if (window.confirm("Delete the customer group " + group.name + "? Customer records will not be deleted.")) deleteMutation.mutate(group.id);
                  }}>Delete</button>}
                </div>
              </article>
            ))}
          </div>
        </section>

        <div style={{ display: "grid", gap: 18 }}>
          {selectedGroup && !editingGroupId && (
            <section aria-label="Group members" style={{ border: "1px solid #d8dee8", borderRadius: 16, padding: 18, background: "#fff" }}>
              <h2 style={{ marginTop: 0 }}>{selectedGroup.name}</h2>
              <p>{selectedGroup.description || "No description provided."}</p>
              <strong>{selectedGroup.members.length} group members</strong>
              {selectedGroup.members.length === 0 ? <p>This group has no members yet.</p> : (
                <div style={{ marginTop: 10, maxHeight: 360, overflowY: "auto" }}>
                  {selectedGroup.members.map((member) => (
                    <div key={member.customerId} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid #e5e7eb" }}>
                      <span><strong>{member.customer.name}</strong><small style={{ display: "block", color: "#64748b" }}>{member.customer.phone}</small></span>
                      <button type="button" onClick={() => navigate("/customers/" + encodeURIComponent(member.customerId))}>Open customer</button>
                    </div>
                  ))}
                </div>
              )}
              {canManage && <button type="button" onClick={() => startEdit(selectedGroup)}>Manage membership</button>}
            </section>
          )}

          {canManage && (
            <section aria-label="Create or edit customer group" style={{ border: "1px solid #d8dee8", borderRadius: 16, padding: 18, background: "#fff" }}>
              <h2 style={{ marginTop: 0 }}>{editingGroupId ? "Edit customer group" : "Create customer group"}</h2>
              <p>Choose customers from the list. Your selection is retained while you move between customer pages.</p>
              <form onSubmit={(event) => { event.preventDefault(); saveMutation.mutate(); }}>
                <label style={{ display: "block", marginBottom: 12 }}>Group name
                  <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required style={{ display: "block", width: "100%" }} />
                </label>
                <label style={{ display: "block", marginBottom: 12 }}>Description
                  <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} style={{ display: "block", width: "100%" }} />
                </label>
                <label style={{ display: "block", marginBottom: 12 }}>Find customers
                  <input type="search" value={customerSearch} onChange={(event) => { setCustomerSearch(event.target.value); setCustomerPage(1); }} placeholder="Search by name or phone" style={{ display: "block", width: "100%" }} />
                </label>
                <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #d8dee8", borderRadius: 10, padding: 10 }}>
                  {customersQuery.isLoading && <p>Loading customers...</p>}
                  {customers.map((customer) => (
                    <label key={customer.id} style={{ display: "flex", gap: 8, padding: "6px 0", alignItems: "center" }}>
                      <input type="checkbox" checked={customerIds.includes(customer.id)} onChange={(event) => toggleCustomer(customer.id, event.target.checked)} />
                      <span>{customer.name} · {customer.phone}</span>
                    </label>
                  ))}
                  {!customersQuery.isLoading && customers.length === 0 && <p>No customers match this search.</p>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 0" }}>
                  <small>Page {pagination?.page ?? customerPage} of {pagination?.totalPages ?? 1} · {pagination?.total ?? 0} customers · {customerIds.length} selected</small>
                  <span>
                    <button type="button" disabled={customerPage <= 1} onClick={() => setCustomerPage((page) => Math.max(1, page - 1))}>Previous</button>
                    <button type="button" disabled={customerPage >= (pagination?.totalPages ?? 1)} onClick={() => setCustomerPage((page) => page + 1)}>Next</button>
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="submit" disabled={saveMutation.isPending || !name.trim() || customerIds.length === 0}>{saveMutation.isPending ? "Saving..." : editingGroupId ? "Save changes" : "Create group"}</button>
                  {editingGroupId && <button type="button" onClick={() => { resetForm(); setFeedback(null); }}>Cancel edit</button>}
                </div>
                {saveMutation.isError && <p role="alert">{saveMutation.error instanceof ApiError ? saveMutation.error.message : "Unable to save customer group."}</p>}
              </form>
            </section>
          )}
          {!selectedGroup && !editingGroupId && <section style={{ border: "1px dashed #cbd5e1", borderRadius: 16, padding: 24, background: "#f8fafc" }}><h2>Select a group</h2><p>Open a group to see its members, or create a new group.</p></section>}
        </div>
      </div>
    </main>
  );
}

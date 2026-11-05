import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hasPermission } from "../../lib/permissions.js";
import { listBranches, listBranchUsers } from "../../lib/users-api.js";
import { deleteBranchResourceShare, listBranchResourceShares, saveBranchResourceShare, type BranchResourceType } from "../../lib/branch-sharing-api.js";
import { useAuthStore } from "../../state/auth-store.js";

const resourceTypes: Array<{ value: BranchResourceType; label: string }> = [
  { value: "CUSTOMERS", label: "Customers" },
  { value: "SERVICES", label: "Services" },
  { value: "CUSTOMER_PRICING", label: "Customer-specific prices" },
  { value: "CUSTOMER_ACCOUNTS", label: "Customer accounts" },
  { value: "DISCOUNTS", label: "Discounts and promotions" },
  { value: "TAX_RULES", label: "Tax rules" },
  { value: "INVENTORY", label: "Inventory" },
];

export function BranchSharingPage() {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const activeBranchId = useAuthStore((state) => state.activeBranchId);
  const queryClient = useQueryClient();
  const canManage = hasPermission(user, "branches.update");
  const [ownerBranchId, setOwnerBranchId] = useState(activeBranchId ?? "");
  const [targetBranchId, setTargetBranchId] = useState("");
  const [resourceType, setResourceType] = useState<BranchResourceType>("CUSTOMERS");
  const [resourceId, setResourceId] = useState("");
  const [userId, setUserId] = useState("");
  const [accessLevel, setAccessLevel] = useState<"READ" | "EDIT">("READ");
  const [message, setMessage] = useState("");

  const branchesQuery = useQuery({
    queryKey: ["branches", "sharing-options"],
    queryFn: () => listBranches(accessToken!),
    enabled: Boolean(accessToken),
  });
  const sharesQuery = useQuery({
    queryKey: ["branches", "sharing-rules"],
    queryFn: () => listBranchResourceShares(accessToken!),
    enabled: Boolean(accessToken),
  });
  const usersQuery = useQuery({
    queryKey: ["branches", "sharing-users", targetBranchId],
    queryFn: () => listBranchUsers(targetBranchId, accessToken!),
    enabled: Boolean(accessToken && targetBranchId),
  });
  const branches = branchesQuery.data ?? [];
  const shares = sharesQuery.data ?? [];

  const saveMutation = useMutation({
    mutationFn: () => saveBranchResourceShare({
      ownerBranchId,
      targetBranchId,
      resourceType,
      resourceId: resourceId.trim() || null,
      userId: userId || null,
      accessLevel,
    }, accessToken!),
    onSuccess: async () => {
      setMessage("Branch sharing rule saved.");
      setResourceId("");
      setUserId("");
      await queryClient.invalidateQueries({ queryKey: ["branches", "sharing-rules"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Unable to save sharing rule."),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBranchResourceShare(id, accessToken!),
    onSuccess: async () => {
      setMessage("Branch sharing rule removed.");
      await queryClient.invalidateQueries({ queryKey: ["branches", "sharing-rules"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Unable to remove sharing rule."),
  });

  if (!hasPermission(user, "branches.view")) {
    return <main><h1>Branch Sharing</h1><p role="alert">You do not have permission to view branch settings.</p></main>;
  }

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: 20 }}>
      <p style={{ color: "#0f766e", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Branch administration</p>
      <h1>Branch Data Sharing</h1>
      <p>Choose which branch data can be accessed by another branch. Access can be read-only or editable, and can be granted to everyone in the target branch or to one selected user.</p>
      {message && <p role="status">{message}</p>}

      {canManage && (
        <section style={{ border: "1px solid #d8dee8", borderRadius: 16, padding: 18, background: "#fff", marginBottom: 24 }}>
          <h2>Create sharing rule</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <label>Data owner branch
              <select value={ownerBranchId} onChange={(event) => setOwnerBranchId(event.target.value)}>
                <option value="">Select owner branch</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
            <label>Share with branch
              <select value={targetBranchId} onChange={(event) => { setTargetBranchId(event.target.value); setUserId(""); }}>
                <option value="">Select receiving branch</option>
                {branches.filter((branch) => branch.id !== ownerBranchId).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
            <label>Data category
              <select value={resourceType} onChange={(event) => { setResourceType(event.target.value as BranchResourceType); setResourceId(""); }}>
                {resourceTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label>Specific record ID (optional)
              <input value={resourceId} onChange={(event) => setResourceId(event.target.value)} placeholder="Leave blank to share the whole category" />
            </label>
            <label>Receiving user (optional)
              <select value={userId} onChange={(event) => setUserId(event.target.value)} disabled={!targetBranchId || usersQuery.isLoading}>
                <option value="">All users in receiving branch</option>
                {(usersQuery.data ?? []).map((branchUser) => <option key={branchUser.id} value={branchUser.id}>{branchUser.fullName} ({branchUser.email})</option>)}
              </select>
            </label>
            <label>Access level
              <select value={accessLevel} onChange={(event) => setAccessLevel(event.target.value as "READ" | "EDIT")}>
                <option value="READ">Read only</option>
                <option value="EDIT">Read and edit</option>
              </select>
            </label>
          </div>
          <p style={{ color: "#64748b", fontSize: 13 }}>Leave Specific record ID blank to share every record in the selected category. Enter a record ID to share only that record. The receiving user must already belong to the receiving branch.</p>
          <button type="button" disabled={saveMutation.isPending || !ownerBranchId || !targetBranchId || ownerBranchId === targetBranchId} onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? "Saving..." : "Save sharing rule"}</button>
        </section>
      )}

      <section style={{ border: "1px solid #d8dee8", borderRadius: 16, padding: 18, background: "#fff" }}>
        <h2>Active sharing rules</h2>
        {sharesQuery.isLoading && <p>Loading sharing rules...</p>}
        {sharesQuery.isError && <p role="alert">Unable to load sharing rules.</p>}
        {!sharesQuery.isLoading && shares.length === 0 && <p>No cross-branch sharing rules have been created.</p>}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th align="left">Owner branch</th><th align="left">Receiving branch</th><th align="left">Data</th><th align="left">Record</th><th align="left">User</th><th align="left">Access</th><th align="left">Action</th></tr></thead>
            <tbody>
              {shares.map((share) => (
                <tr key={share.id}>
                  <td>{share.ownerBranch.name}</td>
                  <td>{share.targetBranch.name}</td>
                  <td>{resourceTypes.find((item) => item.value === share.resourceType)?.label ?? share.resourceType}</td>
                  <td>{share.resourceId || "All records"}</td>
                  <td>{share.user?.fullName ?? "All branch users"}</td>
                  <td>{share.accessLevel === "EDIT" ? "Read and edit" : "Read only"}</td>
                  <td>{canManage && <button type="button" disabled={deleteMutation.isPending} onClick={() => {
                    if (window.confirm("Remove this branch sharing rule?")) deleteMutation.mutate(share.id);
                  }}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

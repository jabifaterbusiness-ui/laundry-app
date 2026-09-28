import { useEffect, useState } from "react";
import {
  assignUserToBranch,
  createBranch,
  listBranchUsers,
  listBranches,
  listUsers,
  removeUserFromBranch,
  type Branch,
  type ManagedUser,
} from "../../lib/users-api.js";
import { apiFetch } from "../../lib/api-client.js";
import { useAuthStore } from "../../state/auth-store.js";
import { hasPermission } from "../../lib/permissions.js";

export function BranchesPage() {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [branchUsers, setBranchUsers] = useState<ManagedUser[]>([]);
  const [availableUsers, setAvailableUsers] = useState<ManagedUser[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);

  const canCreate = hasPermission(user, "branches.create");
  const canUpdate = hasPermission(user, "branches.update");
  const canActivate = hasPermission(user, "branches.activate");
  const canDeactivate = hasPermission(user, "branches.deactivate");
  const canManageUsers = hasPermission(user, "branches.manage_users");

  async function load() {
    if (!accessToken) return;
    const result = await apiFetch<Branch[]>("/branches?status=all", { accessToken });
    setBranches(result);
  }

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load branches."));
  }, [accessToken]);

  async function submit() {
    if (!accessToken || !name.trim()) return;
    setMessage("");
    try {
      if (editing) {
        await apiFetch(`/branches/${editing}`, {
          method: "PATCH",
          accessToken,
          body: JSON.stringify({ name: name.trim(), address: address.trim() || undefined }),
        });
      } else {
        await createBranch({ name: name.trim(), address: address.trim() || undefined }, accessToken);
      }
      setName("");
      setAddress("");
      setEditing(null);
      await load();
      setMessage(editing ? "Branch updated successfully." : "Branch created successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save branch.");
    }
  }

  async function loadBranchUsers(branchId: string) {
    if (!accessToken || !canManageUsers) return;

    setUsersLoading(true);
    setMessage("");

    try {
      const [members, users] = await Promise.all([
        listBranchUsers(branchId, accessToken),
        listUsers({ accessToken, status: "active" }),
      ]);

      setSelectedBranch(branchId);
      setBranchUsers(members);

      const memberIds = new Set(members.map((member) => member.id));
      setAvailableUsers(users.filter((candidate) => !memberIds.has(candidate.id)));
      setSelectedUser("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load branch users.",
      );
    } finally {
      setUsersLoading(false);
    }
  }

  async function addUserToBranch() {
    if (!accessToken || !selectedBranch || !selectedUser) return;

    setUsersLoading(true);
    setMessage("");

    try {
      await assignUserToBranch(
        selectedBranch,
        selectedUser,
        accessToken,
      );
      await loadBranchUsers(selectedBranch);
      setMessage("User assigned to branch successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to assign user to branch.",
      );
      setUsersLoading(false);
    }
  }

  async function removeUser(userId: string) {
    if (!accessToken || !selectedBranch) return;

    setUsersLoading(true);
    setMessage("");

    try {
      await removeUserFromBranch(
        selectedBranch,
        userId,
        accessToken,
      );
      await loadBranchUsers(selectedBranch);
      setMessage("User removed from branch successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to remove user from branch.",
      );
      setUsersLoading(false);
    }
  }

  async function toggle(branch: Branch) {
    if (!accessToken || (branch.isActive ? !canDeactivate : !canActivate)) return;
    setMessage("");
    try {
      await apiFetch(`/branches/${branch.id}/${branch.isActive ? "deactivate" : "activate"}`, {
        method: "PATCH",
        accessToken,
      });
      await load();
      setMessage(`Branch ${branch.isActive ? "deactivated" : "activated"} successfully.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to change branch status.");
    }
  }

  return (
    <section className="page-card">
      <h1>Branch Management</h1>
      <p>Create and manage the branches belonging to this business.</p>

      {message ? <div role="status" style={{ margin: "16px 0", padding: 12, borderRadius: 8, background: "#f3f4f6" }}>{message}</div> : null}

      {(canCreate || editing) ? (
        <div style={{ display: "grid", gap: 12, maxWidth: 650, marginBottom: 28 }}>
          <h2>{editing ? "Edit branch" : "Add branch"}</h2>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Branch name" maxLength={120} />
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Branch address" maxLength={300} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => void submit()}>{editing ? "Save changes" : "Create branch"}</button>
            {editing ? <button type="button" onClick={() => { setEditing(null); setName(""); setAddress(""); }}>Cancel</button> : null}
          </div>
        </div>
      ) : null}

      {canManageUsers && selectedBranch ? (
        <section
          aria-label="Branch users"
          style={{
            marginBottom: 28,
            padding: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 10,
          }}
        >
          <h2>
            Branch users
          </h2>

          {usersLoading ? <p>Loading branch users...</p> : null}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <select
              aria-label="Assign user to branch"
              value={selectedUser}
              onChange={(event) => setSelectedUser(event.target.value)}
              disabled={usersLoading}
            >
              <option value="">Select active user</option>
              {availableUsers.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.fullName} ({candidate.email})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void addUserToBranch()}
              disabled={!selectedUser || usersLoading}
            >
              Assign user
            </button>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Name</th>
                <th align="left">Email</th>
                <th align="left">Role</th>
                <th align="left">Action</th>
              </tr>
            </thead>
            <tbody>
              {branchUsers.map((branchUser) => (
                <tr key={branchUser.id}>
                  <td>{branchUser.fullName}</td>
                  <td>{branchUser.email}</td>
                  <td>{branchUser.role}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => void removeUser(branchUser.id)}
                      disabled={usersLoading}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {!branchUsers.length && !usersLoading ? (
                <tr>
                  <td colSpan={4}>No users assigned to this branch.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th align="left">Branch</th><th align="left">Address</th><th align="left">Status</th><th align="left">Actions</th></tr></thead>
          <tbody>
            {branches.map((branch) => (
              <tr key={branch.id}>
                <td>{branch.name}</td>
                <td>{branch.address || "—"}</td>
                <td>{branch.isActive ? "Active" : "Inactive"}</td>
                <td>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {canUpdate ? (
                      <button type="button" onClick={() => { setEditing(branch.id); setName(branch.name); setAddress(branch.address ?? ""); }}>
                        Edit
                      </button>
                    ) : null}
                    {canActivate ? (
                      <button type="button" onClick={() => void toggle(branch)}>
                        {branch.isActive ? "Deactivate" : "Activate"}
                      </button>
                    ) : null}
                    {canManageUsers ? (
                      <button
                        type="button"
                        onClick={() => void loadBranchUsers(branch.id)}
                      >
                        Manage users
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!branches.length ? <tr><td colSpan={4}>No branches found.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

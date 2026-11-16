import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { getPlatformBusinesses } from "../../lib/platform-api.js";

type ReadyTimeFormat = "12H" | "24H";

function parseBranchReadyTime(value: string, format: ReadyTimeFormat): string | null {
  const trimmed = value.trim().toUpperCase();
  if (format === "24H") return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(trimmed) ? trimmed : null;
  const match = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/.exec(trimmed);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3] === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function formatBranchReadyTime(value: string | null, format: ReadyTimeFormat): string {
  if (!value) return "";
  if (format === "24H") return value;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return "";
  const hour = Number(match[1]);
  return `${String(hour % 12 || 12).padStart(2, "0")}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
}

export function BranchesPage() {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const isPlatformAdmin = user?.securityRole === "PLATFORM_ADMIN";
  const businessesQuery = useQuery({ queryKey: ["platform", "businesses"], queryFn: () => getPlatformBusinesses(accessToken), enabled: Boolean(isPlatformAdmin && accessToken) });
  const [platformBusinessId, setPlatformBusinessId] = useState("");
  useEffect(() => {
    if (isPlatformAdmin && !platformBusinessId && businessesQuery.data?.length) setPlatformBusinessId(businessesQuery.data[0]!.id);
  }, [isPlatformAdmin, platformBusinessId, businessesQuery.data]);
  const businessContextId = isPlatformAdmin ? platformBusinessId : user?.businessId ?? "";
  const platformHeaders = isPlatformAdmin && platformBusinessId ? { "X-Platform-Business-Id": platformBusinessId } : undefined;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [readyTimeFormats, setReadyTimeFormats] = useState<Record<string, ReadyTimeFormat>>({});
  const [defaultReadyTimes, setDefaultReadyTimes] = useState<Record<string, string>>({});
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
  const canManageUsers = !isPlatformAdmin && hasPermission(user, "branches.manage_users");

  async function load() {
    if (!accessToken || !businessContextId) return;
    const result = await apiFetch<Branch[]>("/branches?status=all", { accessToken, ...(platformHeaders ? { headers: platformHeaders } : {}) });
    setBranches(result);
    setReadyTimeFormats(Object.fromEntries(
      result.map((branch) => [branch.id, branch.orderReadyTimeFormat ?? "24H"]),
    ));
    setDefaultReadyTimes(Object.fromEntries(
      result.map((branch) => [branch.id, formatBranchReadyTime(branch.defaultOrderReadyTime ?? null, branch.orderReadyTimeFormat ?? "24H")]),
    ));
  }

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load branches."));
  }, [accessToken, businessContextId]);

  async function submit() {
    if (!accessToken || !name.trim()) return;
    setMessage("");
    try {
      if (editing) {
        await apiFetch(`/branches/${editing}`, {
          method: "PATCH",
          accessToken,
          ...(platformHeaders ? { headers: platformHeaders } : {}),
          body: JSON.stringify({ name: name.trim(), address: address.trim() || undefined }),
        });
      } else {
        await createBranch({ name: name.trim(), address: address.trim() || undefined }, accessToken, isPlatformAdmin ? businessContextId : null);
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
        ...(platformHeaders ? { headers: platformHeaders } : {}),
      });
      await load();
      setMessage(`Branch ${branch.isActive ? "deactivated" : "activated"} successfully.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to change branch status.");
    }
  }

  async function saveReadyTimeFormat(branchId: string) {
    if (!accessToken || !canUpdate) return;
    setMessage("");
    const format = readyTimeFormats[branchId] ?? "24H";
    const rawTime = defaultReadyTimes[branchId] ?? "";
    const defaultOrderReadyTime = rawTime.trim() ? parseBranchReadyTime(rawTime, format) : null;
    if (rawTime.trim() && !defaultOrderReadyTime) {
      setMessage(format === "12H"
        ? "Enter the default ready time with an explicit AM or PM, for example 02:30 PM."
        : "Enter the default ready time in 24-hour format, for example 14:30.");
      return;
    }
    try {
      await apiFetch(`/branches/${branchId}`, {
        method: "PATCH",
        accessToken,
        ...(platformHeaders ? { headers: platformHeaders } : {}),
        body: JSON.stringify({ orderReadyTimeFormat: format, defaultOrderReadyTime }),
      });
      await load();
      setMessage("Branch expected-ready time settings updated successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update the branch time settings.");
    }
  }

  return (
    <section className="page-card">
      <h1>Branch Management</h1>
      <p>Create and manage the branches belonging to this business.</p>
      {isPlatformAdmin ? <label style={{ display: "grid", gap: 6, maxWidth: 520, margin: "16px 0" }}>Business<select value={platformBusinessId} onChange={(event) => { setPlatformBusinessId(event.target.value); setSelectedBranch(null); }}><option value="">Select a business</option>{(businessesQuery.data ?? []).map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select></label> : null}
      {isPlatformAdmin && businessesQuery.isLoading ? <p>Loading businesses…</p> : null}
      {isPlatformAdmin && businessesQuery.isError ? <p role="alert">Unable to load businesses. Refresh and try again.</p> : null}

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
          <thead><tr><th align="left">Branch</th><th align="left">Address</th><th align="left">Expected Ready time</th><th align="left">Status</th><th align="left">Actions</th></tr></thead>
          <tbody>
            {branches.map((branch) => (
              <tr key={branch.id}>
                <td>{branch.name}</td>
                <td>{branch.address || "—"}</td>
                <td>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <select
                      aria-label={`Expected Ready time format for ${branch.name}`}
                      value={readyTimeFormats[branch.id] ?? branch.orderReadyTimeFormat ?? "24H"}
                      disabled={!canUpdate}
                      onChange={(event) => {
                        const nextFormat = event.target.value as ReadyTimeFormat;
                        const currentFormat = readyTimeFormats[branch.id] ?? "24H";
                        setReadyTimeFormats((current) => ({ ...current, [branch.id]: nextFormat }));
                        setDefaultReadyTimes((current) => {
                          const parsed = parseBranchReadyTime(current[branch.id] ?? "", currentFormat);
                          return { ...current, [branch.id]: parsed ? formatBranchReadyTime(parsed, nextFormat) : current[branch.id] ?? "" };
                        });
                      }}
                    >
                      <option value="24H">24-hour (14:30)</option>
                      <option value="12H">12-hour (02:30 PM)</option>
                    </select>
                    <input
                      type="text"
                      aria-label={`Default expected ready time for ${branch.name}`}
                      value={defaultReadyTimes[branch.id] ?? ""}
                      placeholder={(readyTimeFormats[branch.id] ?? "24H") === "12H" ? "02:30 PM" : "14:30"}
                      disabled={!canUpdate}
                      onChange={(event) => setDefaultReadyTimes((current) => ({ ...current, [branch.id]: event.target.value }))}
                      style={{ width: 112 }}
                    />
                    {canUpdate ? (
                      <button type="button" onClick={() => void saveReadyTimeFormat(branch.id)}>
                        Save settings
                      </button>
                    ) : null}
                  </div>
                </td>
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
            {!branches.length ? <tr><td colSpan={5}>No branches found.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

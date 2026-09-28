import { useState } from "react";
import type { AuthenticatedUser } from "@laundry-app/shared";
import { useAuthStore } from "../../state/auth-store.js";
import { apiFetch } from "../../lib/api-client.js";

export function AccountPage() {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const setUser = useAuthStore((state) => state.setUser);

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");

  if (!user) return null;

  async function saveProfile() {
    if (!accessToken) return;
    try {
      const updated = await apiFetch<AuthenticatedUser>("/auth/account", {
        method: "PATCH",
        accessToken,
        body: JSON.stringify({ fullName: fullName.trim() }),
      });
      setUser(updated);
      setMessage("Profile updated successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update profile.");
    }
  }

  async function changePassword() {
    if (!accessToken) return;
    if (newPassword !== confirmPassword) {
      setMessage("New passwords do not match.");
      return;
    }
    try {
      await apiFetch<{ message: string }>("/auth/change-password", {
        method: "POST",
        accessToken,
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password changed successfully. Other active sessions have been signed out.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to change password.");
    }
  }

  return (
    <section className="page-card">
      <h1>My Account</h1>
      <p>Manage your personal account details and password.</p>

      {message ? <div role="status" style={{ margin: "16px 0", padding: 12, borderRadius: 8, background: "#f3f4f6" }}>{message}</div> : null}

      <div style={{ display: "grid", gap: 24, maxWidth: 700 }}>
        <div>
          <h2>Profile</h2>
          <label style={{ display: "grid", gap: 6 }}>
            Full name
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={160} />
          </label>
          <p><strong>Email:</strong> {user.email}</p>
          <p><strong>Username:</strong> {user.username || "Not configured"}</p>
          <p><strong>Role:</strong> {user.role}</p>
          <p style={{ fontSize: 13 }}>Role and permissions are controlled by business management.</p>
          <button type="button" onClick={() => void saveProfile()}>Save profile</button>
        </div>

        <div>
          <h2>Change password</h2>
          <div style={{ display: "grid", gap: 12 }}>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" autoComplete="current-password" />
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" minLength={8} autoComplete="new-password" />
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" minLength={8} autoComplete="new-password" />
            <button type="button" onClick={() => void changePassword()}>Change password</button>
          </div>
        </div>
      </div>
    </section>
  );
}

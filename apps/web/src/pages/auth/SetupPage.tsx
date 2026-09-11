import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type { TokenPair, AuthenticatedUser } from "@laundry-app/shared";
import { apiFetch } from "../../lib/api-client.js";
import { useAuthStore } from "../../state/auth-store.js";

interface SetupResponse extends TokenPair {
  user: AuthenticatedUser;
}

export function SetupPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const [checking, setChecking] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [password, setPassword] = useState("");
  const [branchName, setBranchName] = useState("Main Branch");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    apiFetch<{ setupRequired: boolean }>("/setup/status")
      .then((result) => {
        if (active) {
          setSetupRequired(result.setupRequired);
          setChecking(false);
        }
      })
      .catch(() => {
        if (active) {
          setError("Unable to check LaundryAngel setup status.");
          setChecking(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (!checking && !setupRequired) {
    return <Navigate to="/login" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const result = await apiFetch<SetupResponse>("/setup", {
        method: "POST",
        body: JSON.stringify({
          businessName,
          ownerName,
          ownerEmail,
          password,
          branchName,
        }),
      });

      setSession(result);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return <div style={{ padding: 40 }}>Checking LaundryAngel setup...</div>;
  }

  return (
    <main style={{ maxWidth: 520, margin: "60px auto", padding: 24 }}>
      <h1>Set up LaundryAngel</h1>
      <p>Create your business and first administrator account.</p>

      {error && (
        <div role="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <label>
          Business name
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
            maxLength={120}
          />
        </label>

        <label>
          Owner full name
          <input
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            required
            maxLength={120}
          />
        </label>

        <label>
          Owner email
          <input
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>

        <label>
          First branch
          <input
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            required
            maxLength={120}
          />
        </label>

        <button type="submit" disabled={submitting}>
          {submitting ? "Creating LaundryAngel..." : "Create LaundryAngel"}
        </button>
      </form>

      <p style={{ marginTop: 20 }}>
        Already set up? <a href="/login">Sign in</a>
      </p>
    </main>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import type { AuthenticatedUser, TokenPair } from "@laundry-app/shared";
import { apiFetch, ApiError } from "../../lib/api-client.js";
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
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessWebsite, setBusinessWebsite] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");

  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [password, setPassword] = useState("");
  const [branchName, setBranchName] = useState("Main Branch");

  const [error, setError] = useState<string | null>(null);
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
      .catch((err) => {
        if (active) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Unable to check Laundry Angel setup status.",
          );
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

    setError(null);
    setSubmitting(true);

    try {
      const result = await apiFetch<SetupResponse>("/setup", {
        method: "POST",
        body: JSON.stringify({
          businessName: businessName.trim(),
          businessPhone: businessPhone.trim(),
          businessEmail: businessEmail.trim().toLowerCase(),
          businessWebsite: businessWebsite.trim(),
          businessAddress: businessAddress.trim(),
          ownerName: ownerName.trim(),
          ownerEmail: ownerEmail.trim().toLowerCase(),
          password,
          branchName: branchName.trim(),
        }),
      });

      setSession(result);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to create your Laundry Angel organisation.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <main className="auth-page">
        <div className="auth-background" />

        <section className="auth-card" aria-label="Checking setup status">
          <div className="auth-brand">
            <img
              src="/brand/laundryangel-logo.jpg"
              alt="Laundry Angel"
              className="auth-logo"
            />

            <div>
              <div className="auth-brand-name">
                Laundry<span>Angel</span>
              </div>
              <div className="auth-brand-tagline">
                Laundry Management System
              </div>
            </div>
          </div>

          <div className="auth-heading">
            <h1>Preparing your workspace</h1>
            <p>Checking Laundry Angel setup status...</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-background" />

      <section className="auth-card auth-card-wide" aria-labelledby="setup-title">
        <div className="auth-brand">
          <img
            src="/brand/laundryangel-logo.jpg"
            alt="Laundry Angel"
            className="auth-logo"
          />

          <div>
            <div className="auth-brand-name">
              Laundry<span>Angel</span>
            </div>
            <div className="auth-brand-tagline">
              Laundry Management System
            </div>
          </div>
        </div>

        <div className="auth-heading">
          <h1 id="setup-title">Create your organisation</h1>
          <p>
            Set up your laundry business and owner account to get started.
          </p>
        </div>

        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-section-heading">
            <strong>Business details</strong>
            <span>Your organisation information</span>
          </div>

          <div className="auth-form-grid">
            <div className="auth-field">
              <label htmlFor="setup-business-name">Business name</label>
              <input
                id="setup-business-name"
                name="businessName"
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                placeholder="Your laundry business"
                maxLength={120}
                autoComplete="organization"
                required
              />
            </div>

            <div className="auth-field">
              <label htmlFor="setup-business-phone">Business phone</label>
              <input
                id="setup-business-phone"
                name="businessPhone"
                type="tel"
                value={businessPhone}
                onChange={(event) => setBusinessPhone(event.target.value)}
                placeholder="+234 800 000 0000"
                maxLength={40}
                autoComplete="tel"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="setup-business-email">Business email</label>
              <input
                id="setup-business-email"
                name="businessEmail"
                type="email"
                value={businessEmail}
                onChange={(event) => setBusinessEmail(event.target.value)}
                placeholder="business@example.com"
                maxLength={254}
                autoComplete="email"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="setup-business-website">
                Business website
              </label>
              <input
                id="setup-business-website"
                name="businessWebsite"
                type="url"
                value={businessWebsite}
                onChange={(event) => setBusinessWebsite(event.target.value)}
                placeholder="https://example.com"
                maxLength={500}
                autoComplete="url"
              />
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="setup-business-address">Business address</label>
            <textarea
              id="setup-business-address"
              name="businessAddress"
              value={businessAddress}
              onChange={(event) => setBusinessAddress(event.target.value)}
              placeholder="Business address"
              maxLength={500}
              rows={3}
              autoComplete="street-address"
            />
          </div>

          <div className="auth-section-heading">
            <strong>Owner account</strong>
            <span>Your first organisation administrator</span>
          </div>

          <div className="auth-form-grid">
            <div className="auth-field">
              <label htmlFor="setup-owner-name">Owner full name</label>
              <input
                id="setup-owner-name"
                name="ownerName"
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
                placeholder="Full name"
                maxLength={120}
                autoComplete="name"
                required
              />
            </div>

            <div className="auth-field">
              <label htmlFor="setup-owner-email">Owner email</label>
              <input
                id="setup-owner-email"
                name="ownerEmail"
                type="email"
                value={ownerEmail}
                onChange={(event) => setOwnerEmail(event.target.value)}
                placeholder="you@example.com"
                maxLength={254}
                autoComplete="username"
                required
              />
            </div>

            <div className="auth-field">
              <label htmlFor="setup-password">Password</label>
              <input
                id="setup-password"
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </div>

            <div className="auth-field">
              <label htmlFor="setup-branch-name">First branch</label>
              <input
                id="setup-branch-name"
                name="branchName"
                value={branchName}
                onChange={(event) => setBranchName(event.target.value)}
                placeholder="Main Branch"
                maxLength={120}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="auth-submit"
            disabled={submitting}
          >
            {submitting
              ? "Creating your organisation..."
              : "Create organisation"}
          </button>
        </form>

        <div className="auth-divider">
          <span>Already have a Laundry Angel account?</span>
        </div>

        <Link to="/login" className="auth-signup">
          Sign in to Laundry Angel
        </Link>

        <p className="auth-footer">
          Your organisation will be securely isolated from other businesses.
        </p>
      </section>
    </main>
  );
}

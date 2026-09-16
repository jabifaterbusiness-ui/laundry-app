import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch, ApiError } from "../../lib/api-client.js";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    token ? null : "This password reset link is missing its reset token.",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setMessage(null);

    if (!token) {
      setError("This password reset link is invalid or incomplete.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await apiFetch<{ message: string }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token,
          password,
        }),
      });

      setMessage(result.message);

      window.setTimeout(() => {
        navigate("/login", { replace: true });
      }, 1200);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to reset your password. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-background" />

      <section className="auth-card" aria-labelledby="reset-password-title">
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
          <h1 id="reset-password-title">Create a new password</h1>
          <p>Choose a new secure password for your LaundryAngel account.</p>
        </div>

        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        {message && (
          <div className="auth-success" role="status">
            {message}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="reset-password">New password</label>
            <input
              id="reset-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your new password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              disabled={!token || isSubmitting}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="reset-password-confirm">Confirm password</label>
            <input
              id="reset-password-confirm"
              name="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter your new password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              disabled={!token || isSubmitting}
            />
          </div>

          <button
            type="submit"
            className="auth-submit"
            disabled={!token || isSubmitting}
          >
            {isSubmitting ? "Updating password..." : "Update password"}
          </button>
        </form>

        <div className="auth-divider">
          <span>Changed your mind?</span>
        </div>

        <Link to="/login" className="auth-signup">
          Back to sign in
        </Link>

        <p className="auth-footer">
          Secure laundry business management
        </p>
      </section>
    </main>
  );
}

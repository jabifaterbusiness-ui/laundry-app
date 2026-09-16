import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiFetch, ApiError } from "../../lib/api-client.js";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const result = await apiFetch<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
        }),
      });

      setMessage(result.message);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to process your request. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-background" />

      <section className="auth-card" aria-labelledby="forgot-password-title">
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
          <h1 id="forgot-password-title">Forgot your password?</h1>
          <p>
            Enter your account email and we&apos;ll send you a secure password
            reset link.
          </p>
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
            <label htmlFor="forgot-password-email">Email address</label>
            <input
              id="forgot-password-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          <button
            type="submit"
            className="auth-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Sending reset link..." : "Send reset link"}
          </button>
        </form>

        <div className="auth-divider">
          <span>Remember your password?</span>
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

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AuthenticatedUser, TokenPair } from "@laundry-app/shared";
import { apiFetch, ApiError } from "../../lib/api-client.js";
import { useAuthStore } from "../../state/auth-store.js";

export function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setIsSubmitting(true);

    try {
      const result = await apiFetch<TokenPair & { user: AuthenticatedUser }>(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            identifier: identifier.trim().toLowerCase(),
            password,
          }),
        },
      );

      setSession(result);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to sign in. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-background" />

      <section className="auth-card" aria-labelledby="login-title">
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
          <h1 id="login-title">Welcome back</h1>
          <p>Sign in to manage your laundry business.</p>
        </div>

        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="login-identifier">Email or username</label>
            <input
              id="login-identifier"
              name="identifier"
              type="text"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="you@example.com or username"
              autoComplete="username"
              required
            />
          </div>

          <div className="auth-field">
            <div className="auth-label-row">
              <label htmlFor="login-password">Password</label>

              <Link to="/forgot-password" className="auth-forgot">
                Forgot password?
              </Link>
            </div>

            <input
              id="login-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            className="auth-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="auth-divider">
          <span>New to Laundry Angel?</span>
        </div>

        <Link to="/setup" className="auth-signup">
          Create your Laundry Angel account
        </Link>

        <p className="auth-footer">
          Secure laundry business management
        </p>
      </section>
    </main>
  );
}

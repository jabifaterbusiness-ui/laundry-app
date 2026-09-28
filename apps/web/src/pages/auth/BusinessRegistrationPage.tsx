import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AuthenticatedUser, TokenPair } from "@laundry-app/shared";
import { apiFetch, ApiError } from "../../lib/api-client.js";
import { useAuthStore } from "../../state/auth-store.js";

interface RegistrationResponse extends TokenPair {
  user: AuthenticatedUser;
}

export function BusinessRegistrationPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const [checking, setChecking] = useState(true);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);

  const [businessName, setBusinessName] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessWebsite, setBusinessWebsite] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [countryCode, setCountryCode] = useState("NG");
  const [currencyCode, setCurrencyCode] = useState("NGN");
  const [timezone, setTimezone] = useState("Africa/Lagos");
  const [locale, setLocale] = useState("en-NG");

  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [branchName, setBranchName] = useState("Main Branch");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    apiFetch<{ registrationEnabled: boolean }>("/business-registration/status")
      .then((result) => {
        if (active) {
          setRegistrationEnabled(result.registrationEnabled);
          setChecking(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Unable to check business registration status.",
          );
          setChecking(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await apiFetch<RegistrationResponse>(
        "/business-registration",
        {
          method: "POST",
          body: JSON.stringify({
            businessName: businessName.trim(),
            businessPhone: businessPhone.trim(),
            businessEmail: businessEmail.trim().toLowerCase(),
            businessWebsite: businessWebsite.trim(),
            businessAddress: businessAddress.trim(),
            countryCode: countryCode.trim().toUpperCase(),
            currencyCode: currencyCode.trim().toUpperCase(),
            timezone: timezone.trim(),
            locale: locale.trim(),
            ownerName: ownerName.trim(),
            ownerEmail: ownerEmail.trim().toLowerCase(),
            username: username.trim().toLowerCase(),
            password,
            confirmPassword,
            branchName: branchName.trim(),
          }),
        },
      );

      setSession(result);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to create your Laundry Angel business.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <main className="auth-page">
        <div className="auth-background" />

        <section className="auth-card" aria-label="Checking registration status">
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
            <h1>Preparing registration</h1>
            <p>Checking whether new businesses can register...</p>
          </div>
        </section>
      </main>
    );
  }

  if (!registrationEnabled) {
    return (
      <main className="auth-page">
        <div className="auth-background" />

        <section className="auth-card" aria-labelledby="registration-unavailable-title">
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
            <h1 id="registration-unavailable-title">
              Registration unavailable
            </h1>
            <p>
              New business registration is currently unavailable. Please
              contact the Laundry Angel administrator or try again later.
            </p>
          </div>

          <Link to="/login" className="auth-signup">
            Return to sign in
          </Link>

          <p className="auth-footer">
            Existing Laundry Angel businesses can continue using their accounts.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-background" />

      <section
        className="auth-card auth-card-wide"
        aria-labelledby="registration-title"
      >
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
          <h1 id="registration-title">Create your Laundry Angel business</h1>
          <p>
            Register your business, create your owner account, and start
            managing your laundry operations.
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
            <span>Your business information and operating settings</span>
          </div>

          <div className="auth-form-grid">
            <div className="auth-field">
              <label htmlFor="registration-business-name">Business name</label>
              <input
                id="registration-business-name"
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
              <label htmlFor="registration-business-phone">
                Business phone
              </label>
              <input
                id="registration-business-phone"
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
              <label htmlFor="registration-business-email">
                Business email
              </label>
              <input
                id="registration-business-email"
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
              <label htmlFor="registration-business-website">
                Business website
              </label>
              <input
                id="registration-business-website"
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
            <label htmlFor="registration-business-address">
              Business address
            </label>
            <textarea
              id="registration-business-address"
              name="businessAddress"
              value={businessAddress}
              onChange={(event) => setBusinessAddress(event.target.value)}
              placeholder="Business address"
              maxLength={500}
              rows={3}
              autoComplete="street-address"
            />
          </div>

          <div className="auth-form-grid">
            <div className="auth-field">
              <label htmlFor="registration-country-code">Country code</label>
              <input
                id="registration-country-code"
                name="countryCode"
                value={countryCode}
                onChange={(event) => setCountryCode(event.target.value)}
                placeholder="NG"
                maxLength={2}
                required
              />
            </div>

            <div className="auth-field">
              <label htmlFor="registration-currency-code">
                Currency code
              </label>
              <input
                id="registration-currency-code"
                name="currencyCode"
                value={currencyCode}
                onChange={(event) => setCurrencyCode(event.target.value)}
                placeholder="NGN"
                maxLength={3}
                required
              />
            </div>

            <div className="auth-field">
              <label htmlFor="registration-timezone">Timezone</label>
              <input
                id="registration-timezone"
                name="timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                placeholder="Africa/Lagos"
                maxLength={100}
                required
              />
            </div>

            <div className="auth-field">
              <label htmlFor="registration-locale">Locale</label>
              <input
                id="registration-locale"
                name="locale"
                value={locale}
                onChange={(event) => setLocale(event.target.value)}
                placeholder="en-NG"
                maxLength={20}
                required
              />
            </div>
          </div>

          <div className="auth-section-heading">
            <strong>Owner account</strong>
            <span>Your first Business Owner account and login identity</span>
          </div>

          <div className="auth-form-grid">
            <div className="auth-field">
              <label htmlFor="registration-owner-name">Full name</label>
              <input
                id="registration-owner-name"
                name="ownerName"
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
                placeholder="Your full name"
                maxLength={120}
                autoComplete="name"
                required
              />
            </div>

            <div className="auth-field">
              <label htmlFor="registration-owner-email">Email address</label>
              <input
                id="registration-owner-email"
                name="ownerEmail"
                type="email"
                value={ownerEmail}
                onChange={(event) => setOwnerEmail(event.target.value)}
                placeholder="you@example.com"
                maxLength={254}
                autoComplete="email"
                required
              />
            </div>

            <div className="auth-field">
              <label htmlFor="registration-username">Username</label>
              <input
                id="registration-username"
                name="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Optional username"
                minLength={3}
                maxLength={50}
                autoComplete="username"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="registration-branch-name">First branch</label>
              <input
                id="registration-branch-name"
                name="branchName"
                value={branchName}
                onChange={(event) => setBranchName(event.target.value)}
                placeholder="Main Branch"
                maxLength={120}
                required
              />
            </div>

            <div className="auth-field">
              <label htmlFor="registration-password">Password</label>
              <input
                id="registration-password"
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
              <label htmlFor="registration-confirm-password">
                Confirm password
              </label>
              <input
                id="registration-confirm-password"
                name="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter your password"
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
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
              ? "Creating your business..."
              : "Create my Laundry Angel business"}
          </button>
        </form>

        <div className="auth-divider">
          <span>Already have a Laundry Angel account?</span>
        </div>

        <Link to="/login" className="auth-signup">
          Sign in to Laundry Angel
        </Link>

        <p className="auth-footer">
          Your business data is securely isolated from other businesses.
        </p>
      </section>
    </main>
  );
}

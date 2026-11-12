import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { recordSensitiveActivity, reauthorize } from "../../lib/auth-api.js";
import { ApiError } from "../../lib/api-client.js";
import { useAuthStore } from "../../state/auth-store.js";

interface SensitiveAuthorizationContextValue {
  requestSensitiveAuthorization: () => Promise<string | null>;
}

const SensitiveAuthorizationContext =
  createContext<SensitiveAuthorizationContextValue | null>(null);

export function SensitiveAuthorizationProvider({
  children,
}: PropsWithChildren) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const sensitiveAuthorization = useAuthStore(
    (state) => state.sensitiveAuthorization,
  );
  const sensitiveAuthorizationExpiresAt = useAuthStore(
    (state) => state.sensitiveAuthorizationExpiresAt,
  );
  const setSensitiveAuthorization = useAuthStore(
    (state) => state.setSensitiveAuthorization,
  );
  const clearSensitiveAuthorization = useAuthStore(
    (state) => state.clearSensitiveAuthorization,
  );

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resolveRequest, setResolveRequest] = useState<
    ((token: string | null) => void) | null
  >(null);

  const requestSensitiveAuthorization = useCallback(async () => {
    if (
      sensitiveAuthorization &&
      sensitiveAuthorizationExpiresAt &&
      new Date(sensitiveAuthorizationExpiresAt).getTime() > Date.now()
    ) {
      if (!accessToken) return null;
      try {
        const activity = await recordSensitiveActivity(sensitiveAuthorization, accessToken);
        setSensitiveAuthorization({
          token: sensitiveAuthorization,
          expiresAt: activity.expiresAt,
          inactivityTimeoutMs: activity.inactivityTimeoutMs,
        });
        return sensitiveAuthorization;
      } catch (activityError) {
        if (!(activityError instanceof ApiError) || activityError.status !== 403) {
          throw activityError;
        }
        clearSensitiveAuthorization();
      }
    }

    if (!accessToken) return null;

    if (open && resolveRequest) {
      return new Promise<string | null>((resolve) => {
        const existingResolve = resolveRequest;
        setResolveRequest(() => (token: string | null) => {
          existingResolve(token);
          resolve(token);
        });
      });
    }

    return new Promise<string | null>((resolve) => {
      setPassword("");
      setError(null);
      setResolveRequest(() => resolve);
      window.dispatchEvent(new Event("sensitive-authorization:started"));
      setOpen(true);
    });
  }, [
    accessToken,
    clearSensitiveAuthorization,
    open,
    resolveRequest,
    sensitiveAuthorization,
    sensitiveAuthorizationExpiresAt,
    setSensitiveAuthorization,
  ]);

  const closeDialog = useCallback((result: string | null) => {
    window.dispatchEvent(new Event("sensitive-authorization:finished"));
    setOpen(false);
    setPassword("");
    setError(null);

    if (resolveRequest) {
      resolveRequest(result);
      setResolveRequest(null);
    }
  }, [resolveRequest]);

  const handleSubmit = useCallback(async () => {
    if (!accessToken || !password) {
      setError("Enter your password.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const authorization = await reauthorize(password, accessToken);

      setSensitiveAuthorization(authorization);
      closeDialog(authorization.token);
    } catch (requestError) {
      setPassword("");
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to authorize this action.",
      );
    } finally {
      setBusy(false);
    }
  }, [
    accessToken,
    closeDialog,
    password,
    setSensitiveAuthorization,
  ]);

  const value = useMemo(
    () => ({ requestSensitiveAuthorization }),
    [requestSensitiveAuthorization],
  );

  return (
    <SensitiveAuthorizationContext.Provider value={value}>
      {children}

      {open ? (
        <div
          role="presentation"
          className="sensitive-authorization-backdrop"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="sensitive-authorization-title"
            className="sensitive-authorization-dialog"
          >
            <h2 id="sensitive-authorization-title">
              Confirm your identity
            </h2>

            <p>
              Enter your password to continue with this sensitive action.
            </p>

            <label htmlFor="sensitive-authorization-password">
              Password
            </label>

            <input
              id="sensitive-authorization-password"
              name="sensitive-authorization-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
              autoFocus
            />

            {error ? (
              <p role="alert">{error}</p>
            ) : null}

            <div>
              <button
                type="button"
                onClick={() => closeDialog(null)}
                disabled={busy}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={busy || !password}
              >
                {busy ? "Verifying..." : "Authorize"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </SensitiveAuthorizationContext.Provider>
  );
}

export function useSensitiveAuthorization() {
  const context = useContext(SensitiveAuthorizationContext);

  if (!context) {
    throw new Error(
      "useSensitiveAuthorization must be used inside SensitiveAuthorizationProvider",
    );
  }

  return context;
}

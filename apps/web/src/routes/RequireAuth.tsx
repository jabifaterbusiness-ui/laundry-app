import { useEffect, useState, type PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";
import { ApiError } from "../lib/api-client.js";
import { getCurrentUser, refreshSession } from "../lib/auth-api.js";
import { useAuthStore } from "../state/auth-store.js";

export function RequireAuth({ children }: PropsWithChildren) {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapAuthentication() {
      const state = useAuthStore.getState();
      const initialAccessToken = state.accessToken;
      const initialRefreshToken = state.refreshToken;
      const initialActiveBranchId = state.activeBranchId;

      if (!initialAccessToken) {
        if (!cancelled) {
          setAuthReady(true);
        }
        return;
      }

      try {
        let user;

        try {
          user = await getCurrentUser(initialAccessToken);
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 401) {
            throw error;
          }

          if (!initialRefreshToken) {
            useAuthStore.getState().clearSession();

            if (!cancelled) {
              setAuthReady(true);
            }
            return;
          }

          const tokens = await refreshSession(initialRefreshToken);

          user = await getCurrentUser(tokens.accessToken);

          if (cancelled) {
            return;
          }

          useAuthStore.getState().setSession({
            user,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
          });
        }

        if (cancelled) {
          return;
        }

        const currentState = useAuthStore.getState();

        if (
          initialActiveBranchId &&
          user.branches.some(
            (branch) => branch.id === initialActiveBranchId,
          )
        ) {
          currentState.setActiveBranch(initialActiveBranchId);
        }

        setAuthReady(true);
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          useAuthStore.getState().clearSession();
        }

        // Keep a persisted session during temporary network/server failures.
        setAuthReady(true);
      }
    }

    void bootstrapAuthentication();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!authReady) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
        }}
      >
        Restoring your session…
      </main>
    );
  }

  if (!useAuthStore.getState().accessToken) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

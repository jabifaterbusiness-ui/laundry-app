import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AuthenticatedUser } from "@laundry-app/shared";

interface AuthState {
  user: AuthenticatedUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  // The user's currently-selected branch, distinct from their branch
  // memberships (user.branches) - LOCKED decision, see
  // apps/api/prisma/schema.prisma. Sent as the X-Branch-Id header on
  // requests that need branch context; the server re-validates it against
  // the database on every request rather than trusting this value.
  activeBranchId: string | null;
  sensitiveAuthorization: string | null;
  sensitiveAuthorizationExpiresAt: string | null;
  setSession: (session: { user: AuthenticatedUser; accessToken: string; refreshToken: string }) => void;
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
  setUser: (user: AuthenticatedUser) => void;
  setActiveBranch: (branchId: string | null) => void;
  setSensitiveAuthorization: (authorization: {
    token: string;
    expiresAt: string;
  }) => void;
  clearSensitiveAuthorization: () => void;
  clearSession: () => void;
}

// NOTE: in-memory only for now. Persisting tokens (and how - httpOnly
// cookie vs storage) is a security decision that belongs to the auth
// module implementation phase, not the foundation phase.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      activeBranchId: null,
      sensitiveAuthorization: null,
      sensitiveAuthorizationExpiresAt: null,

      setUser: (user) => set({ user }),

      setTokens: ({ accessToken, refreshToken }) => set({ accessToken, refreshToken }),

      setSession: ({ user, accessToken, refreshToken }) =>
        set({
          user,
          accessToken,
          refreshToken,
          activeBranchId:
            user.branches.length === 1 ? user.branches[0]?.id ?? null : null,
        }),

      setActiveBranch: (branchId) => set({ activeBranchId: branchId }),

      setSensitiveAuthorization: ({ token, expiresAt }) =>
        set({
          sensitiveAuthorization: token,
          sensitiveAuthorizationExpiresAt: expiresAt,
        }),

      clearSensitiveAuthorization: () =>
        set({
          sensitiveAuthorization: null,
          sensitiveAuthorizationExpiresAt: null,
        }),

      clearSession: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          activeBranchId: null,
          sensitiveAuthorization: null,
          sensitiveAuthorizationExpiresAt: null,
        }),
    }),
    {
      name: "laundryangel-auth-session",
      storage: createJSONStorage(() => localStorage),

      // Never persist the sensitive reauthorization token.
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        activeBranchId: state.activeBranchId,
      }),
    },
  ),
);

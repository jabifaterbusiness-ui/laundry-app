import { create } from "zustand";
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
  setSession: (session: { user: AuthenticatedUser; accessToken: string; refreshToken: string }) => void;
  setUser: (user: AuthenticatedUser) => void;
  setActiveBranch: (branchId: string | null) => void;
  clearSession: () => void;
}

// NOTE: in-memory only for now. Persisting tokens (and how - httpOnly
// cookie vs storage) is a security decision that belongs to the auth
// module implementation phase, not the foundation phase.
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  activeBranchId: null,
  setUser: (user) => set({ user }),
  setSession: ({ user, accessToken, refreshToken }) =>
    set({
      user,
      accessToken,
      refreshToken,
      // Auto-select when the user has exactly one branch; otherwise the
      // UI must prompt them to choose (not modeled here - foundation
      // phase only establishes the state shape).
      activeBranchId: user.branches.length === 1 ? user.branches[0]?.id ?? null : null,
    }),
  setActiveBranch: (branchId) => set({ activeBranchId: branchId }),
  clearSession: () => set({ user: null, accessToken: null, refreshToken: null, activeBranchId: null }),
}));

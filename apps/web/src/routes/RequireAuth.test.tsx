import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { AuthenticatedUser } from "@laundry-app/shared";
import { getCurrentUser } from "../lib/auth-api.js";
import { useAuthStore } from "../state/auth-store.js";
import { RequireAuth } from "./RequireAuth.js";

vi.mock("../lib/auth-api.js", () => ({
  getCurrentUser: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock("../state/auth-store.js", () => ({
  useAuthStore: Object.assign(vi.fn(), {
    getState: vi.fn(),
  }),
}));

describe("RequireAuth", () => {
  const staleUser = {
    id: "staff-1",
    email: "staff@example.com",
    username: "staff",
    fullName: "Test Staff",
    role: "STAFF",
    securityRole: "STAFF",
    businessId: "business-1",
    branches: [],
    permissions: [],
  } as unknown as AuthenticatedUser;

  const refreshedUser = {
    ...staleUser,
    permissions: ["subscriptions.view"],
  } as AuthenticatedUser;

  const setUser = vi.fn();
  const setSession = vi.fn();
  const setActiveBranch = vi.fn();
  const clearSession = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAuthStore.getState).mockReturnValue({
      user: staleUser,
      accessToken: "valid-access-token",
      refreshToken: "refresh-token",
      activeBranchId: null,
      sensitiveAuthorization: null,
      sensitiveAuthorizationExpiresAt: null,
      setUser,
      setSession,
      setTokens: vi.fn(),
      setActiveBranch,
      setSensitiveAuthorization: vi.fn(),
      clearSensitiveAuthorization: vi.fn(),
      clearSession,
    });

    vi.mocked(getCurrentUser).mockResolvedValue(refreshedUser);
  });

  afterEach(() => {
    cleanup();
  });

  it("updates stored permissions when the existing access token is valid", async () => {
    render(
      <MemoryRouter>
        <RequireAuth>
          <div>Protected page</div>
        </RequireAuth>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Protected page")).toBeTruthy();

    await waitFor(() => {
      expect(getCurrentUser).toHaveBeenCalledWith("valid-access-token");
      expect(setUser).toHaveBeenCalledWith(refreshedUser);
    });

    expect(setSession).not.toHaveBeenCalled();
  });
});

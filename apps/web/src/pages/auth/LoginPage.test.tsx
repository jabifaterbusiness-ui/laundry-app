import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage.js";

const apiFetchMock = vi.hoisted(() => vi.fn());
const setSessionMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api-client.js", () => ({
  apiFetch: apiFetchMock,
  ApiError: class ApiError extends Error {},
}));

vi.mock("../../state/auth-store.js", () => ({
  useAuthStore: (selector: (state: { setSession: typeof setSessionMock }) => unknown) =>
    selector({ setSession: setSessionMock }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );

  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe("LoginPage", () => {
  it("submits an email or username identifier instead of the legacy email field", async () => {
    apiFetchMock.mockResolvedValueOnce({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: {
        id: "user-1",
        email: "owner@example.com",
        username: "owner",
        fullName: "Owner",
        role: "Business Owner",
        securityRole: "BUSINESS_OWNER",
        businessId: "biz-1",
        branches: [],
        permissions: [],
      },
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Email or username"), {
      target: { value: "OWNER" },
    });

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          identifier: "owner",
          password: "password123",
        }),
      });
    });

    expect(apiFetchMock.mock.calls[0]?.[1]?.body).not.toContain('"email"');
    expect(setSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token",
        refreshToken: "refresh-token",
      }),
    );
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountPage } from "./AccountPage.js";
import { apiFetch } from "../../lib/api-client.js";

const mockSetUser = vi.fn();

const mockUser = {
  id: "user-1",
  fullName: "Jane Owner",
  email: "jane@example.com",
  username: "jane.owner",
  role: "Business Owner",
  securityRole: "BUSINESS_OWNER",
  businessId: "business-1",
  branches: [],
  permissions: [],
};

vi.mock("../../lib/api-client.js", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("../../state/auth-store.js", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: mockUser,
      accessToken: "token",
      setUser: mockSetUser,
    }),
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe("AccountPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the user's full name", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ...mockUser,
      fullName: "Jane Updated",
    });

    render(<AccountPage />);

    fireEvent.change(screen.getByDisplayValue("Jane Owner"), {
      target: { value: "Jane Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/auth/account",
        expect.objectContaining({
          method: "PATCH",
          accessToken: "token",
          body: JSON.stringify({ fullName: "Jane Updated" }),
        }),
      );
      expect(mockSetUser).toHaveBeenCalledWith(
        expect.objectContaining({ fullName: "Jane Updated" }),
      );
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Profile updated successfully.",
    );
  });

  it("prevents a mismatched password change before making an API request", async () => {
    render(<AccountPage />);

    fireEvent.change(screen.getByPlaceholderText("Current password"), {
      target: { value: "OldPassword123!" },
    });
    fireEvent.change(screen.getByPlaceholderText("New password"), {
      target: { value: "NewPassword123!" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm new password"), {
      target: { value: "DifferentPassword123!" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(
      await screen.findByRole("status"),
    ).toHaveTextContent("New passwords do not match.");
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("changes the password with the current password", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      message: "Password changed successfully.",
    });

    render(<AccountPage />);

    fireEvent.change(screen.getByPlaceholderText("Current password"), {
      target: { value: "OldPassword123!" },
    });
    fireEvent.change(screen.getByPlaceholderText("New password"), {
      target: { value: "NewPassword123!" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm new password"), {
      target: { value: "NewPassword123!" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/auth/change-password",
        expect.objectContaining({
          method: "POST",
          accessToken: "token",
          body: JSON.stringify({
            currentPassword: "OldPassword123!",
            newPassword: "NewPassword123!",
          }),
        }),
      );
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Password changed successfully.",
    );
  });

  it("does not expose permission editing to the user", () => {
    render(<AccountPage />);

    expect(
      screen.getByText("Role and permissions are controlled by business management."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/permissions.*edit/i)).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ResetPasswordPage } from "./ResetPasswordPage.js";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api-client.js", () => ({
  apiFetch: apiFetchMock,
  ApiError: class ApiError extends Error {},
}));

describe("ResetPasswordPage", () => {
  it("requires matching passwords before submitting", async () => {
    render(
      <MemoryRouter initialEntries={["/reset-password?token=test-token"]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password-123" },
    });

    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "different-password-123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Passwords do not match.");

    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("rejects a missing reset token before submitting", async () => {
    render(
      <MemoryRouter initialEntries={["/reset-password"]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent(
      "This password reset link is missing its reset token.",
    );

    expect(
      screen.getByRole("button", { name: "Update password" }),
    ).toBeDisabled();

    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("submits the reset token and new password", async () => {
    apiFetchMock.mockResolvedValueOnce({
      message: "Password reset successfully. Please sign in with your new password.",
    });

    render(
      <MemoryRouter initialEntries={["/reset-password?token=test-token"]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password-123" },
    });

    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "new-password-123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: "test-token",
          password: "new-password-123",
        }),
      });
    });

    expect(
      await screen.findByRole("status"),
    ).toHaveTextContent(
      "Password reset successfully. Please sign in with your new password.",
    );
  });
});

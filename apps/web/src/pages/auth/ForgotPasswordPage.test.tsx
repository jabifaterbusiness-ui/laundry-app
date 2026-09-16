import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordPage } from "./ForgotPasswordPage.js";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api-client.js", () => ({
  apiFetch: apiFetchMock,
  ApiError: class ApiError extends Error {},
}));

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("submits the email and displays the generic success response", async () => {
    apiFetchMock.mockResolvedValueOnce({
      message: "If an account exists for that email, a password reset link has been sent.",
    });

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: " OWNER@EXAMPLE.COM " },
    });

    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({
          email: "owner@example.com",
        }),
      });
    });

    expect(
      await screen.findByRole("status"),
    ).toHaveTextContent("If an account exists for that email, a password reset link has been sent.");
  });

  it("displays an API error without submitting again", async () => {
    apiFetchMock.mockRejectedValueOnce(
      new Error("Unable to process your request"),
    );

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "owner@example.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Unable to process your request. Please try again.");

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });
});

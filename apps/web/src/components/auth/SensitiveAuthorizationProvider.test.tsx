import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SensitiveAuthorizationProvider, useSensitiveAuthorization } from "./SensitiveAuthorizationProvider.js";
import { useAuthStore } from "../../state/auth-store.js";
import * as authApi from "../../lib/auth-api.js";

function TestConsumer() {
  const { requestSensitiveAuthorization } = useSensitiveAuthorization();

  return (
    <button
      type="button"
      onClick={async () => {
        const token = await requestSensitiveAuthorization();
        document.body.dataset.authorization = token ?? "cancelled";
      }}
    >
      Protect action
    </button>
  );
}

describe("SensitiveAuthorizationProvider", () => {
  beforeEach(() => {
    vi.spyOn(authApi, "reauthorize").mockResolvedValue({
      token: "new-sensitive-token",
      expiresAt: "2099-01-01T00:00:00.000Z",
      inactivityTimeoutMs: 180_000,
    });
    vi.spyOn(authApi, "recordSensitiveActivity").mockResolvedValue({
      expiresAt: "2099-01-01T00:00:00.000Z",
      inactivityTimeoutMs: 180_000,
    });

    useAuthStore.setState({
      accessToken: "access-token",
      user: { id: "user-1", businessId: "business-1" },
      sensitiveAuthorization: null,
      sensitiveAuthorizationExpiresAt: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearSensitiveAuthorization();
    document.body.dataset.authorization = "";
  });

  it("returns an existing valid authorization without prompting", async () => {
    useAuthStore.setState({
      sensitiveAuthorization: "existing-token",
      sensitiveAuthorizationExpiresAt: "2099-01-01T00:00:00.000Z",
      sensitiveAuthorizationInactivityTimeoutMs: 180_000,
    });

    render(
      <SensitiveAuthorizationProvider>
        <TestConsumer />
      </SensitiveAuthorizationProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Protect action" }));
    });

    expect(document.body.dataset.authorization).toBe("existing-token");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(authApi.reauthorize).not.toHaveBeenCalled();
  });

  it("reauthorizes with the password and returns the new token", async () => {
    render(
      <SensitiveAuthorizationProvider>
        <TestConsumer />
      </SensitiveAuthorizationProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Protect action" }));

    expect(
      screen.getByRole("dialog", { name: "Confirm your identity" }),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-password" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Authorize" }));

    await waitFor(() => {
      expect(document.body.dataset.authorization).toBe("new-sensitive-token");
    });

    expect(authApi.reauthorize).toHaveBeenCalledWith(
      "correct-password",
      "access-token",
    );

    expect(useAuthStore.getState().sensitiveAuthorization).toBe(
      "new-sensitive-token",
    );
  });

  it("announces the authorization window so global search can clear and disable itself", async () => {
    const started = vi.fn();
    const finished = vi.fn();
    window.addEventListener("sensitive-authorization:started", started);
    window.addEventListener("sensitive-authorization:finished", finished);
    render(
      <SensitiveAuthorizationProvider>
        <TestConsumer />
      </SensitiveAuthorizationProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Protect action" }));
    expect(started).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(finished).toHaveBeenCalledTimes(1);

    window.removeEventListener("sensitive-authorization:started", started);
    window.removeEventListener("sensitive-authorization:finished", finished);
  });

  it("clears the password and rejects an authorization result from a changed session", async () => {
    let resolveAuthorization!: (value: {
      token: string;
      expiresAt: string;
      inactivityTimeoutMs: number;
    }) => void;
    vi.mocked(authApi.reauthorize).mockImplementation(
      () => new Promise((resolve) => { resolveAuthorization = resolve; }),
    );

    render(
      <SensitiveAuthorizationProvider>
        <TestConsumer />
      </SensitiveAuthorizationProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Protect action" }));
    const passwordInput = screen.getByLabelText("Password");
    fireEvent.change(passwordInput, { target: { value: "old-session-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Authorize" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Verifying..." })).toBeDisabled());

    useAuthStore.setState({
      user: { id: "user-2", businessId: "business-1" },
    } as never);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.dataset.authorization).toBe("cancelled");

    resolveAuthorization({
      token: "stale-sensitive-token",
      expiresAt: "2099-01-01T00:00:00.000Z",
      inactivityTimeoutMs: 180_000,
    });
    await waitFor(() => expect(authApi.reauthorize).toHaveBeenCalledOnce());

    expect(useAuthStore.getState().sensitiveAuthorization).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Protect action" }));
    expect(screen.getByLabelText("Password")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  });

  it("cancels without authorizing the action", async () => {
    render(
      <SensitiveAuthorizationProvider>
        <TestConsumer />
      </SensitiveAuthorizationProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Protect action" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(document.body.dataset.authorization).toBe("cancelled");
    });

    expect(authApi.reauthorize).not.toHaveBeenCalled();
  });
});

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
    });

    useAuthStore.setState({
      accessToken: "access-token",
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

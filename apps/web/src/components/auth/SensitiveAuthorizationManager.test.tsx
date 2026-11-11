import { act, render } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SensitiveAuthorizationManager } from "./SensitiveAuthorizationManager.js";
import { useAuthStore } from "../../state/auth-store.js";
import * as authApi from "../../lib/auth-api.js";

describe("SensitiveAuthorizationManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(authApi, "recordSensitiveActivity").mockResolvedValue({
      expiresAt: "2099-01-01T00:00:00.000Z",
      inactivityTimeoutMs: 180_000,
    });

    useAuthStore.setState({
      accessToken: "access-token",
      sensitiveAuthorization: "sensitive-token",
      sensitiveAuthorizationExpiresAt: "2099-01-01T00:00:00.000Z",
      sensitiveAuthorizationInactivityTimeoutMs: 180_000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    useAuthStore.getState().clearSensitiveAuthorization();
  });

  it("clears sensitive authorization after three minutes of inactivity", () => {
    render(<SensitiveAuthorizationManager />);

    expect(useAuthStore.getState().sensitiveAuthorization).toBe(
      "sensitive-token",
    );

    act(() => {
      vi.advanceTimersByTime(3 * 60 * 1000 - 1);
    });

    expect(useAuthStore.getState().sensitiveAuthorization).toBe(
      "sensitive-token",
    );

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(useAuthStore.getState().sensitiveAuthorization).toBeNull();
    expect(
      useAuthStore.getState().sensitiveAuthorizationExpiresAt,
    ).toBeNull();
  });

  it("resets the inactivity timer and records active use on the server", async () => {
    render(<SensitiveAuthorizationManager />);

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });

    await act(async () => {
      window.dispatchEvent(new Event("click"));
      await Promise.resolve();
    });
    expect(authApi.recordSensitiveActivity).toHaveBeenCalledWith("sensitive-token", "access-token");

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });

    expect(useAuthStore.getState().sensitiveAuthorization).toBe(
      "sensitive-token",
    );

    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });

    expect(useAuthStore.getState().sensitiveAuthorization).toBeNull();
  });
});

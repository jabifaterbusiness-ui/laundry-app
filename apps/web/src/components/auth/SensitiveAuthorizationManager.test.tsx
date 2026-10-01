import { act, render } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SensitiveAuthorizationManager } from "./SensitiveAuthorizationManager.js";
import { useAuthStore } from "../../state/auth-store.js";

describe("SensitiveAuthorizationManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();

    useAuthStore.setState({
      sensitiveAuthorization: "sensitive-token",
      sensitiveAuthorizationExpiresAt: "2099-01-01T00:00:00.000Z",
    });
  });

  afterEach(() => {
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

  it("resets the inactivity timer when the user is active", () => {
    render(<SensitiveAuthorizationManager />);

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });

    act(() => {
      window.dispatchEvent(new Event("click"));
    });

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

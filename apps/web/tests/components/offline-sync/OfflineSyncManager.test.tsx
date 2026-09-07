import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfflineSyncManager } from "../../../src/components/offline-sync/OfflineSyncManager.js";
import { replayOfflineSyncQueue } from "../../../src/lib/offline-sync-replay.js";
import { useAuthStore } from "../../../src/state/auth-store.js";

vi.mock("../../../src/lib/offline-sync-replay.js", () => ({
  replayOfflineSyncQueue: vi.fn(),
}));

describe("OfflineSyncManager", () => {
  const replayMock = vi.mocked(replayOfflineSyncQueue);

  beforeEach(() => {
    replayMock.mockResolvedValue({
      processed: 0,
      applied: 0,
      conflicts: 0,
      rejected: 0,
      failed: 0,
      skipped: 0,
    });

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });

    useAuthStore.setState({
      user: {
        id: "user-1",
        businessId: "business-1",
        email: "staff@example.com",
        firstName: "Staff",
        lastName: "User",
        role: "STAFF",
        branches: [
          {
            id: "branch-1",
            name: "Main Branch",
          },
        ],
      },
      accessToken: "token-1",
      refreshToken: "refresh-1",
      activeBranchId: "branch-1",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().clearSession();
  });

  it("replays immediately when authenticated, scoped, and online", async () => {
    render(<OfflineSyncManager />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(replayMock).toHaveBeenCalledTimes(1);
    expect(replayMock).toHaveBeenCalledWith({
      businessId: "business-1",
      branchId: "branch-1",
      accessToken: "token-1",
    });
  });

  it("replays when the browser comes back online", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    render(<OfflineSyncManager />);

    expect(replayMock).not.toHaveBeenCalled();

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });

    expect(replayMock).toHaveBeenCalledTimes(1);
  });

  it("does not replay without an access token", async () => {
    useAuthStore.setState({
      accessToken: null,
    });

    render(<OfflineSyncManager />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(replayMock).not.toHaveBeenCalled();
  });

  it("does not replay without an active branch", async () => {
    useAuthStore.setState({
      activeBranchId: null,
    });

    render(<OfflineSyncManager />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(replayMock).not.toHaveBeenCalled();
  });

  it("does not replay while offline", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    render(<OfflineSyncManager />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(replayMock).not.toHaveBeenCalled();
  });

  it("removes the online listener when unmounted", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<OfflineSyncManager />);

    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    expect(addSpy).toHaveBeenCalledWith(
      "online",
      expect.any(Function),
    );

    expect(removeSpy).toHaveBeenCalledWith(
      "online",
      expect.any(Function),
    );

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

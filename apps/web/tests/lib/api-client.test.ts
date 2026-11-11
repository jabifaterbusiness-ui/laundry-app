import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../src/lib/api-client.js";
import { useAuthStore } from "../../src/state/auth-store.js";

beforeEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, activeBranchId: null } as never);
});

describe("apiFetch network errors", () => {
  it("classifies fetch failures as NetworkError", async () => {
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(
        apiFetch("/orders", {
          accessToken: "token",
          branchId: "branch-1",
        }),
      ).rejects.toMatchObject({
        name: "NetworkError",
        message: "Failed to fetch",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not classify HTTP errors as NetworkError", async () => {
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: "Forbidden",
            },
          }),
          {
            status: 403,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );

      await expect(
        apiFetch("/orders", {
          accessToken: "token",
          branchId: "branch-1",
        }),
      ).rejects.toMatchObject({
        name: "ApiError",
        status: 403,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("apiFetch validation details", () => {
  it("preserves server validation details on ApiError", async () => {
    const originalFetch = globalThis.fetch;
    const details = {
      formErrors: [],
      fieldErrors: {
        items: ["At least one item is required"],
      },
    };

    try {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: "Validation failed",
              details,
            },
          }),
          {
            status: 422,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

      await expect(apiFetch("/orders/order-1", { method: "PATCH" }))
        .rejects.toMatchObject({
          name: "ApiError",
          status: 422,
          message: "Validation failed",
          details,
        });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("apiFetch sensitive authorization", () => {
  it("sends the sensitive authorization header when provided", async () => {
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      );

      await apiFetch("/payments", {
        accessToken: "access-token",
        branchId: "branch-1",
        sensitiveAuthorization: "sensitive-token",
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/v1/payments",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer access-token",
            "X-Branch-Id": "branch-1",
            "X-Sensitive-Authorization": "sensitive-token",
          }),
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not send a sensitive authorization header when absent", async () => {
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      );

      await apiFetch("/payments", {
        accessToken: "access-token",
        branchId: "branch-1",
      });

      const call = vi.mocked(globalThis.fetch).mock.calls[0];
      const requestOptions = call?.[1] as RequestInit;

      expect(requestOptions.headers).toEqual(
        expect.objectContaining({
          Authorization: "Bearer access-token",
          "X-Branch-Id": "branch-1",
        }),
      );

      expect(requestOptions.headers).not.toHaveProperty(
        "X-Sensitive-Authorization",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});


describe("apiFetch access-token renewal", () => {
  it("renews an expired access token and retries the original request once", async () => {
    const originalFetch = globalThis.fetch;
    useAuthStore.setState({ accessToken: "expired-access", refreshToken: "refresh-one" } as never);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Invalid or expired access token" } }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: "fresh-access", refreshToken: "refresh-two" }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));
    try {
      globalThis.fetch = fetchMock;
      await expect(apiFetch("/orders", { accessToken: "expired-access", branchId: "branch-1" })).resolves.toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/auth/refresh");
      expect(fetchMock.mock.calls[2]?.[1]).toEqual(expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer fresh-access", "X-Branch-Id": "branch-1" }),
      }));
      expect(useAuthStore.getState().accessToken).toBe("fresh-access");
      expect(useAuthStore.getState().refreshToken).toBe("refresh-two");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("shares one refresh request when multiple API calls expire together", async () => {
    const originalFetch = globalThis.fetch;
    useAuthStore.setState({ accessToken: "expired-access", refreshToken: "refresh-one" } as never);
    let resolveRefresh!: (response: Response) => void;
    const refreshResponse = new Promise<Response>((resolve) => { resolveRefresh = resolve; });
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === "/api/v1/auth/refresh") return refreshResponse;
      if ((init?.headers as Record<string, string> | undefined)?.Authorization === "Bearer fresh-access") {
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));
      }
      return Promise.resolve(new Response(JSON.stringify({ error: { message: "Invalid or expired access token" } }), { status: 401 }));
    });
    try {
      globalThis.fetch = fetchMock;
      const first = apiFetch("/orders", { accessToken: "expired-access" });
      const second = apiFetch("/invoices", { accessToken: "expired-access" });
      await Promise.resolve();
      resolveRefresh(new Response(JSON.stringify({ accessToken: "fresh-access", refreshToken: "refresh-two" }), { status: 200, headers: { "Content-Type": "application/json" } }));
      await expect(Promise.all([first, second])).resolves.toEqual([{ ok: true }, { ok: true }]);
      expect(fetchMock.mock.calls.filter((call) => String(call[0]) === "/api/v1/auth/refresh")).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

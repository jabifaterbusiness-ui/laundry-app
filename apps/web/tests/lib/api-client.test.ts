import { describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../src/lib/api-client.js";

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

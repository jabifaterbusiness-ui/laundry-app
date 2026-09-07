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

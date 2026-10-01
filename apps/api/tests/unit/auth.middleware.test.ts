import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSensitiveAuthorizationMock } = vi.hoisted(() => ({
  requireSensitiveAuthorizationMock: vi.fn(),
}));

vi.mock("../../src/modules/auth/sensitive-authorization.service.js", () => ({
  requireSensitiveAuthorization: requireSensitiveAuthorizationMock,
}));

import {
  requireSensitiveAuthorization,
} from "../../src/modules/auth/auth.middleware.js";

function makeRequest(
  user: { id: string; businessId: string | null } | undefined,
  token?: string,
) {
  return {
    user,
    headers: token === undefined
      ? {}
      : { "x-sensitive-authorization": token },
  } as unknown as Request;
}

describe("requireSensitiveAuthorization middleware", () => {
  const next = vi.fn() as unknown as NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    requireSensitiveAuthorizationMock.mockResolvedValue({});
  });

  it("rejects unauthenticated requests", async () => {
    const req = makeRequest(undefined, "sensitive-token");

    await expect(
      requireSensitiveAuthorization(req, {} as Response, next),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Authentication is required",
    });

    expect(requireSensitiveAuthorizationMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects requests without a sensitive authorization token", async () => {
    const req = makeRequest({
      id: "user-1",
      businessId: "business-1",
    });

    await expect(
      requireSensitiveAuthorization(req, {} as Response, next),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Sensitive authorization is required",
    });

    expect(requireSensitiveAuthorizationMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a blank sensitive authorization token", async () => {
    const req = makeRequest(
      {
        id: "user-1",
        businessId: "business-1",
      },
      "   ",
    );

    await expect(
      requireSensitiveAuthorization(req, {} as Response, next),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Sensitive authorization is required",
    });

    expect(requireSensitiveAuthorizationMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("passes the authenticated user and business context to the validator", async () => {
    const req = makeRequest(
      {
        id: "user-1",
        businessId: "business-1",
      },
      "  sensitive-token  ",
    );

    await requireSensitiveAuthorization(req, {} as Response, next);

    expect(requireSensitiveAuthorizationMock).toHaveBeenCalledWith({
      token: "sensitive-token",
      userId: "user-1",
      businessId: "business-1",
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("allows a platform-scoped authenticated user to be validated with null business context", async () => {
    const req = makeRequest(
      {
        id: "user-1",
        businessId: null,
      },
      "sensitive-token",
    );

    await requireSensitiveAuthorization(req, {} as Response, next);

    expect(requireSensitiveAuthorizationMock).toHaveBeenCalledWith({
      token: "sensitive-token",
      userId: "user-1",
      businessId: null,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("does not call next when the sensitive authorization validator rejects", async () => {
    requireSensitiveAuthorizationMock.mockRejectedValue(
      new Error("Sensitive authorization is missing or expired"),
    );

    const req = makeRequest(
      {
        id: "user-1",
        businessId: "business-1",
      },
      "expired-token",
    );

    await expect(
      requireSensitiveAuthorization(req, {} as Response, next),
    ).rejects.toThrow("Sensitive authorization is missing or expired");

    expect(next).not.toHaveBeenCalled();
  });
});

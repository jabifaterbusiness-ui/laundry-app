import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSensitiveAuthorizationMock, userFindUniqueMock } = vi.hoisted(() => ({
  requireSensitiveAuthorizationMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { user: { findUnique: userFindUniqueMock } },
}));

vi.mock("../../src/modules/auth/sensitive-authorization.service.js", () => ({
  requireSensitiveAuthorization: requireSensitiveAuthorizationMock,
}));

import {
  requireAuth,
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


describe("requireAuth middleware account validity", () => {
  const next = vi.fn() as unknown as NextFunction;
  const token = jwt.sign(
    { sub: "user-1", email: "user@example.com", securityRole: "STAFF", businessId: "business-1" },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: "15m" },
  );

  beforeEach(() => {
    vi.clearAllMocks();
    userFindUniqueMock.mockResolvedValue({ isActive: true, deletedAt: null });
  });

  it("accepts a valid access token only when its account is active", async () => {
    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;

    await requireAuth(req, {} as Response, next);

    expect(userFindUniqueMock).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { isActive: true, deletedAt: true },
    });
    expect(req.user).toMatchObject({ id: "user-1", businessId: "business-1" });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rejects an already-issued access token after account deactivation", async () => {
    userFindUniqueMock.mockResolvedValue({ isActive: false, deletedAt: null });
    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;

    await requireAuth(req, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 401,
      message: "Invalid or expired access token",
    }));
  });

  it("rejects an already-issued access token after account deletion", async () => {
    userFindUniqueMock.mockResolvedValue({ isActive: true, deletedAt: new Date() });
    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;

    await requireAuth(req, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 401,
      message: "Invalid or expired access token",
    }));
  });

  it("rejects a token for an account that no longer exists", async () => {
    userFindUniqueMock.mockResolvedValue(null);
    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;

    await requireAuth(req, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 401,
      message: "Invalid or expired access token",
    }));
  });
});

import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { requireRole } from "../../src/middleware/rbac.js";
import { AppError } from "../../src/middleware/error-handler.js";

function makeReq(role?: string): Request {
  return (
    role
      ? {
          user: {
            id: "u1",
            email: "a@example.com",
            role: "",
            securityRole: role,
            businessId: "biz-1",
          },
        }
      : {}
  ) as Request;
}

const res = {} as Response;

describe("requireRole", () => {
  it("allows a caller whose role is in the allowed list", () => {
    const next = vi.fn();
    requireRole("BUSINESS_OWNER" as never, "BRANCH_MANAGER" as never)(makeReq("BUSINESS_OWNER"), res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("denies a caller whose role is not in the allowed list", () => {
    const next = vi.fn();
    expect(() =>
      requireRole("BUSINESS_OWNER" as never)(makeReq("STAFF"), res, next),
    ).toThrow(AppError);
    expect(next).not.toHaveBeenCalled();
  });

  it("denies when there is no authenticated user", () => {
    const next = vi.fn();
    expect(() => requireRole("STAFF" as never)(makeReq(), res, next)).toThrow(AppError);
    expect(next).not.toHaveBeenCalled();
  });
});

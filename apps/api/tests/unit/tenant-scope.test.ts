import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { assertTenantMatch } from "../../src/lib/tenant-scope.js";
import { AppError } from "../../src/middleware/error-handler.js";

function makeReq(businessId: string | null): Request {
  return { user: { id: "user-1", email: "a@example.com", role: "STAFF", businessId } } as unknown as Request;
}

describe("assertTenantMatch", () => {
  it("allows access when the resource's businessId matches the caller's", () => {
    expect(() => assertTenantMatch(makeReq("biz-1"), "biz-1")).not.toThrow();
  });

  it("denies cross-business tenant access", () => {
    expect(() => assertTenantMatch(makeReq("biz-1"), "biz-2")).toThrow(AppError);
  });

  it("denies access when the caller has no business context", () => {
    expect(() => assertTenantMatch(makeReq(null), "biz-1")).toThrow(AppError);
  });
});

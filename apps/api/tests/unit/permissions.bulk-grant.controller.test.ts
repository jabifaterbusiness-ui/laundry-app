import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  listPermissions: vi.fn(),
  getEffectivePermissionCodes: vi.fn(),
  getUserPermissions: vi.fn(),
  allowAllUserPermissions: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("../../src/modules/permissions/permissions.service.js", () => ({
  listPermissions: mocks.listPermissions,
  getRolePermissions: vi.fn(),
  getUserPermissions: mocks.getUserPermissions,
  upsertBusinessRolePermission: vi.fn(),
  removeBusinessRolePermission: vi.fn(),
  upsertUserPermissionOverride: vi.fn(),
  removeUserPermissionOverride: vi.fn(),
  allowAllUserPermissions: mocks.allowAllUserPermissions,
  disallowAllUserPermissions: vi.fn(),
  requirePermissionForGrant: vi.fn(),
  getEffectivePermissionCodes: mocks.getEffectivePermissionCodes,
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

import { allowAllUserPermissionsController } from "../../src/modules/permissions/permissions.controller.js";

const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_ID = "33333333-3333-4333-8333-333333333333";

function request() {
  return {
    user: {
      id: ACTOR_ID,
      businessId: BUSINESS_ID,
      securityRole: "BRANCH_MANAGER",
    },
    params: { userId: TARGET_ID },
    body: { reason: "Delegated permission administration" },
    correlationId: "correlation-a",
  } as unknown as Request;
}

function response() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe("Allow All permission controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listPermissions.mockResolvedValue([
      { code: "users.manage_permissions" },
      { code: "chat.view" },
      { code: "chat.cross_branch" },
      { code: "chat.send_message" },
    ]);
    mocks.getEffectivePermissionCodes.mockResolvedValue([
      "users.manage_permissions",
      "chat.view",
      "chat.send_message",
    ]);
    mocks.getUserPermissions.mockResolvedValue({
      permissions: [
        { code: "orders.view", allowed: true },
        { code: "chat.view", allowed: false },
      ],
    });
    mocks.allowAllUserPermissions.mockResolvedValue({
      allowed: true,
      count: 3,
    });
    mocks.recordAuditEvent.mockResolvedValue(undefined);
  });

  it("grants only the actor's authorised catalogue and audits the exact result", async () => {
    const res = response();

    await allowAllUserPermissionsController(request(), res);

    expect(mocks.allowAllUserPermissions).toHaveBeenCalledWith(
      BUSINESS_ID,
      TARGET_ID,
      ["users.manage_permissions", "chat.view", "chat.send_message"],
    );
    expect(mocks.allowAllUserPermissions).not.toHaveBeenCalledWith(
      BUSINESS_ID,
      TARGET_ID,
      expect.arrayContaining(["chat.cross_branch"]),
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "permission.user.allow_all",
        actorUserId: ACTOR_ID,
        businessId: BUSINESS_ID,
        metadata: expect.objectContaining({
          before: {
            permissionStates: [
              { code: "chat.view", allowed: false },
              { code: "orders.view", allowed: true },
            ],
            allowedPermissionCodes: ["orders.view"],
          },
          grantablePermissionCodes: [
            "chat.send_message",
            "chat.view",
            "users.manage_permissions",
          ],
          after: {
            permissionStates: [
              { code: "chat.view", allowed: true },
              { code: "orders.view", allowed: true },
            ],
            allowedPermissionCodes: ["chat.view", "orders.view"],
          },
        }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ allowed: true, count: 3 });
  });

  it("refuses bulk grants when the actor has no grantable permissions", async () => {
    mocks.getEffectivePermissionCodes.mockResolvedValue([]);
    const res = response();

    await expect(
      allowAllUserPermissionsController(request(), res),
    ).rejects.toThrow("You do not have any permissions you are authorised to grant");

    expect(mocks.allowAllUserPermissions).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});

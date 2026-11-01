import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, audit, sensitiveAuth } = vi.hoisted(() => ({
  db: {
    business: { findUnique: vi.fn(), delete: vi.fn() },
    sensitiveAuthorization: { update: vi.fn() },
  },
  audit: vi.fn(),
  sensitiveAuth: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({ prisma: db }));
vi.mock("../../src/lib/audit.js", () => ({ recordAuditEvent: audit }));
vi.mock("../../src/modules/auth/sensitive-authorization.service.js", () => ({
  requireSensitiveAuthorization: sensitiveAuth,
}));

import { permanentlyDeletePlatformBusiness } from "../../src/modules/platform/platform.service.js";

const input = {
  businessId: "business-1",
  confirmation: "DELETE laundry-one",
  authorizationToken: "reauth-token",
  actorUserId: "platform-admin-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  sensitiveAuth.mockResolvedValue({ id: "authorization-1" });
  db.business.findUnique.mockResolvedValue({
    id: "business-1",
    name: "Laundry One",
    slug: "laundry-one",
    isActive: false,
    archivedAt: new Date("2026-10-01T00:00:00.000Z"),
  });
  db.business.delete.mockResolvedValue({ id: "business-1" });
  db.sensitiveAuthorization.update.mockResolvedValue({});
  audit.mockResolvedValue(undefined);
});

describe("permanent business deletion", () => {
  it("requires a recent platform-admin sensitive authorization and an exact slug confirmation", async () => {
    await permanentlyDeletePlatformBusiness(input);
    expect(sensitiveAuth).toHaveBeenCalledWith({
      token: "reauth-token",
      userId: "platform-admin-1",
      businessId: null,
    });
    expect(db.business.delete).toHaveBeenCalledWith({ where: { id: "business-1" } });
    expect(db.sensitiveAuthorization.update).toHaveBeenCalledWith({
      where: { id: "authorization-1" },
      data: { revokedAt: expect.any(Date) },
    });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "platform.business.permanently_deleted",
      entityId: "business-1",
      actorUserId: "platform-admin-1",
    }));
  });

  it("refuses deletion until the business has been deactivated and archived", async () => {
    db.business.findUnique.mockResolvedValueOnce({
      id: "business-1", name: "Laundry One", slug: "laundry-one",
      isActive: true, archivedAt: null,
    });
    await expect(permanentlyDeletePlatformBusiness(input)).rejects.toMatchObject({
      statusCode: 409,
      message: "Deactivate and archive the business before permanent deletion",
    });
    expect(db.business.delete).not.toHaveBeenCalled();
  });

  it("requires the exact DELETE slug confirmation", async () => {
    await expect(permanentlyDeletePlatformBusiness({ ...input, confirmation: "DELETE Laundry One" }))
      .rejects.toMatchObject({ statusCode: 422 });
    expect(db.business.delete).not.toHaveBeenCalled();
  });

  it("leaves archived data untouched when database retention constraints block deletion", async () => {
    db.business.delete.mockRejectedValueOnce({ code: "P2003" });
    await expect(permanentlyDeletePlatformBusiness(input)).rejects.toMatchObject({
      statusCode: 409,
      message: "This business has records protected by data-retention constraints. It remains archived and was not deleted.",
    });
    expect(db.sensitiveAuthorization.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { getPlatformConfig } from "../../src/modules/platform/platform-config.service.js";
import { requirePlatformOperational } from "../../src/modules/platform/platform-controls.middleware.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { business: { findFirst: vi.fn() } },
}));
vi.mock("../../src/modules/platform/platform-config.service.js", () => ({
  getPlatformConfig: vi.fn(),
}));

const businessFindFirst = vi.mocked(prisma.business.findFirst);
const platformConfig = vi.mocked(getPlatformConfig);

function requestFor(securityRole = "STAFF", businessId: string | null = "biz-A") {
  return {
    user: {
      id: "user-1",
      email: "owner@example.com",
      role: "",
      securityRole,
      businessId,
    },
  } as never;
}

describe("requirePlatformOperational tenant status guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformConfig.mockResolvedValue({ maintenanceMode: false } as never);
  });

  it("blocks an already-authenticated user immediately after business deactivation", async () => {
    businessFindFirst.mockResolvedValue(null);

    await expect(
      requirePlatformOperational(requestFor() as never, {} as never, vi.fn()),
    ).rejects.toThrow("This business account is inactive, archived, or temporarily suspended");

    expect(businessFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "biz-A", isActive: true, archivedAt: null }),
    }));
  });

  it("allows an active, unsuspended business to continue", async () => {
    businessFindFirst.mockResolvedValue({ id: "biz-A" } as never);
    const next = vi.fn();

    await requirePlatformOperational(requestFor() as never, {} as never, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("does not apply tenant status checks to platform administrators", async () => {
    const next = vi.fn();

    await requirePlatformOperational(requestFor("PLATFORM_ADMIN", null) as never, {} as never, next);

    expect(businessFindFirst).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});

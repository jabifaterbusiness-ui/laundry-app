import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { prisma } from "../../src/lib/prisma.js";
import { logger } from "../../src/lib/logger.js";
import { recordAuditEvent, sanitizeAuditMetadata } from "../../src/lib/audit.js";

const create = vi.mocked(prisma.auditLog.create);
const findUser = vi.mocked(prisma.user.findUnique);

beforeEach(() => {
  vi.clearAllMocks();
  findUser.mockResolvedValue({ fullName: "Test User" } as never);
});

describe("sanitizeAuditMetadata", () => {
  it("strips top-level secret-shaped keys", () => {
    const result = sanitizeAuditMetadata({
      password: "hunter2",
      accessToken: "should-be-removed-too", // camelCase form, not an exact key match - see note below
      note: "kept",
    });

    // Only exact (case-insensitive) key matches are stripped; "accessToken"
    // does not match "accesstoken".toLowerCase() collapse... it does,
    // since comparison lowercases the key. Confirm both are gone.
    expect(result).toEqual({ note: "kept" });
  });

  it("strips secret-shaped keys nested inside objects and arrays", () => {
    const result = sanitizeAuditMetadata({
      user: { email: "a@example.com", passwordHash: "abc123" },
      tokens: [{ refreshToken: "raw-secret", label: "primary" }],
    });

    expect(result).toEqual({
      user: { email: "a@example.com" },
      tokens: [{ label: "primary" }],
    });
  });

  it("leaves non-secret data untouched", () => {
    const result = sanitizeAuditMetadata({ orderId: "order-1", amount: 42 });
    expect(result).toEqual({ orderId: "order-1", amount: 42 });
  });
});

describe("recordAuditEvent", () => {
  it("creates an audit log row with the expected shape", async () => {
    create.mockResolvedValue({} as never);

    await recordAuditEvent({
      action: "user.login",
      entityType: "User",
      entityId: "user-1",
      businessId: "biz-1",
      branchId: null,
      actorUserId: "user-1",
      correlationId: "corr-1",
      metadata: { note: "ok" },
    });

    expect(findUser).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { fullName: true },
    });
    expect(create).toHaveBeenCalledOnce();
    const call = create.mock.calls[0]![0];
    expect(call.data).toMatchObject({
      action: "user.login",
      entityType: "User",
      entityId: "user-1",
      businessId: "biz-1",
      branchId: null,
      actorUserId: "user-1",
      correlationId: "corr-1",
      metadata: { note: "ok", authorizedBy: "Test User", reference: "Test User" },
    });
  });

  it("never persists secrets even if a caller accidentally includes them", async () => {
    create.mockResolvedValue({} as never);

    await recordAuditEvent({
      action: "user.login",
      entityType: "User",
      metadata: { password: "hunter2", refreshToken: "raw-secret", note: "ok" },
    });

    const call = create.mock.calls[0]![0];
    expect(call.data.metadata).toEqual({ note: "ok" });
  });

  it("swallows and logs a database failure instead of throwing", async () => {
    create.mockRejectedValue(new Error("db unavailable"));

    await expect(
      recordAuditEvent({ action: "user.login", entityType: "User" }),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledOnce();
  });
});

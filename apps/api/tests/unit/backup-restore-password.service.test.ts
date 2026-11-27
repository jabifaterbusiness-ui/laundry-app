import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  encryptionKey: "0123456789abcdef".repeat(4),
  businesses: new Map<string, string | null>(),
}));

vi.mock("../../src/config/index.js", () => ({
  config: {
    backups: {
      get encryptionKey() { return state.encryptionKey; },
    },
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    business: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        state.businesses.has(where.id)
          ? { backupRestorePasswordCiphertext: state.businesses.get(where.id) }
          : null),
      updateMany: vi.fn(async ({ where, data }: {
        where: { id: string; backupRestorePasswordCiphertext?: null };
        data: { backupRestorePasswordCiphertext: string };
      }) => {
        if (!state.businesses.has(where.id)) return { count: 0 };
        if (where.backupRestorePasswordCiphertext === null && state.businesses.get(where.id) !== null) return { count: 0 };
        state.businesses.set(where.id, data.backupRestorePasswordCiphertext);
        return { count: 1 };
      }),
    },
  },
}));

vi.mock("../../src/middleware/error-handler.js", () => ({
  AppError: class AppError extends Error {
    constructor(message: string, public readonly statusCode: number) { super(message); }
  },
}));

import {
  changeBusinessRestorePassword,
  getBusinessRestorePassword,
  verifyBusinessRestorePassword,
} from "../../src/modules/migrations/backup-restore-password.service.js";

describe("business restore password service", () => {
  beforeEach(() => {
    state.encryptionKey = "0123456789abcdef".repeat(4);
    state.businesses = new Map([["business-a", null], ["business-b", null]]);
  });

  it("initializes once and returns the persisted password to concurrent callers", async () => {
    const values = await Promise.all([
      getBusinessRestorePassword("business-a"),
      getBusinessRestorePassword("business-a"),
      getBusinessRestorePassword("business-a"),
    ]);
    expect(values.every((value) => value === values[0])).toBe(true);
    expect(values[0]).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(state.businesses.get("business-a")).not.toContain(values[0]);
  });

  it("encrypts secrets with business-specific context", async () => {
    const passwordA = await getBusinessRestorePassword("business-a");
    const passwordB = await getBusinessRestorePassword("business-b");
    expect(passwordA).not.toBe(passwordB);
    await expect(verifyBusinessRestorePassword("business-b", passwordA)).rejects.toMatchObject({ statusCode: 403 });
    await expect(verifyBusinessRestorePassword("business-a", passwordA)).resolves.toBeUndefined();
  });

  it("changes and verifies the password without exposing it in errors", async () => {
    await changeBusinessRestorePassword("business-a", "new-secret-123");
    await expect(verifyBusinessRestorePassword("business-a", "new-secret-123")).resolves.toBeUndefined();
    await expect(verifyBusinessRestorePassword("business-a", "wrong-secret"))
      .rejects.toMatchObject({ statusCode: 403, message: "The business restoration password is incorrect." });
    expect(state.businesses.get("business-a")).not.toContain("new-secret-123");
  });

  it("reports missing businesses and rejects an unset password safely", async () => {
    await expect(getBusinessRestorePassword("missing")).rejects.toMatchObject({ statusCode: 404 });
    await expect(verifyBusinessRestorePassword("business-a", "anything")).rejects.toMatchObject({ statusCode: 409 });
    await expect(verifyBusinessRestorePassword("business-a", undefined)).rejects.toMatchObject({ statusCode: 409 });
  });
});

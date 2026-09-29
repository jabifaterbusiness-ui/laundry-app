import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  migrationJob: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  customer: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
  },
}));

const readMigrationSource = vi.hoisted(() => vi.fn());

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../src/modules/migrations/storage.js", () => ({
  readMigrationSource,
  storeMigrationSource: vi.fn(),
}));

import { prisma } from "../../src/lib/prisma.js";
import { importMigrationJob } from "../../src/modules/migrations/migration.service.js";

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(prisma.$transaction).mockImplementation(
    async (...args: unknown[]) => {
      const callback = args[0] as (
        tx: typeof prismaMock,
      ) => Promise<unknown>;
      return callback(prismaMock);
    },
  );

  vi.mocked(prisma.migrationJob.findFirst).mockResolvedValue({
    id: "job-1",
    businessId: "business-1",
    sourceName: "customers.csv",
    sourcePath: "migration/job-1/source",
    status: "READY",
    summary: {
      files: 1,
      tables: 1,
      records: 3,
      supported: { customers: 3 },
      unsupported: [],
      warnings: [],
      errors: [],
    },
  } as never);

  vi.mocked(prisma.migrationJob.update).mockResolvedValue({} as never);

  vi.mocked(prisma.customer.findMany).mockResolvedValue([]);

  vi.mocked(prisma.customer.createMany).mockResolvedValue({
    count: 1,
  } as never);

  readMigrationSource.mockResolvedValue(
    Buffer.from(
      [
        "name,phone",
        "Jane Doe,08012345678",
        "Jane Duplicate,08012345678",
      ].join("\n"),
    ),
  );
});

describe("#20 migration import service", () => {
  it("imports inside a transaction and suppresses repeated source phones for skip", async () => {
    const result = await importMigrationJob({
      businessId: "business-1",
      userId: "user-1",
      jobId: "job-1",
      duplicatePolicy: "skip",
      mapping: {
        name: "name",
        phone: "phone",
      },
    });

    expect(result).toEqual({
      imported: {
        customersCreated: 1,
        customersMerged: 0,
        customersSkipped: 1,
        invalidRows: 0,
      },
      duplicatePolicy: "skip",
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();

    const transactionCall = vi.mocked(prisma.$transaction).mock.calls[0];
    expect(transactionCall?.[1]).toEqual({
      maxWait: 10_000,
      timeout: 120_000,
    });

    expect(prisma.customer.createMany).toHaveBeenCalledOnce();
    expect(prisma.customer.createMany).toHaveBeenCalledWith({
      data: [
        {
          businessId: "business-1",
          name: "Jane Doe",
          phone: expect.any(String),
          email: null,
          address: null,
          notes: null,
        },
      ],
    });

    expect(prisma.migrationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({
          status: "COMPLETED",
          completedAt: expect.any(Date),
          errorMessage: null,
          summary: expect.objectContaining({
            import: result,
          }),
        }),
      }),
    );
  });

  it("marks the job FAILED after a transaction error", async () => {
    vi.mocked(prisma.customer.createMany).mockRejectedValue(
      new Error("simulated import failure"),
    );

    await expect(
      importMigrationJob({
        businessId: "business-1",
        userId: "user-1",
        jobId: "job-1",
        duplicatePolicy: "skip",
        mapping: {
          name: "name",
          phone: "phone",
        },
      }),
    ).rejects.toThrow("simulated import failure");

    expect(prisma.$transaction).toHaveBeenCalledOnce();

    expect(prisma.migrationJob.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "FAILED",
        errorMessage: "simulated import failure",
      },
    });
  });
});

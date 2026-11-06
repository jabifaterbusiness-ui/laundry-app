import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../src/middleware/error-handler.js";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
    employeeCompensation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    branchResourceShare: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  recordAuditEvent: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: mocks.prisma,
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

import {
  createCompensation,
  getCompensation,
  getCurrentCompensation,
  listCompensation,
} from "../../src/modules/payroll/compensation.service.js";

describe("compensation service", () => {
  beforeEach(() => {
    mocks.prisma.branchResourceShare.findMany.mockResolvedValue([] as never);
  });
  it("creates a compensation record for an employee in the business", async () => {
    mocks.prisma.user.findFirst.mockResolvedValue({
      id: "employee-1",
      fullName: "Employee One",
      role: "STAFF",
    });

    const tx = {
      employeeCompensation: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "comp-1",
          businessId: "biz-1",
          employeeId: "employee-1",
          basicSalary: 100000,
          effectiveFrom: new Date("2026-09-01"),
          effectiveTo: null,
        }),
      },
    };

    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: any) => unknown) => callback(tx),
    );

    const result = await createCompensation({
      businessId: "biz-1",
      branchId: "branch-1",
      employeeId: "employee-1",
      basicSalary: 100000,
      effectiveFrom: new Date("2026-09-01"),
      actorUserId: "owner-1",
    });

    expect(result.id).toBe("comp-1");
    expect(tx.employeeCompensation.create).toHaveBeenCalled();
    expect(tx.employeeCompensation.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ businessId: "biz-1", branchId: "branch-1", employeeId: "employee-1" }),
    }));
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "employee_compensation.created",
        entityType: "EMPLOYEE_COMPENSATION",
        entityId: "comp-1",
      }),
    );
  });

  it("rejects an employee outside the authenticated business", async () => {
    mocks.prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      createCompensation({
        businessId: "biz-1",
        branchId: "branch-1",
        employeeId: "employee-other",
        basicSalary: 100000,
        effectiveFrom: new Date("2026-09-01"),
        actorUserId: "owner-1",
      }),
    ).rejects.toMatchObject({
      message: "Employee not found in this business",
      statusCode: 404,
    } satisfies Partial<AppError>);
  });

  it("rejects a duplicate effective date", async () => {
    mocks.prisma.user.findFirst.mockResolvedValue({
      id: "employee-1",
      fullName: "Employee One",
      role: "STAFF",
    });

    const tx = {
      employeeCompensation: {
        findFirst: vi.fn().mockResolvedValue({
          id: "comp-old",
          effectiveFrom: new Date("2026-09-01"),
          effectiveTo: null,
        }),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: any) => unknown) => callback(tx),
    );

    await expect(
      createCompensation({
        businessId: "biz-1",
        branchId: "branch-1",
        employeeId: "employee-1",
        basicSalary: 120000,
        effectiveFrom: new Date("2026-09-01"),
        actorUserId: "owner-1",
      }),
    ).rejects.toMatchObject({
      message: "A compensation record already exists for this effective date",
      statusCode: 400,
    });
  });

  it("preserves the previous record when adding a new salary", async () => {
    mocks.prisma.user.findFirst.mockResolvedValue({
      id: "employee-1",
      fullName: "Employee One",
      role: "STAFF",
    });

    const tx = {
      employeeCompensation: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: "comp-old",
            effectiveFrom: new Date("2026-01-01"),
            effectiveTo: null,
          })
          .mockResolvedValueOnce(null),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({
          id: "comp-new",
          basicSalary: 150000,
        }),
      },
    };

    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: any) => unknown) => callback(tx),
    );

    await createCompensation({
      businessId: "biz-1",
      branchId: "branch-1",
      employeeId: "employee-1",
      basicSalary: 150000,
      effectiveFrom: new Date("2026-09-01"),
      actorUserId: "owner-1",
    });

    expect(tx.employeeCompensation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "comp-old" },
        data: { effectiveTo: new Date("2026-09-01") },
      }),
    );
  });

  it("gets a compensation record only within the business scope", async () => {
    mocks.prisma.employeeCompensation.findFirst.mockResolvedValue({
      id: "comp-1",
      businessId: "biz-1",
    });

    const result = await getCompensation({
      businessId: "biz-1",
      branchId: "branch-1",
      id: "comp-1",
      userId: "user-1",
    });

    expect(result.id).toBe("comp-1");
    expect(mocks.prisma.employeeCompensation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "comp-1",
          businessId: "biz-1",
          AND: [
            {
              OR: [
                { branchId: { in: ["branch-1"] } },
                { id: { in: [] } },
              ],
            },
            {
              effectiveFrom: { lte: new Date("2026-08-15") },
              OR: [
                { effectiveTo: null },
                { effectiveTo: { gt: new Date("2026-08-15") } },
              ],
            },
          ],
          employee: { is: { branches: { some: { branchId: "branch-1" } } } },
        },
      }),
    );
  });

  it("rejects a compensation record from another business", async () => {
    mocks.prisma.employeeCompensation.findFirst.mockResolvedValue(null);

    await expect(
      getCompensation({
        businessId: "biz-1",
        branchId: "branch-1",
        id: "comp-other",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      message: "Compensation record not found",
      statusCode: 404,
    });
  });

  it("lists compensation history within the business", async () => {
    mocks.prisma.employeeCompensation.findMany.mockResolvedValue([]);

    await listCompensation({
      businessId: "biz-1",
      branchId: "branch-1",
      employeeId: "employee-1",
      userId: "user-1",
    });

    expect(mocks.prisma.employeeCompensation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz-1",
          AND: [
            {
              OR: [
                { branchId: { in: ["branch-1"] } },
                { id: { in: [] } },
              ],
            },
            expect.objectContaining({
              effectiveFrom: { lte: new Date("2026-08-15") },
              OR: [
                { effectiveTo: null },
                { effectiveTo: { gt: new Date("2026-08-15") } },
              ],
            }),
          ],
          employee: { is: { branches: { some: { branchId: "branch-1" } } } },
          employeeId: "employee-1",
        },
      }),
    );
  });

  it("returns the compensation effective on a payroll date", async () => {
    mocks.prisma.employeeCompensation.findFirst.mockClear();
    mocks.prisma.employeeCompensation.findFirst.mockResolvedValue({
      id: "comp-1",
      basicSalary: 100000,
    });

    const result = await getCurrentCompensation({
      businessId: "biz-1",
      branchId: "branch-1",
      employeeId: "employee-1",
      userId: "user-1",
      effectiveDate: new Date("2026-08-15"),
    });

    expect(result.basicSalary).toBe(100000);
    expect(mocks.prisma.employeeCompensation.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.employeeCompensation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-1",
          employeeId: "employee-1",
          OR: [
            { branchId: { in: ["branch-1"] } },
            { id: { in: [] } },
          ],
        }),
      }),
    );
  });

  it("does not treat an unassigned legacy compensation record as branch-owned", async () => {
    mocks.prisma.employeeCompensation.findFirst.mockClear();
    mocks.prisma.employeeCompensation.findFirst.mockResolvedValue(null);

    await expect(
      getCurrentCompensation({
        businessId: "biz-1",
        branchId: "branch-1",
        employeeId: "employee-1",
        userId: "user-1",
        effectiveDate: new Date("2026-08-15"),
      }),
    ).rejects.toMatchObject({
      message: "No compensation record found for employee",
      statusCode: 404,
    });

    expect(mocks.prisma.employeeCompensation.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.employeeCompensation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-1",
          employeeId: "employee-1",
          AND: [
            {
              OR: [
                { branchId: { in: ["branch-1"] } },
                { id: { in: [] } },
              ],
            },
            expect.objectContaining({
              effectiveFrom: { lte: new Date("2026-08-15") },
            }),
          ],
        }),
      }),
    );
  });
});

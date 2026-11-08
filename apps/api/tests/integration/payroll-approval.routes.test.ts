import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const { sensitiveAuthorizationMock } = vi.hoisted(() => ({
  sensitiveAuthorizationMock: vi.fn(),
}));

vi.mock("../../src/modules/auth/sensitive-authorization.service.js", () => ({
  requireSensitiveAuthorization: sensitiveAuthorizationMock,
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    refreshToken: { findFirst: vi.fn().mockResolvedValue({ id: "session-test" }) },
    user: { findUnique: vi.fn().mockResolvedValue({ isActive: true, deletedAt: null }) },
    platformConfig: {
      upsert: vi.fn().mockResolvedValue({
        id: "platform-config",
        allowNewBusinessRegistration: true,
        maintenanceMode: false,
        whatsappMessagingEnabled: true,
        automatedNotificationsEnabled: true,
        offlineSyncEnabled: true,
        version: 1,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    },
    permission: {
      findUnique: vi.fn().mockImplementation(
        async ({ where }: { where: { code: string } }) => ({
          id: `permission-${where.code}`,
        }),
      ),
    },
    userPermissionOverride: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    businessRolePermission: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    subscription: {
      findUnique: vi.fn().mockResolvedValue({
        id: "subscription-1",
        businessId: "biz-A",
        plan: "MONTHLY",
        status: "ACTIVE",
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
        endsAt: new Date("2099-01-01T00:00:00.000Z"),
      }),
    },
    business: {
      findFirst: vi.fn(),
    },
    branch: {
      findFirst: vi.fn(),
    },
    userBranch: {
      findUnique: vi.fn(),
    },
    payrollPeriod: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    payrollRecord: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../src/lib/prisma.js";
import { recordAuditEvent } from "../../src/lib/audit.js";
import { createApp } from "../../src/app.js";

const payrollPeriodFindFirst = vi.mocked(prisma.payrollPeriod.findFirst);
const userBranchFindUnique = vi.mocked(prisma.userBranch.findUnique);
const businessFindFirst = vi.mocked(prisma.business.findFirst);
const branchFindFirst = vi.mocked(prisma.branch.findFirst);
const audit = vi.mocked(recordAuditEvent);
const transaction = vi.mocked(prisma.$transaction);

function tokenFor(
  securityRole: string,
  businessId: string | null,
  userId: string,
) {
  return jwt.sign(
    {
      sub: userId,
    sid: "session-test",
      email: `${userId}@example.com`,
      role: securityRole,
      securityRole,
      businessId,
    },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: "15m" },
  );
}

const OWNER_A = tokenFor(
  "BUSINESS_OWNER",
  "biz-A",
  "user-owner-a",
);

const OWNER_A2 = tokenFor(
  "BUSINESS_OWNER",
  "biz-A",
  "user-owner-a2",
);

const STAFF_A = tokenFor(
  "STAFF",
  "biz-A",
  "user-staff-a",
);

const OWNER_B = tokenFor(
  "BUSINESS_OWNER",
  "biz-B",
  "user-owner-b",
);

const BRANCH_A = "branch-a";
const BRANCH_B = "branch-b";
const PERIOD_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const app = createApp();

const periodBase = {
  id: PERIOD_A,
  businessId: "biz-A",
  branchId: BRANCH_A,
  periodStart: new Date("2026-09-01T00:00:00.000Z"),
  periodEnd: new Date("2026-09-30T23:59:59.999Z"),
  createdAt: new Date("2026-09-01T10:00:00.000Z"),
  updatedAt: new Date("2026-09-01T10:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();

  sensitiveAuthorizationMock.mockResolvedValue({
    id: "sensitive-auth-1",
  });

  businessFindFirst.mockResolvedValue({
    id: "biz-A",
    name: "Test Business",
    isActive: true,
  } as never);

  branchFindFirst.mockResolvedValue({
    id: BRANCH_A,
    businessId: "biz-A",
    isActive: true,
  } as never);

  userBranchFindUnique.mockResolvedValue({
    userId: "user-owner-a",
    branchId: BRANCH_A,
    branch: {
      id: BRANCH_A,
      businessId: "biz-A",
      isActive: true,
    },
  } as never);
});

function mockApprovalTransaction(
  period: Record<string, unknown> | null,
  recordExists = true,
  updateCount = 1,
  updatedPeriod?: Record<string, unknown> | null,
) {
  const tx = {
    payrollPeriod: {
      findFirst: vi.fn()
        .mockResolvedValueOnce(period)
        .mockResolvedValueOnce(updatedPeriod ?? period),
      updateMany: vi.fn().mockResolvedValue({
        count: updateCount,
      }),
    },
    payrollRecord: {
      findFirst: vi.fn().mockResolvedValue(
        recordExists ? { id: "record-a" } : null,
      ),
    },
  };

  transaction.mockImplementation(
    async (callback) => callback(tx as never),
  );

  return tx;
}

describe("Payroll approval routes", () => {
  it("requires authentication for approval submission", async () => {
    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/submit`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(401);
  });

  it("requires sensitive authorization for approval submission", async () => {
    const period = {
      ...periodBase,
      status: "PROCESSING",
      approvalStatus: "NOT_SUBMITTED",
    };

    payrollPeriodFindFirst.mockResolvedValue(period as never);

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/submit`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A);

    expect(res.status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("denies STAFF from submitting payroll for approval", async () => {
    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/submit`)
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("submits processing payroll for approval", async () => {
    const period = {
      ...periodBase,
      status: "PROCESSING",
      approvalStatus: "NOT_SUBMITTED",
      approvalSubmittedAt: null,
      approvalSubmittedById: null,
      approvalDecidedAt: null,
      approvalDecidedById: null,
      approvalReason: null,
    };

    const updatedPeriod = {
      ...period,
      approvalStatus: "PENDING",
      approvalSubmittedAt: new Date("2026-10-08T10:00:00.000Z"),
      approvalSubmittedById: "user-owner-a",
    };

    const tx = mockApprovalTransaction(
      period,
      true,
      1,
      updatedPeriod,
    );

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/submit`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(200);
    expect(res.body.approvalStatus).toBe("PENDING");

    expect(tx.payrollPeriod.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
          status: "PROCESSING",
          approvalStatus: {
            in: ["NOT_SUBMITTED", "DECLINED"],
          },
        }),
        data: expect.objectContaining({
          approvalStatus: "PENDING",
          approvalSubmittedById: "user-owner-a",
        }),
      }),
    );

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payroll_period.submitted_for_approval",
        entityId: PERIOD_A,
      }),
    );
  });

  it("requires payroll.approve for approval decisions", async () => {
    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/approve`)
      .set("Authorization", `Bearer ${STAFF_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("prevents the payroll submitter from approving their own payroll", async () => {
    const period = {
      ...periodBase,
      status: "PROCESSING",
      approvalStatus: "PENDING",
      approvalSubmittedById: "user-owner-a",
    };

    const tx = mockApprovalTransaction(period);

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/approve`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(403);
    expect(tx.payrollPeriod.updateMany).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("allows an independent authorized owner to approve", async () => {
    const period = {
      ...periodBase,
      status: "PROCESSING",
      approvalStatus: "PENDING",
      approvalSubmittedById: "user-owner-a",
    };

    const updatedPeriod = {
      ...period,
      approvalStatus: "APPROVED",
      approvalDecidedById: "user-owner-a2",
      approvalDecidedAt: new Date("2026-10-08T11:00:00.000Z"),
      approvalReason: null,
    };

    const tx = mockApprovalTransaction(
      period,
      true,
      1,
      updatedPeriod,
    );

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/approve`)
      .set("Authorization", `Bearer ${OWNER_A2}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(200);
    expect(res.body.approvalStatus).toBe("APPROVED");

    expect(tx.payrollPeriod.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-A",
          branchId: BRANCH_A,
          status: "PROCESSING",
          approvalStatus: "PENDING",
        }),
        data: expect.objectContaining({
          approvalStatus: "APPROVED",
          approvalDecidedById: "user-owner-a2",
        }),
      }),
    );

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payroll_period.approved",
        entityId: PERIOD_A,
      }),
    );
  });

  it("requires a decline reason", async () => {
    const period = {
      ...periodBase,
      status: "PROCESSING",
      approvalStatus: "PENDING",
      approvalSubmittedById: "user-owner-a",
    };

    mockApprovalTransaction(period);

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/decline`)
      .set("Authorization", `Bearer ${OWNER_A2}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token")
      .send({ reason: "   " });

    expect(res.status).toBe(422);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("allows an independent authorized owner to decline with a reason", async () => {
    const period = {
      ...periodBase,
      status: "PROCESSING",
      approvalStatus: "PENDING",
      approvalSubmittedById: "user-owner-a",
    };

    const updatedPeriod = {
      ...period,
      approvalStatus: "DECLINED",
      approvalDecidedById: "user-owner-a2",
      approvalDecidedAt: new Date("2026-10-08T12:00:00.000Z"),
      approvalReason: "Correct the salary figure before resubmission",
    };

    const tx = mockApprovalTransaction(
      period,
      true,
      1,
      updatedPeriod,
    );

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/decline`)
      .set("Authorization", `Bearer ${OWNER_A2}`)
      .set("X-Branch-Id", BRANCH_A)
      .set("X-Sensitive-Authorization", "test-sensitive-token")
      .send({
        reason: "  Correct the salary figure before resubmission  ",
      });

    expect(res.status).toBe(200);
    expect(res.body.approvalStatus).toBe("DECLINED");
    expect(res.body.approvalReason).toBe(
      "Correct the salary figure before resubmission",
    );

    expect(tx.payrollPeriod.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approvalStatus: "DECLINED",
          approvalReason: "Correct the salary figure before resubmission",
          approvalDecidedById: "user-owner-a2",
        }),
      }),
    );

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payroll_period.declined",
        entityId: PERIOD_A,
        metadata: expect.objectContaining({
          reason: "Correct the salary figure before resubmission",
        }),
      }),
    );
  });

  it("does not expose a payroll approval action across business scope", async () => {
    businessFindFirst.mockResolvedValue({
      id: "biz-B",
      name: "Business B",
      isActive: true,
    } as never);

    branchFindFirst.mockResolvedValue({
      id: BRANCH_B,
      businessId: "biz-B",
      isActive: true,
    } as never);

    userBranchFindUnique.mockResolvedValue({
      userId: "user-owner-b",
      branchId: BRANCH_B,
      branch: {
        id: BRANCH_B,
        businessId: "biz-B",
        isActive: true,
      },
    } as never);

    const tx = mockApprovalTransaction(null);

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/approve`)
      .set("Authorization", `Bearer ${OWNER_B}`)
      .set("X-Branch-Id", BRANCH_B)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(404);
    expect(tx.payrollPeriod.updateMany).not.toHaveBeenCalled();
  });

  it("does not expose an approval action outside the selected branch", async () => {
    userBranchFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/payroll/periods/${PERIOD_A}/approve`)
      .set("Authorization", `Bearer ${OWNER_A}`)
      .set("X-Branch-Id", BRANCH_B)
      .set("X-Sensitive-Authorization", "test-sensitive-token");

    expect(res.status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });
});

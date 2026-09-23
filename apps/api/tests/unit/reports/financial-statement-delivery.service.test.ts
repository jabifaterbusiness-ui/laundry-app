import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    financialStatementConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    financialStatementRecipient: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
  },
  auditMock: {
    recordAuditEvent: vi.fn(),
  },
}));

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../../src/lib/audit.js", () => ({
  recordAuditEvent: auditMock.recordAuditEvent,
}));

vi.mock("../../../src/middleware/error-handler.js", () => ({
  AppError: class AppError extends Error {
    public readonly statusCode: number;
    public readonly isOperational = true;

    constructor(message: string, statusCode = 400) {
      super(message);
      this.name = "AppError";
      this.statusCode = statusCode;
    }
  },
}));

import {
  createFinancialStatementRecipient,
  getFinancialStatementConfig,
  listFinancialStatementRecipients,
  removeFinancialStatementRecipient,
  updateFinancialStatementConfig,
  updateFinancialStatementRecipient,
} from "../../../src/modules/reports/financial-statement-delivery.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getFinancialStatementConfig", () => {
  it("returns locked defaults when configuration has not been created", async () => {
    prismaMock.financialStatementConfig.findUnique.mockResolvedValue(null);

    await expect(
      getFinancialStatementConfig("biz-1"),
    ).resolves.toEqual({
      id: null,
      businessId: "biz-1",
      enabled: true,
      dayOfMonth: 1,
      hour: 8,
      minute: 0,
      emailEnabled: true,
      whatsappEnabled: false,
      dailyEnabled: false,
      dailyHour: 8,
      dailyMinute: 0,
      dailyEmailEnabled: true,
      dailyWhatsappEnabled: false,
      createdAt: null,
      updatedAt: null,
    });
  });

  it("returns persisted configuration", async () => {
    const config = {
      id: "config-1",
      businessId: "biz-1",
      enabled: true,
      dayOfMonth: 5,
      hour: 9,
      minute: 30,
      emailEnabled: true,
      whatsappEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prismaMock.financialStatementConfig.findUnique.mockResolvedValue(config);

    await expect(
      getFinancialStatementConfig("biz-1"),
    ).resolves.toEqual(config);
  });
});

describe("updateFinancialStatementConfig", () => {
  it("upserts configuration and records an audit event", async () => {
    const config = {
      id: "config-1",
      businessId: "biz-1",
      enabled: true,
      dayOfMonth: 1,
      hour: 8,
      minute: 0,
      emailEnabled: true,
      whatsappEnabled: false,
      dailyEnabled: false,
      dailyHour: 8,
      dailyMinute: 0,
      dailyEmailEnabled: true,
      dailyWhatsappEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prismaMock.financialStatementConfig.upsert.mockResolvedValue(config);

    const result = await updateFinancialStatementConfig(
      "biz-1",
      {
        enabled: true,
        dayOfMonth: 1,
        hour: 8,
        minute: 0,
        emailEnabled: true,
        whatsappEnabled: false,
        dailyEnabled: false,
        dailyHour: 8,
        dailyMinute: 0,
        dailyEmailEnabled: true,
        dailyWhatsappEnabled: false,
      },
      "user-1",
      "corr-1",
    );

    expect(result).toEqual(config);
    expect(prismaMock.financialStatementConfig.upsert).toHaveBeenCalled();
    expect(auditMock.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "financial_statement.config.updated",
        businessId: "biz-1",
        actorUserId: "user-1",
      }),
    );
  });
});

describe("financial statement recipients", () => {
  it("lists recipients by business", async () => {
    prismaMock.financialStatementRecipient.findMany.mockResolvedValue([]);

    await expect(
      listFinancialStatementRecipients("biz-1"),
    ).resolves.toEqual([]);

    expect(
      prismaMock.financialStatementRecipient.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: "biz-1" },
      }),
    );
  });

  it("creates a recipient only for an active business user", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-2",
      businessId: "biz-1",
      isActive: true,
    });

    prismaMock.financialStatementRecipient.findUnique.mockResolvedValue(null);

    const recipient = {
      id: "recipient-1",
      businessId: "biz-1",
      userId: "user-2",
      whatsappNumber: "+2348012345678",
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: "user-2",
        email: "manager@example.com",
        fullName: "Manager",
        role: "BRANCH_MANAGER",
        isActive: true,
      },
    };

    prismaMock.financialStatementRecipient.create.mockResolvedValue(recipient);

    await expect(
      createFinancialStatementRecipient(
        "biz-1",
        {
          userId: "user-2",
          whatsappNumber: "+2348012345678",
        },
        "owner-1",
        "corr-1",
      ),
    ).resolves.toEqual(recipient);

    expect(auditMock.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "financial_statement.recipient.created",
        businessId: "biz-1",
      }),
    );
  });

  it("rejects a recipient from another business", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(
      createFinancialStatementRecipient(
        "biz-1",
        { userId: "user-other" },
        "owner-1",
        null,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(
      prismaMock.financialStatementRecipient.create,
    ).not.toHaveBeenCalled();
  });

  it("rejects duplicate recipients", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-2",
      businessId: "biz-1",
      isActive: true,
    });

    prismaMock.financialStatementRecipient.findUnique.mockResolvedValue({
      id: "existing",
    });

    await expect(
      createFinancialStatementRecipient(
        "biz-1",
        { userId: "user-2" },
        "owner-1",
        null,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("updates a recipient within the authenticated business", async () => {
    prismaMock.financialStatementRecipient.findFirst.mockResolvedValue({
      id: "recipient-1",
      userId: "user-2",
      enabled: true,
      whatsappNumber: null,
        user: {
          role: "BRANCH_MANAGER",
          isActive: true,
        },
    });

    const recipient = {
      id: "recipient-1",
      businessId: "biz-1",
      userId: "user-2",
      whatsappNumber: "+2348012345678",
      enabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: "user-2",
        email: "manager@example.com",
        fullName: "Manager",
        role: "BRANCH_MANAGER",
        isActive: true,
      },
    };

    prismaMock.financialStatementRecipient.update.mockResolvedValue(recipient);

    await expect(
      updateFinancialStatementRecipient(
        "biz-1",
        "recipient-1",
        {
          whatsappNumber: "+2348012345678",
          enabled: false,
        },
        "owner-1",
        null,
      ),
    ).resolves.toEqual(recipient);

    expect(auditMock.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "financial_statement.recipient.updated",
        businessId: "biz-1",
      }),
    );
  });

    it("does not allow an active business owner to be disabled", async () => {
      prismaMock.financialStatementRecipient.findFirst.mockResolvedValue({
        id: "owner-recipient-1",
        userId: "owner-1",
        enabled: true,
        whatsappNumber: null,
        user: {
          role: "BUSINESS_OWNER",
          isActive: true,
        },
      });

      await expect(
        updateFinancialStatementRecipient(
          "biz-1",
          "owner-recipient-1",
          { enabled: false },
          "owner-2",
          null,
        ),
      ).rejects.toMatchObject({
        message:
          "An active business owner must remain a financial statement recipient",
        statusCode: 409,
      });

      expect(
        prismaMock.financialStatementRecipient.update,
      ).not.toHaveBeenCalled();
    });

    it("does not allow an active business owner to be removed", async () => {
      prismaMock.financialStatementRecipient.findFirst.mockResolvedValue({
        id: "owner-recipient-1",
        userId: "owner-1",
        user: {
          role: "BUSINESS_OWNER",
          isActive: true,
        },
      });

      await expect(
        removeFinancialStatementRecipient(
          "biz-1",
          "owner-recipient-1",
          "owner-2",
          null,
        ),
      ).rejects.toMatchObject({
        message:
          "An active business owner must remain a financial statement recipient",
        statusCode: 409,
      });

      expect(
        prismaMock.financialStatementRecipient.delete,
      ).not.toHaveBeenCalled();
    });

  it("removes a recipient within the authenticated business", async () => {
    prismaMock.financialStatementRecipient.findFirst.mockResolvedValue({
      id: "recipient-1",
      userId: "user-2",
        user: {
          role: "BRANCH_MANAGER",
          isActive: true,
        },
    });

    prismaMock.financialStatementRecipient.delete.mockResolvedValue({
      id: "recipient-1",
    });

    await expect(
      removeFinancialStatementRecipient(
        "biz-1",
        "recipient-1",
        "owner-1",
        null,
      ),
    ).resolves.toEqual({ removed: true });

    expect(prismaMock.financialStatementRecipient.delete).toHaveBeenCalledWith({
      where: { id: "recipient-1" },
    });
  });
});

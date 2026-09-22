import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock, loggerMock, generationMock, emailMock, whatsappMock, templateMock } =
  vi.hoisted(() => ({
    prismaMock: {
      business: {
        findMany: vi.fn(),
      },
      user: {
        findMany: vi.fn(),
      },
      financialStatementRecipient: {
        upsert: vi.fn(),
        findMany: vi.fn(),
      },
      financialStatementDelivery: {
        upsert: vi.fn(),
        update: vi.fn(),
      },
    },
    auditMock: {
      recordAuditEvent: vi.fn(),
    },
    loggerMock: {
      error: vi.fn(),
      info: vi.fn(),
    },
    generationMock: {
      generateBusinessFinancialStatement: vi.fn(),
    },
    emailMock: {
      sendHtmlEmail: vi.fn(),
    },
    whatsappMock: {
      sendWhatsAppReceipt: vi.fn(),
    },
    templateMock: {
      renderFinancialStatementEmail: vi.fn(),
      renderFinancialStatementImage: vi.fn(),
    },
  }));

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../../src/lib/audit.js", () => ({
  recordAuditEvent: auditMock.recordAuditEvent,
}));

vi.mock("../../../src/lib/logger.js", () => ({
  logger: loggerMock,
}));

vi.mock(
  "../../../src/modules/reports/business-financial-statement.persistence.service.js",
  () => generationMock,
);

vi.mock(
  "../../../src/modules/invoices/providers/resend.provider.js",
  () => emailMock,
);

vi.mock(
  "../../../src/modules/invoices/providers/whatsapp.provider.js",
  () => whatsappMock,
);

vi.mock(
  "../../../src/modules/reports/templates/financial-statement-email.js",
  () => templateMock,
);

vi.mock(
  "../../../src/modules/reports/templates/financial-statement-image.js",
  () => templateMock,
);

import {
  processMonthlyFinancialStatements,
  startFinancialStatementScheduler,
  stopFinancialStatementScheduler,
} from "../../../src/modules/reports/financial-statement-scheduler.service.js";

describe("financial statement scheduler", () => {
  const now = new Date("2026-09-01T07:59:00.000Z");

  const business = {
    id: "business-1",
    name: "Laundry Angel",
    timezone: "Africa/Lagos",
    currencyCode: "NGN",
    financialStatementConfig: null,
  };

  const statement = {
    id: "statement-1",
  };

  const report = {
    period: {
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-09-01T00:00:00.000Z"),
    },
    revenue: {
      grossInvoiced: 100000,
      refunds: 5000,
      netRevenue: 95000,
    },
    expenses: {
      explicit: 20000,
      salary: 30000,
      total: 50000,
      byCategory: {
        RENT: 10000,
        UTILITIES: 10000,
        SALARY: 30000,
      },
    },
    profitOrLoss: {
      amount: 45000,
      type: "PROFIT",
    },
    branchSummary: {},
    detail: {
      invoices: [],
      refunds: [],
      recognizedExpenses: [],
      finalizedPayroll: [],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.business.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.financialStatementRecipient.upsert.mockResolvedValue({
      id: "recipient-1",
    });
    prismaMock.financialStatementRecipient.findMany.mockResolvedValue([]);
    prismaMock.financialStatementDelivery.upsert.mockResolvedValue({
      id: "delivery-1",
      status: "PENDING",
      attemptCount: 0,
      lastAttemptAt: null,
    });
    prismaMock.financialStatementDelivery.update.mockResolvedValue({});
    auditMock.recordAuditEvent.mockResolvedValue(undefined);
    generationMock.generateBusinessFinancialStatement.mockResolvedValue({
      statement,
      report,
    });
    emailMock.sendHtmlEmail.mockResolvedValue({ id: "email-1" });
    whatsappMock.sendWhatsAppReceipt.mockResolvedValue({ id: "whatsapp-1" });
    templateMock.renderFinancialStatementEmail.mockReturnValue("<html>statement</html>");
    templateMock.renderFinancialStatementImage.mockResolvedValue(
      Buffer.from("statement"),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    stopFinancialStatementScheduler();
  });

  it("scans all active businesses", async () => {
    prismaMock.business.findMany.mockResolvedValue([
      business,
      {
        ...business,
        id: "business-2",
        name: "Second Laundry",
      },
    ]);

    const result = await processMonthlyFinancialStatements(
      new Date("2026-09-01T08:00:00.000Z"),
    );

    expect(result).toEqual({
      businessesScanned: 2,
    });

    expect(prismaMock.business.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
      },
      select: expect.any(Object),
    });
  });

  it("uses the default schedule when configuration is missing", async () => {
    prismaMock.business.findMany.mockResolvedValue([business]);

    await processMonthlyFinancialStatements(
      new Date("2026-09-01T08:00:00.000Z"),
    );

    expect(
      generationMock.generateBusinessFinancialStatement,
    ).toHaveBeenCalledTimes(1);

    const call =
      generationMock.generateBusinessFinancialStatement.mock.calls[0]![0];

    expect(call.businessId).toBe("business-1");
    expect(call.from).toEqual(new Date("2026-07-31T23:00:00.000Z"));
    expect(call.to).toEqual(new Date("2026-08-31T23:00:00.000Z"));
  });

  it("does not process before the configured schedule", async () => {
    prismaMock.business.findMany.mockResolvedValue([
      {
        ...business,
        financialStatementConfig: {
          id: "config-1",
          businessId: "business-1",
          enabled: true,
          dayOfMonth: 5,
          hour: 8,
          minute: 0,
          emailEnabled: true,
          whatsappEnabled: false,
        },
      },
    ]);

    await processMonthlyFinancialStatements(
      new Date("2026-09-05T06:59:00.000Z"),
    );

    expect(
      generationMock.generateBusinessFinancialStatement,
    ).not.toHaveBeenCalled();
  });

  it("does not process a disabled configuration", async () => {
    prismaMock.business.findMany.mockResolvedValue([
      {
        ...business,
        financialStatementConfig: {
          id: "config-1",
          businessId: "business-1",
          enabled: false,
          dayOfMonth: 1,
          hour: 8,
          minute: 0,
          emailEnabled: true,
          whatsappEnabled: false,
        },
      },
    ]);

    await processMonthlyFinancialStatements(
      new Date("2026-09-01T08:00:00.000Z"),
    );

    expect(
      generationMock.generateBusinessFinancialStatement,
    ).not.toHaveBeenCalled();
  });

  it("ensures active business owners remain recipients", async () => {
    prismaMock.business.findMany.mockResolvedValue([business]);
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: "owner-1",
        email: "owner@example.com",
        fullName: "Owner",
      },
      {
        id: "owner-2",
        email: "owner2@example.com",
        fullName: "Owner Two",
      },
    ]);

    await processMonthlyFinancialStatements(
      new Date("2026-09-01T08:00:00.000Z"),
    );

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        role: "BUSINESS_OWNER",
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
      },
    });

    expect(
      prismaMock.financialStatementRecipient.upsert,
    ).toHaveBeenCalledTimes(2);
  });

  it("delivers email when email delivery is enabled", async () => {
    prismaMock.business.findMany.mockResolvedValue([business]);

    prismaMock.financialStatementRecipient.findMany.mockResolvedValue([
      {
        id: "recipient-1",
        whatsappNumber: null,
        user: {
          id: "owner-1",
          email: "owner@example.com",
          fullName: "Owner",
          role: "BUSINESS_OWNER",
          isActive: true,
        },
      },
    ]);

    await processMonthlyFinancialStatements(
      new Date("2026-09-01T08:00:00.000Z"),
    );

    expect(emailMock.sendHtmlEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        subject:
          "Laundry Angel — Monthly Financial Statement — August 2026",
        html: "<html>statement</html>",
      }),
    );

    expect(whatsappMock.sendWhatsAppReceipt).not.toHaveBeenCalled();

    expect(
      prismaMock.financialStatementDelivery.update,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "delivery-1" },
        data: expect.objectContaining({
          status: "SENT",
          providerMessageId: "email-1",
        }),
      }),
    );
  });

  it("delivers WhatsApp when WhatsApp delivery is enabled", async () => {
    prismaMock.business.findMany.mockResolvedValue([
      {
        ...business,
        financialStatementConfig: {
          id: "config-1",
          businessId: "business-1",
          enabled: true,
          dayOfMonth: 1,
          hour: 8,
          minute: 0,
          emailEnabled: false,
          whatsappEnabled: true,
        },
      },
    ]);

    prismaMock.financialStatementRecipient.findMany.mockResolvedValue([
      {
        id: "recipient-1",
        whatsappNumber: "+2348012345678",
        user: {
          id: "owner-1",
          email: "owner@example.com",
          fullName: "Owner",
          role: "BUSINESS_OWNER",
          isActive: true,
        },
      },
    ]);

    await processMonthlyFinancialStatements(
      new Date("2026-09-01T08:00:00.000Z"),
    );

    expect(emailMock.sendHtmlEmail).not.toHaveBeenCalled();

    expect(whatsappMock.sendWhatsAppReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+2348012345678",
        image: expect.any(Buffer),
        caption:
          "Laundry Angel — Monthly Financial Statement — August 2026",
      }),
    );
  });

  it("does not resend a delivery already marked SENT", async () => {
    prismaMock.business.findMany.mockResolvedValue([business]);

    prismaMock.financialStatementRecipient.findMany.mockResolvedValue([
      {
        id: "recipient-1",
        whatsappNumber: null,
        user: {
          id: "owner-1",
          email: "owner@example.com",
          fullName: "Owner",
          role: "BUSINESS_OWNER",
          isActive: true,
        },
      },
    ]);

    prismaMock.financialStatementDelivery.upsert.mockResolvedValue({
      id: "delivery-1",
      status: "SENT",
      attemptCount: 1,
      lastAttemptAt: new Date("2026-09-01T08:00:00.000Z"),
    });

    await processMonthlyFinancialStatements(
      new Date("2026-09-01T08:30:00.000Z"),
    );

    expect(emailMock.sendHtmlEmail).not.toHaveBeenCalled();
  });

  it("does not retry a failed delivery before 15 minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T08:10:00.000Z"));

    prismaMock.business.findMany.mockResolvedValue([business]);

    prismaMock.financialStatementRecipient.findMany.mockResolvedValue([
      {
        id: "recipient-1",
        whatsappNumber: null,
        user: {
          id: "owner-1",
          email: "owner@example.com",
          fullName: "Owner",
          role: "BUSINESS_OWNER",
          isActive: true,
        },
      },
    ]);

    prismaMock.financialStatementDelivery.upsert.mockResolvedValue({
      id: "delivery-1",
      status: "FAILED",
      attemptCount: 1,
      lastAttemptAt: new Date("2026-09-01T08:00:00.000Z"),
    });

    await processMonthlyFinancialStatements(
      new Date("2026-09-01T08:10:00.000Z"),
    );

    expect(emailMock.sendHtmlEmail).not.toHaveBeenCalled();
  });

  it("does not retry after five failed attempts", async () => {
    prismaMock.business.findMany.mockResolvedValue([business]);

    prismaMock.financialStatementRecipient.findMany.mockResolvedValue([
      {
        id: "recipient-1",
        whatsappNumber: null,
        user: {
          id: "owner-1",
          email: "owner@example.com",
          fullName: "Owner",
          role: "BUSINESS_OWNER",
          isActive: true,
        },
      },
    ]);

    prismaMock.financialStatementDelivery.upsert.mockResolvedValue({
      id: "delivery-1",
      status: "FAILED",
      attemptCount: 5,
      lastAttemptAt: new Date("2026-08-01T08:00:00.000Z"),
    });

    await processMonthlyFinancialStatements(
      new Date("2026-09-01T08:00:00.000Z"),
    );

    expect(emailMock.sendHtmlEmail).not.toHaveBeenCalled();
  });

  it("records a failed delivery when the email provider throws", async () => {
    prismaMock.business.findMany.mockResolvedValue([business]);

    prismaMock.financialStatementRecipient.findMany.mockResolvedValue([
      {
        id: "recipient-1",
        whatsappNumber: null,
        user: {
          id: "owner-1",
          email: "owner@example.com",
          fullName: "Owner",
          role: "BUSINESS_OWNER",
          isActive: true,
        },
      },
    ]);

    emailMock.sendHtmlEmail.mockRejectedValue(
      new Error("Resend unavailable"),
    );

    await processMonthlyFinancialStatements(
      new Date("2026-09-01T08:00:00.000Z"),
    );

    expect(
      prismaMock.financialStatementDelivery.update,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "delivery-1" },
        data: expect.objectContaining({
          status: "FAILED",
          failureReason: "Resend unavailable",
        }),
      }),
    );

    expect(loggerMock.error).toHaveBeenCalled();
  });

  it("records the monthly processing audit event", async () => {
    prismaMock.business.findMany.mockResolvedValue([business]);

    await processMonthlyFinancialStatements(
      new Date("2026-09-01T08:00:00.000Z"),
    );

    expect(auditMock.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "financial_statement.monthly.processed",
        entityType: "FinancialStatement",
        entityId: "statement-1",
        businessId: "business-1",
        actorUserId: null,
        correlationId: null,
      }),
    );
  });

  it("starts only one scheduler timer", () => {
    vi.useFakeTimers();

    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    startFinancialStatementScheduler();
    startFinancialStatementScheduler();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    stopFinancialStatementScheduler();

    setIntervalSpy.mockRestore();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    business: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    branch: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    userBranch: { findMany: vi.fn() },
    customer: { findMany: vi.fn() },
    customerStatusHistory: { findMany: vi.fn() },
    service: { findMany: vi.fn() },
    color: { findMany: vi.fn() },
    orderNumberSequence: { findUnique: vi.fn() },
    order: { findMany: vi.fn() },
    orderItem: { findMany: vi.fn() },
    garment: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
    invoiceItem: { findMany: vi.fn() },
    invoiceHistory: { findMany: vi.fn() },
    payment: { findMany: vi.fn() },
    inventoryItem: { findMany: vi.fn() },
    inventoryStock: { findMany: vi.fn() },
    inventoryMovement: { findMany: vi.fn() },
    expense: { findMany: vi.fn() },
    employeeCompensation: { findMany: vi.fn() },
    payrollPeriod: { findMany: vi.fn() },
    payrollRecord: { findMany: vi.fn() },
    payrollDeduction: { findMany: vi.fn() },
    payrollPayment: { findMany: vi.fn() },
    iOU: { findMany: vi.fn() },
    loan: { findMany: vi.fn() },
    financialRepayment: { findMany: vi.fn() },
    businessRolePermission: { findMany: vi.fn() },
    userPermissionOverride: { findMany: vi.fn() },
    financialStatementConfig: { findUnique: vi.fn() },
    financialStatementRecipient: { findMany: vi.fn() },
    financialStatement: { findMany: vi.fn() },
    financialStatementDelivery: { findMany: vi.fn() },
    permission: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  audit: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({ prisma: mocks.prisma }));
vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: mocks.audit,
}));

import {
  __backupTestHooks,
  exportBusinessBackup,
  restoreBusinessBackup,
} from "../../src/modules/migrations/backup.service.js";

const password = "strong-backup-password";
const businessId = "business-a";
const userId = "owner-a";

function emptyExportMocks() {
  mocks.prisma.business.findUnique.mockResolvedValue({
    id: businessId,
    name: "Laundry A",
    slug: "laundry-a",
    isActive: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
  });

  const many = [
    "branch",
    "user",
    "userBranch",
    "customer",
    "customerStatusHistory",
    "service",
    "color",
    "order",
    "orderItem",
    "garment",
    "invoice",
    "invoiceItem",
    "invoiceHistory",
    "payment",
    "inventoryItem",
    "inventoryStock",
    "inventoryMovement",
    "expense",
    "employeeCompensation",
    "payrollPeriod",
    "payrollRecord",
    "payrollDeduction",
    "payrollPayment",
    "iOU",
    "loan",
    "financialRepayment",
    "businessRolePermission",
    "userPermissionOverride",
    "financialStatementRecipient",
    "financialStatement",
    "financialStatementDelivery",
  ] as const;

  for (const model of many) {
    mocks.prisma[model].findMany.mockResolvedValue([]);
  }

  mocks.prisma.orderNumberSequence.findUnique.mockResolvedValue(null);
  mocks.prisma.financialStatementConfig.findUnique.mockResolvedValue(null);
  mocks.prisma.permission.findMany.mockResolvedValue([]);
  mocks.audit.mockResolvedValue(undefined);
}

describe("#20 backup service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emptyExportMocks();
  });

  it("round-trips encrypted v2 payloads", () => {
    const payload = {
      format: "laundry-business-backup" as const,
      version: 2 as const,
      exportedAt: new Date().toISOString(),
      business: { id: businessId, name: "Laundry A" },
      branches: [],
      users: [],
      userBranches: [],
      customers: [],
      customerStatusHistory: [],
      services: [],
      colors: [],
      orderNumberSequence: null,
      orders: [],
      orderItems: [],
      garments: [],
      invoices: [],
      invoiceItems: [],
      invoiceHistory: [],
      payments: [],
      inventoryItems: [],
      inventoryStock: [],
      inventoryMovements: [],
      expenses: [],
      employeeCompensation: [],
      payrollPeriods: [],
      payrollRecords: [],
      payrollDeductions: [],
      payrollPayments: [],
      ious: [],
      loans: [],
      financialRepayments: [],
      businessRolePermissions: [],
      userPermissionOverrides: [],
      financialStatementConfig: null,
      financialStatementRecipients: [
        {
          id: "recipient-backup",
          businessId,
          userId: "user-1",
          whatsappNumber: "+2348000000000",
          enabled: true,
        },
      ],
      financialStatements: [
        {
          id: "statement-1",
          businessId,
          year: 2026,
          month: 9,
        },
      ],
      financialStatementDeliveries: [
        {
          id: "delivery-1",
          statementId: "statement-1",
          recipientId: "recipient-backup",
          channel: "EMAIL",
          status: "PENDING",
          destination: "owner@example.com",
          attemptCount: 0,
        },
      ],
    };

    const encrypted = __backupTestHooks.encrypt(payload, password);
    expect(__backupTestHooks.decrypt(encrypted, password)).toEqual(payload);
  });

  it("rejects the wrong password", () => {
    const encrypted = __backupTestHooks.encrypt(
      {
        format: "laundry-business-backup",
        version: 2,
        exportedAt: new Date().toISOString(),
        business: { id: businessId },
        branches: [],
        users: [],
        userBranches: [],
        customers: [],
        customerStatusHistory: [],
        services: [],
        colors: [],
        orderNumberSequence: null,
        orders: [],
        orderItems: [],
        garments: [],
        invoices: [],
        invoiceItems: [],
        invoiceHistory: [],
        payments: [],
        inventoryItems: [],
        inventoryStock: [],
        inventoryMovements: [],
        expenses: [],
        employeeCompensation: [],
        payrollPeriods: [],
        payrollRecords: [],
        payrollDeductions: [],
        payrollPayments: [],
        ious: [],
        loans: [],
        financialRepayments: [],
        businessRolePermissions: [],
        userPermissionOverrides: [],
        financialStatementConfig: null,
        financialStatementRecipients: [],
        financialStatements: [],
        financialStatementDeliveries: [],
      },
      password,
    );

    expect(() => __backupTestHooks.decrypt(encrypted, "another-password")).toThrow(
      /incorrect|corrupted/i,
    );
  });

  it("rejects corrupted backup data", () => {
    const encrypted = Buffer.from("LAUNDRYBK");
    expect(() => __backupTestHooks.decrypt(encrypted, password)).toThrow();
  });

  it("rejects version 1 instead of accepting it as v2", () => {
    const encrypted = __backupTestHooks.encrypt(
      {
        format: "laundry-business-backup",
        version: 2,
        exportedAt: new Date().toISOString(),
        business: { id: businessId },
        branches: [],
        users: [],
        userBranches: [],
        customers: [],
        customerStatusHistory: [],
        services: [],
        colors: [],
        orderNumberSequence: null,
        orders: [],
        orderItems: [],
        garments: [],
        invoices: [],
        invoiceItems: [],
        invoiceHistory: [],
        payments: [],
        inventoryItems: [],
        inventoryStock: [],
        inventoryMovements: [],
        expenses: [],
        employeeCompensation: [],
        payrollPeriods: [],
        payrollRecords: [],
        payrollDeductions: [],
        payrollPayments: [],
        ious: [],
        loans: [],
        financialRepayments: [],
        businessRolePermissions: [],
        userPermissionOverrides: [],
        financialStatementConfig: null,
        financialStatementRecipients: [],
        financialStatements: [],
        financialStatementDeliveries: [],
      },
      password,
    );

    const versionOffset = Buffer.from("LAUNDRYBK").length;
    encrypted[versionOffset] = 1;

    expect(() => __backupTestHooks.decrypt(encrypted, password)).toThrow();
  });

  it("exports v2 and excludes password/security credentials", async () => {
    mocks.prisma.user.findMany.mockResolvedValue([
      {
        id: "user-1",
        email: "owner@example.com",
        username: "owner",
        fullName: "Owner",
        role: "Manager",
        securityRole: "BUSINESS_OWNER",
        passwordHash: "SECRET",
        isActive: true,
        deletedAt: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-02"),
      },
    ]);

    const backup = await exportBusinessBackup(
      businessId,
      userId,
      password,
      "scheduled backup",
    );

    const payload = __backupTestHooks.decrypt(backup, password);

    expect(payload.version).toBe(2);
    expect(payload.users[0]).not.toHaveProperty("passwordHash");
    expect(payload.users[0]).not.toHaveProperty("securityRole");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "backup.exported",
        metadata: expect.objectContaining({ version: 2 }),
      }),
    );
  });

  it("restores a v2 backup transactionally with mapped dependencies and preserves user security", async () => {
    const tx = {
      business: {
        findUnique: vi.fn().mockResolvedValue({
          id: businessId,
          name: "Laundry A",
          slug: "laundry-a",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      branch: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "user-1",
            email: "owner@example.com",
            passwordHash: "UNCHANGED_SECRET",
            securityRole: "BUSINESS_OWNER",
          },
        ]),
        update: vi.fn(),
        create: vi.fn(),
      },
      userBranch: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      customer: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      customerStatusHistory: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      service: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      color: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      orderNumberSequence: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      order: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      orderItem: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      garment: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      invoice: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      invoiceItem: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      invoiceHistory: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      payment: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      inventoryItem: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      inventoryStock: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      inventoryMovement: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      expense: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
      employeeCompensation: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
      payrollPeriod: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
      payrollRecord: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
      payrollDeduction: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
      payrollPayment: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
      iOU: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
      loan: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
      financialRepayment: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
      permission: {
        findMany: vi.fn().mockResolvedValue([
          { id: "perm-view", code: "orders.view" },
        ]),
      },
      businessRolePermission: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      userPermissionOverride: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      financialStatementConfig: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      financialStatementRecipient: {
        findUnique: vi.fn().mockResolvedValue({
          id: "recipient-existing",
          businessId,
          userId: "user-1",
        }),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      financialStatement: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      financialStatementDelivery: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const payload = {
      format: "laundry-business-backup" as const,
      version: 2 as const,
      exportedAt: new Date().toISOString(),
      business: {
        id: businessId,
        name: "Laundry A Restored",
        slug: "should-not-change",
      },
      branches: [
        {
          id: "branch-1",
          businessId,
          name: "Main Branch",
        },
      ],
      users: [
        {
          id: "user-1",
          email: "owner@example.com",
          fullName: "Owner",
          passwordHash: "MUST_NOT_BE_RESTORED",
          securityRole: "MUST_NOT_BE_RESTORED",
        },
        {
          id: "missing-user",
          email: "missing@example.com",
          fullName: "Missing User",
        },
      ],
      userBranches: [
        {
          id: "ub-1",
          userId: "user-1",
          branchId: "branch-1",
          createdAt: new Date().toISOString(),
        },
      ],
      customers: [
        {
          id: "customer-1",
          businessId,
          name: "Customer One",
        },
      ],
      customerStatusHistory: [],
      services: [
        {
          id: "service-1",
          businessId,
          name: "Wash",
        },
      ],
      colors: [],
      orderNumberSequence: null,
      orders: [
        {
          id: "order-1",
          businessId,
          branchId: "branch-1",
          customerId: "customer-1",
          orderNumber: "000001",
          status: "RECEIVED",
        },
      ],
      orderItems: [
        {
          id: "item-1",
          orderId: "order-1",
          serviceId: "service-1",
          quantity: 1,
        },
      ],
      garments: [
        {
          id: "garment-1",
          businessId,
          branchId: "branch-1",
          orderId: "order-1",
          orderItemId: "item-1",
          name: "Shirt",
        },
      ],
      invoices: [],
      invoiceItems: [],
      invoiceHistory: [],
      payments: [],
      inventoryItems: [],
      inventoryStock: [],
      inventoryMovements: [],
      expenses: [],
      employeeCompensation: [],
      payrollPeriods: [],
      payrollRecords: [],
      payrollDeductions: [],
      payrollPayments: [],
      ious: [],
      loans: [],
      financialRepayments: [],
      businessRolePermissions: [
        {
          id: "brp-1",
          businessId,
          role: "Manager",
          permissionCode: "orders.view",
        },
      ],
      userPermissionOverrides: [],
      financialStatementConfig: null,
      financialStatementRecipients: [
          {
            id: "recipient-backup",
            businessId,
            userId: "user-1",
            whatsappNumber: "+2348000000000",
            enabled: true,
          },
        ],
        financialStatements: [
          {
            id: "statement-1",
            businessId,
            year: 2026,
            month: 9,
          },
        ],
        financialStatementDeliveries: [
          {
            id: "delivery-1",
            statementId: "statement-1",
            recipientId: "recipient-backup",
            channel: "EMAIL",
            status: "PENDING",
            destination: "owner@example.com",
            attemptCount: 0,
          },
        ],
    };

    const encrypted = __backupTestHooks.encrypt(payload, password);

    const result = await restoreBusinessBackup(
      businessId,
      userId,
      encrypted,
      password,
      "restore functional test",
    );

    expect(result.created).toBeGreaterThan(0);
    expect(result.skippedUsers).toBe(1);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);

    expect(tx.userBranch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "ub-1",
        userId: "user-1",
        branchId: "branch-1",
      }),
    });

    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "order-1",
        businessId,
        branchId: "branch-1",
        customerId: "customer-1",
      }),
    });

    expect(tx.financialStatementRecipient.update).toHaveBeenCalledWith({
      where: { id: "recipient-existing" },
      data: expect.objectContaining({
        businessId,
        userId: "user-1",
      }),
    });

    expect(tx.financialStatementDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "delivery-1",
        statementId: "statement-1",
        recipientId: "recipient-existing",
      }),
    });

    expect(tx.orderItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "item-1",
        orderId: "order-1",
        serviceId: "service-1",
      }),
    });

    expect(tx.garment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "garment-1",
        businessId,
        branchId: "branch-1",
        orderId: "order-1",
        orderItemId: "item-1",
      }),
    });

    expect(tx.businessRolePermission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "brp-1",
        businessId,
        permissionId: "perm-view",
      }),
    });

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();

    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "backup.restored",
        businessId,
        actorUserId: userId,
        metadata: expect.objectContaining({
          version: 2,
          reason: "restore functional test",
        }),
      }),
    );
  });

  it("rejects a cross-business restore before opening a transaction", async () => {
    const payload = {
      format: "laundry-business-backup" as const,
      version: 2 as const,
      exportedAt: new Date().toISOString(),
      business: { id: "other-business", name: "Other" },
      branches: [],
      users: [],
      userBranches: [],
      customers: [],
      customerStatusHistory: [],
      services: [],
      colors: [],
      orderNumberSequence: null,
      orders: [],
      orderItems: [],
      garments: [],
      invoices: [],
      invoiceItems: [],
      invoiceHistory: [],
      payments: [],
      inventoryItems: [],
      inventoryStock: [],
      inventoryMovements: [],
      expenses: [],
      employeeCompensation: [],
      payrollPeriods: [],
      payrollRecords: [],
      payrollDeductions: [],
      payrollPayments: [],
      ious: [],
      loans: [],
      financialRepayments: [],
      businessRolePermissions: [],
      userPermissionOverrides: [],
      financialStatementConfig: null,
      financialStatementRecipients: [],
      financialStatements: [],
      financialStatementDeliveries: [],
    };

    const encrypted = __backupTestHooks.encrypt(payload, password);

    await expect(
      restoreBusinessBackup(
        businessId,
        userId,
        encrypted,
        password,
        "restore test",
      ),
    ).rejects.toThrow(/different business/i);

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});

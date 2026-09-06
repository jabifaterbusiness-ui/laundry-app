import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  hasPermissionMock,
  recordAuditEventMock,
  transferOrderMock,
  voidPaymentMock,
  createInventoryMovementMock,
} = vi.hoisted(() => ({
  hasPermissionMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  transferOrderMock: vi.fn(),
  voidPaymentMock: vi.fn(),
  createInventoryMovementMock: vi.fn(),
}));

vi.mock("../../src/modules/permissions/permissions.service.js", () => ({
  hasPermission: hasPermissionMock,
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("../../src/modules/orders/orders.service.js", () => ({
  transferOrder: transferOrderMock,
}));

vi.mock("../../src/modules/payments/payments.service.js", () => ({
  voidPayment: voidPaymentMock,
}));

vi.mock("../../src/modules/inventory/inventory.service.js", () => ({
  createInventoryMovement: createInventoryMovementMock,
}));

import { executeQuickOperation } from "../../src/modules/quick-operations/quick-operations.service.js";

const CONTEXT = {
  userId: "user-A",
  role: "BUSINESS_OWNER" as const,
  businessId: "biz-A",
  branchId: "branch-A",
  correlationId: "corr-123",
};

beforeEach(() => {
  vi.clearAllMocks();
  hasPermissionMock.mockResolvedValue(true);
  recordAuditEventMock.mockResolvedValue(undefined);
});

describe("quick-operations.service", () => {
  describe("permission enforcement", () => {
    it("rejects an operation when the user lacks its catalog permission", async () => {
      hasPermissionMock.mockResolvedValue(false);

      await expect(
        executeQuickOperation(
          CONTEXT,
          "VO",
          {
            paymentId: "33333333-3333-4333-8333-333333333333",
            confirmed: true,
          },
        ),
      ).rejects.toMatchObject({
        message: "Insufficient permissions for this quick operation",
        statusCode: 403,
      });

      expect(hasPermissionMock).toHaveBeenCalledWith(
        "user-A",
        "biz-A",
        "BUSINESS_OWNER",
        "payments.manage",
      );
      expect(voidPaymentMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("rejects an unknown quick operation", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "UNKNOWN",
          {},
        ),
      ).rejects.toMatchObject({
        message: "Unknown quick operation",
        statusCode: 400,
      });

      expect(hasPermissionMock).not.toHaveBeenCalled();
    });
  });

  describe("confirmation enforcement", () => {
    it("rejects a sensitive operation without confirmation", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "VO",
          {
            paymentId: "33333333-3333-4333-8333-333333333333",
          },
        ),
      ).rejects.toMatchObject({
        message: "Confirmation is required for this quick operation",
        statusCode: 422,
      });

      expect(voidPaymentMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("allows a sensitive operation when explicitly confirmed", async () => {
      const result = {
        id: "33333333-3333-4333-8333-333333333333",
        invoiceId: "44444444-4444-4444-8444-444444444444",
        amount: 5000,
        method: "TRANSFER",
        status: "VOID",
      };

      voidPaymentMock.mockResolvedValue(result);

      const response = await executeQuickOperation(
        CONTEXT,
        "VO",
        {
          paymentId: "33333333-3333-4333-8333-333333333333",
        },
        true,
      );

      expect(voidPaymentMock).toHaveBeenCalledWith(
        "33333333-3333-4333-8333-333333333333",
        "biz-A",
        "branch-A",
      );

      expect(response).toEqual({
        code: "VO",
        result,
      });
    });
  });

  describe("TI - Transfer Invoice", () => {
    it("transfers the order customer within the authenticated business and branch", async () => {
      const result = {
        id: "11111111-1111-4111-8111-111111111111",
        orderNumber: "00042",
        customerId: "22222222-2222-4222-8222-222222222222",
      };

      transferOrderMock.mockResolvedValue(result);

      const response = await executeQuickOperation(
        CONTEXT,
        "TI",
        {
          orderId: "11111111-1111-4111-8111-111111111111",
          customerId: "22222222-2222-4222-8222-222222222222",
        },
        true,
      );

      expect(transferOrderMock).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "biz-A",
        "branch-A",
        "22222222-2222-4222-8222-222222222222",
      );

      expect(response).toEqual({
        code: "TI",
        result,
      });

      expect(recordAuditEventMock).toHaveBeenCalledWith({
        action: "quick_operation.executed",
        entityType: "Order",
        entityId: "11111111-1111-4111-8111-111111111111",
        businessId: "biz-A",
        branchId: "branch-A",
        actorUserId: "user-A",
        correlationId: "corr-123",
        metadata: {
          operationCode: "TI",
          operationName: "Transfer Invoice",
          orderNumber: "00042",
          customerId: "22222222-2222-4222-8222-222222222222",
        },
      });
    });
  });

  describe("VO - Void Operation", () => {
    it("voids a payment within the authenticated business and branch", async () => {
      const result = {
        id: "33333333-3333-4333-8333-333333333333",
        invoiceId: "44444444-4444-4444-8444-444444444444",
        amount: 5000,
        method: "TRANSFER",
        status: "VOID",
      };

      voidPaymentMock.mockResolvedValue(result);

      const response = await executeQuickOperation(
        CONTEXT,
        "VO",
        {
          paymentId: "33333333-3333-4333-8333-333333333333",
        },
        true,
      );

      expect(voidPaymentMock).toHaveBeenCalledWith(
        "33333333-3333-4333-8333-333333333333",
        "biz-A",
        "branch-A",
      );

      expect(response).toEqual({
        code: "VO",
        result,
      });

      expect(recordAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "quick_operation.executed",
          entityType: "Payment",
          entityId: "33333333-3333-4333-8333-333333333333",
          businessId: "biz-A",
          branchId: "branch-A",
          metadata: expect.objectContaining({
            operationCode: "VO",
            invoiceId: "44444444-4444-4444-8444-444444444444",
            amount: 5000,
            method: "TRANSFER",
            status: "VOID",
          }),
        }),
      );
    });
  });

  describe("SI - Stock Issue", () => {
    it("records an ISSUE against the authenticated branch", async () => {
      const result = {
        movement: {
          id: "66666666-6666-4666-8666-666666666666",
          type: "ISSUE",
          quantity: 3,
          resultingQuantity: 7,
        },
        stock: {
          id: "77777777-7777-4777-8777-777777777777",
          quantity: 7,
        },
        inventoryItem: {
          id: "55555555-5555-4555-8555-555555555555",
        },
      };

      createInventoryMovementMock.mockResolvedValue(result);

      const response = await executeQuickOperation(
        CONTEXT,
        "SI",
        {
          inventoryItemId: "55555555-5555-4555-8555-555555555555",
          quantity: 3,
          reason: "Damaged supplies",
          reference: "ISSUE-001",
        },
        true,
      );

      expect(createInventoryMovementMock).toHaveBeenCalledWith(
        {
          businessId: "biz-A",
          branchId: "branch-A",
        },
        {
          inventoryItemId: "55555555-5555-4555-8555-555555555555",
          quantity: 3,
          type: "ISSUE",
          createdById: "user-A",
          reason: "Damaged supplies",
          reference: "ISSUE-001",
        },
      );

      expect(response).toEqual({
        code: "SI",
        result,
      });

      expect(recordAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "quick_operation.executed",
          entityType: "InventoryMovement",
          entityId: "66666666-6666-4666-8666-666666666666",
          businessId: "biz-A",
          branchId: "branch-A",
          actorUserId: "user-A",
          metadata: expect.objectContaining({
            operationCode: "SI",
            type: "ISSUE",
            quantity: 3,
            resultingQuantity: 7,
          }),
        }),
      );
    });
  });

  describe("SR - Stock Receipt", () => {
    it("records a RECEIPT against the authenticated branch", async () => {
      const result = {
        movement: {
          id: "99999999-9999-4999-8999-999999999999",
          type: "RECEIPT",
          quantity: 10,
          resultingQuantity: 20,
        },
        stock: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          quantity: 20,
        },
        inventoryItem: {
          id: "88888888-8888-4888-8888-888888888888",
        },
      };

      createInventoryMovementMock.mockResolvedValue(result);

      const response = await executeQuickOperation(
        CONTEXT,
        "SR",
        {
          inventoryItemId: "88888888-8888-4888-8888-888888888888",
          quantity: 10,
        },
        true,
      );

      expect(createInventoryMovementMock).toHaveBeenCalledWith(
        {
          businessId: "biz-A",
          branchId: "branch-A",
        },
        {
          inventoryItemId: "88888888-8888-4888-8888-888888888888",
          quantity: 10,
          type: "RECEIPT",
          createdById: "user-A",
        },
      );

      expect(response).toEqual({
        code: "SR",
        result,
      });
    });
  });

  describe("unsupported operations", () => {
    it("rejects catalog operations that do not have an implementation yet", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "RF",
          {},
          true,
        ),
      ).rejects.toMatchObject({
        message: "Quick operation RF is not implemented yet",
        statusCode: 501,
      });

      expect(hasPermissionMock).toHaveBeenCalledWith(
        "user-A",
        "biz-A",
        "BUSINESS_OWNER",
        "payments.manage",
      );
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });
  });

  describe("validation", () => {
    it("rejects malformed transfer input", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "TI",
          {
            orderId: "not-a-uuid",
            customerId: "also-not-a-uuid",
          },
        ),
      ).rejects.toThrow();

      expect(transferOrderMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("rejects malformed stock input", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "SR",
          {
            inventoryItemId: "not-a-uuid",
            quantity: 0,
          },
        ),
      ).rejects.toThrow();

      expect(createInventoryMovementMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  hasPermissionMock,
  recordAuditEventMock,
  getOrderForBusinessMock,
  transferOrderMock,
  updateOrderStatusMock,
  transferCustomerMock,
  mergeCustomerMock,
  voidPaymentMock,
  refundPaymentMock,
  createInventoryMovementMock,
  getCustomerReceiptMock,
  getCompanyReceiptMock,
  resendDigitalReceiptMock,
  reconcileInvoiceMock,
} = vi.hoisted(() => ({
  hasPermissionMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  getOrderForBusinessMock: vi.fn(),
  transferOrderMock: vi.fn(),
  updateOrderStatusMock: vi.fn(),
  transferCustomerMock: vi.fn(),
  mergeCustomerMock: vi.fn(),
  voidPaymentMock: vi.fn(),
  refundPaymentMock: vi.fn(),
  createInventoryMovementMock: vi.fn(),
  getCustomerReceiptMock: vi.fn(),
  getCompanyReceiptMock: vi.fn(),
  resendDigitalReceiptMock: vi.fn(),
  reconcileInvoiceMock: vi.fn(),
}));

vi.mock("../../src/modules/permissions/permissions.service.js", () => ({
  hasPermission: hasPermissionMock,
}));

vi.mock("../../src/lib/audit.js", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("../../src/modules/orders/orders.service.js", () => ({
  getOrderForBusiness: getOrderForBusinessMock,
  transferOrder: transferOrderMock,
  updateOrderStatus: updateOrderStatusMock,
}));

vi.mock("../../src/modules/customers/customers.service.js", () => ({
  transferCustomer: transferCustomerMock,
  mergeCustomer: mergeCustomerMock,
}));

vi.mock("../../src/modules/payments/payments.service.js", () => ({
  voidPayment: voidPaymentMock,
  refundPayment: refundPaymentMock,
}));

vi.mock("../../src/modules/inventory/inventory.service.js", () => ({
  createInventoryMovement: createInventoryMovementMock,
}));

vi.mock("../../src/modules/invoices/receipts.service.js", () => ({
  getCustomerReceipt: getCustomerReceiptMock,
  getCompanyReceipt: getCompanyReceiptMock,
}));

vi.mock("../../src/modules/invoices/receipt-delivery.service.js", () => ({
  resendDigitalReceipt: resendDigitalReceiptMock,
}));

vi.mock("../../src/modules/payments/reconciliation.service.js", () => ({
  reconcileInvoice: reconcileInvoiceMock,
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
  resendDigitalReceiptMock.mockReset();
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

  describe("MU - Manual Update", () => {
    const ORDER_ID = "55555555-5555-4555-8555-555555555555";

    it("updates the order status and records the before/after audit", async () => {
      const currentOrder = {
        id: ORDER_ID,
        orderNumber: "10001",
        status: "IN_PROGRESS",
      };

      const updatedOrder = {
        ...currentOrder,
        status: "READY_FOR_PICKUP",
      };

      getOrderForBusinessMock.mockResolvedValue(currentOrder);
      updateOrderStatusMock.mockResolvedValue(updatedOrder);

      const response = await executeQuickOperation(
        CONTEXT,
        "MU",
        {
          orderId: ORDER_ID,
          status: "READY_FOR_PICKUP",
        },
        true,
      );

      expect(getOrderForBusinessMock).toHaveBeenCalledWith(
        ORDER_ID,
        "biz-A",
        "branch-A",
      );

      expect(updateOrderStatusMock).toHaveBeenCalledWith(
        ORDER_ID,
        "biz-A",
        "branch-A",
        "READY_FOR_PICKUP",
      );

      expect(recordAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "quick_operation.executed",
          entityType: "Order",
          entityId: ORDER_ID,
          businessId: "biz-A",
          branchId: "branch-A",
          actorUserId: "user-A",
          correlationId: "corr-123",
          metadata: expect.objectContaining({
            operationCode: "MU",
            operationName: "Manual Update",
            orderNumber: "10001",
            beforeStatus: "IN_PROGRESS",
            afterStatus: "READY_FOR_PICKUP",
          }),
        }),
      );

      expect(response).toEqual({
        code: "MU",
        result: updatedOrder,
      });
    });

    it("rejects an order outside the authenticated business and branch", async () => {
      getOrderForBusinessMock.mockResolvedValue(null);

      await expect(
        executeQuickOperation(
          CONTEXT,
          "MU",
          {
            orderId: ORDER_ID,
            status: "COMPLETED",
          },
          true,
        ),
      ).rejects.toMatchObject({
        message: "Order not found",
        statusCode: 404,
      });

      expect(getOrderForBusinessMock).toHaveBeenCalledWith(
        ORDER_ID,
        "biz-A",
        "branch-A",
      );
      expect(updateOrderStatusMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("requires orders.change_status permission", async () => {
      const currentOrder = {
        id: ORDER_ID,
        orderNumber: "10001",
        status: "IN_PROGRESS",
      };

      getOrderForBusinessMock.mockResolvedValue(currentOrder);

      hasPermissionMock
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await expect(
        executeQuickOperation(
          CONTEXT,
          "MU",
          {
            orderId: ORDER_ID,
            status: "COMPLETED",
          },
          true,
        ),
      ).rejects.toMatchObject({
        message: "Insufficient permissions to change order status",
        statusCode: 403,
      });

      expect(hasPermissionMock).toHaveBeenNthCalledWith(
        1,
        "user-A",
        "biz-A",
        "BUSINESS_OWNER",
        "orders.update",
      );

      expect(hasPermissionMock).toHaveBeenNthCalledWith(
        2,
        "user-A",
        "biz-A",
        "BUSINESS_OWNER",
        "orders.change_status",
      );

      expect(updateOrderStatusMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("requires confirmation before executing the update", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "MU",
          {
            orderId: ORDER_ID,
            status: "COMPLETED",
          },
        ),
      ).rejects.toMatchObject({
        message: "Confirmation is required for this quick operation",
        statusCode: 422,
      });

      expect(getOrderForBusinessMock).not.toHaveBeenCalled();
      expect(updateOrderStatusMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
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

  describe("TC - Transfer Customer", () => {
    it("transfers a customer within the authenticated business", async () => {
      const result = {
        customer: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "Customer A",
          businessId: "biz-A",
        },
        targetCustomer: {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          name: "Customer B",
          businessId: "biz-A",
        },
        transferredOrderCount: 2,
        transferredOrders: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            orderNumber: "00042",
            branchId: "branch-A",
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            orderNumber: "00043",
            branchId: "branch-B",
          },
        ],
      };

      transferCustomerMock.mockResolvedValue(result);

      const response = await executeQuickOperation(
        CONTEXT,
        "TC",
        {
          customerId: result.customer.id,
          targetCustomerId: result.targetCustomer.id,
        },
        true,
      );

      expect(transferCustomerMock).toHaveBeenCalledWith(
        result.customer.id,
        "biz-A",
        result.targetCustomer.id,
      );

      expect(response).toEqual({
        code: "TC",
        result,
      });

      expect(recordAuditEventMock).toHaveBeenCalledWith({
        action: "quick_operation.executed",
        entityType: "Customer",
        entityId: result.customer.id,
        businessId: "biz-A",
        actorUserId: "user-A",
        correlationId: "corr-123",
        metadata: {
          operationCode: "TC",
          operationName: "Transfer Customer",
          targetCustomerId: result.targetCustomer.id,
          transferredOrderCount: 2,
          transferredOrderIds: [
            "11111111-1111-4111-8111-111111111111",
            "22222222-2222-4222-8222-222222222222",
          ],
          transferredOrderNumbers: ["00042", "00043"],
        },
      });
    });

    it("rejects malformed customer transfer input", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "TC",
          {
            customerId: "not-a-uuid",
            targetCustomerId: "also-not-a-uuid",
          },
          true,
        ),
      ).rejects.toThrow();

      expect(transferCustomerMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });
  });

  describe("MA - Merge Account", () => {
    it("merges a customer within the authenticated business and records the merge audit", async () => {
      const result = {
        customer: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "Customer A",
          businessId: "biz-A",
          isActive: true,
        },
        targetCustomer: {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          name: "Customer B",
          businessId: "biz-A",
          isActive: true,
        },
        mergedOrderCount: 2,
        mergedOrders: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            orderNumber: "00042",
            branchId: "branch-A",
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            orderNumber: "00043",
            branchId: "branch-B",
          },
        ],
        sourceDeactivated: true,
      };

      mergeCustomerMock.mockResolvedValue(result);

      const response = await executeQuickOperation(
        CONTEXT,
        "MA",
        {
          customerId: result.customer.id,
          targetCustomerId: result.targetCustomer.id,
        },
        true,
      );

      expect(mergeCustomerMock).toHaveBeenCalledWith(
        result.customer.id,
        "biz-A",
        result.targetCustomer.id,
      );

      expect(response).toEqual({
        code: "MA",
        result,
      });

      expect(recordAuditEventMock).toHaveBeenCalledWith({
        action: "quick_operation.executed",
        entityType: "Customer",
        entityId: result.customer.id,
        businessId: "biz-A",
        actorUserId: "user-A",
        correlationId: "corr-123",
        metadata: {
          operationCode: "MA",
          operationName: "Merge Account",
          targetCustomerId: result.targetCustomer.id,
          mergedOrderCount: 2,
          mergedOrderIds: [
            "11111111-1111-4111-8111-111111111111",
            "22222222-2222-4222-8222-222222222222",
          ],
          mergedOrderNumbers: ["00042", "00043"],
          sourceDeactivated: true,
        },
      });
    });

    it("rejects malformed merge input", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "MA",
          {
            customerId: "not-a-uuid",
            targetCustomerId: "also-not-a-uuid",
          },
          true,
        ),
      ).rejects.toThrow();

      expect(mergeCustomerMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("requires confirmation before executing the sensitive merge operation", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "MA",
          {
            customerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            targetCustomerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          },
          false,
        ),
      ).rejects.toMatchObject({
        message: "Confirmation is required for this quick operation",
        statusCode: 422,
      });

      expect(mergeCustomerMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
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

  describe("RF - Refund", () => {
    const PAYMENT_ID = "33333333-3333-4333-8333-333333333333";
    const REFUND_ID = "66666666-6666-4666-8666-666666666666";
    const INVOICE_ID = "44444444-4444-4444-8444-444444444444";

    it("creates a refund through the payment service and records the refund audit", async () => {
      const result = {
        id: REFUND_ID,
        businessId: "biz-A",
        branchId: "branch-A",
        invoiceId: INVOICE_ID,
        amount: 2000,
        method: "TRANSFER",
        type: "REFUND",
        refundOfPaymentId: PAYMENT_ID,
        status: "POSTED",
      };

      refundPaymentMock.mockResolvedValue(result);

      const response = await executeQuickOperation(
        CONTEXT,
        "RF",
        {
          paymentId: PAYMENT_ID,
          amount: 2000,
          method: "TRANSFER",
          reference: "REF-001",
          note: "Customer refund",
        },
        true,
      );

      expect(refundPaymentMock).toHaveBeenCalledWith({
        paymentId: PAYMENT_ID,
        businessId: "biz-A",
        branchId: "branch-A",
        amount: 2000,
        method: "TRANSFER",
        reference: "REF-001",
        note: "Customer refund",
      });

      expect(recordAuditEventMock).toHaveBeenCalledWith({
        action: "quick_operation.executed",
        entityType: "Payment",
        entityId: REFUND_ID,
        businessId: "biz-A",
        branchId: "branch-A",
        actorUserId: "user-A",
        correlationId: "corr-123",
        metadata: {
          operationCode: "RF",
          operationName: "Refund",
          originalPaymentId: PAYMENT_ID,
          invoiceId: INVOICE_ID,
          amount: 2000,
          method: "TRANSFER",
          type: "REFUND",
          status: "POSTED",
        },
      });

      expect(response).toEqual({
        code: "RF",
        result,
      });
    });

    it("passes the authenticated business and branch to the refund service", async () => {
      refundPaymentMock.mockResolvedValue({
        id: REFUND_ID,
        invoiceId: INVOICE_ID,
        amount: 1000,
        method: "CASH",
        type: "REFUND",
        refundOfPaymentId: PAYMENT_ID,
        status: "POSTED",
      });

      await executeQuickOperation(
        CONTEXT,
        "RF",
        {
          paymentId: PAYMENT_ID,
          amount: 1000,
          method: "CASH",
        },
        true,
      );

      expect(refundPaymentMock).toHaveBeenCalledWith({
        paymentId: PAYMENT_ID,
        businessId: "biz-A",
        branchId: "branch-A",
        amount: 1000,
        method: "CASH",
      });
    });

    it("rejects an RF operation when payments.manage permission is denied", async () => {
      hasPermissionMock.mockResolvedValue(false);

      await expect(
        executeQuickOperation(
          CONTEXT,
          "RF",
          {
            paymentId: PAYMENT_ID,
            amount: 1000,
            method: "CASH",
          },
          true,
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

      expect(refundPaymentMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("requires confirmation before executing a refund", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "RF",
          {
            paymentId: PAYMENT_ID,
            amount: 1000,
            method: "CASH",
          },
        ),
      ).rejects.toMatchObject({
        message: "Confirmation is required for this quick operation",
        statusCode: 422,
      });

      expect(refundPaymentMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("validates the refund input before calling the payment service", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "RF",
          {
            paymentId: PAYMENT_ID,
            amount: 0,
            method: "CASH",
          },
          true,
        ),
      ).rejects.toThrow();

      expect(refundPaymentMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("rejects unsupported refund methods", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "RF",
          {
            paymentId: PAYMENT_ID,
            amount: 1000,
            method: "CARD",
          },
          true,
        ),
      ).rejects.toThrow();

      expect(refundPaymentMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("rejects unexpected refund fields", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "RF",
          {
            paymentId: PAYMENT_ID,
            amount: 1000,
            method: "CASH",
            customerPhone: "08000000000",
          },
          true,
        ),
      ).rejects.toThrow();

      expect(refundPaymentMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
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

  describe("RS - Resend Receipt", () => {
    const INVOICE_ID = "44444444-4444-4444-8444-444444444444";

    const deliveryResult = {
      status: "QUEUED",
      channel: "EMAIL",
      invoiceId: INVOICE_ID,
    };

    it("requires explicit confirmation before resending a receipt", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "RS",
          {
            invoiceId: INVOICE_ID,
            channel: "EMAIL",
          },
        ),
      ).rejects.toMatchObject({
        message: "Confirmation is required for this quick operation",
        statusCode: 422,
      });

      expect(resendDigitalReceiptMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("resends a receipt through EMAIL", async () => {
      resendDigitalReceiptMock.mockResolvedValue(deliveryResult);

      const response = await executeQuickOperation(
        CONTEXT,
        "RS",
        {
          invoiceId: INVOICE_ID,
          channel: "EMAIL",
        },
        true,
      );

      expect(resendDigitalReceiptMock).toHaveBeenCalledWith({
        invoiceId: INVOICE_ID,
        businessId: "biz-A",
        branchId: "branch-A",
        channel: "EMAIL",
      });

      expect(response).toEqual({
        code: "RS",
        result: deliveryResult,
      });
    });

    it("resends a receipt through WHATSAPP", async () => {
      const whatsappResult = {
        status: "QUEUED",
        channel: "WHATSAPP",
        invoiceId: INVOICE_ID,
      };

      resendDigitalReceiptMock.mockResolvedValue(whatsappResult);

      const response = await executeQuickOperation(
        CONTEXT,
        "RS",
        {
          invoiceId: INVOICE_ID,
          channel: "WHATSAPP",
        },
        true,
      );

      expect(resendDigitalReceiptMock).toHaveBeenCalledWith({
        invoiceId: INVOICE_ID,
        businessId: "biz-A",
        branchId: "branch-A",
        channel: "WHATSAPP",
      });

      expect(response).toEqual({
        code: "RS",
        result: whatsappResult,
      });
    });

    it("passes the authenticated business and branch scope to delivery", async () => {
      resendDigitalReceiptMock.mockResolvedValue(deliveryResult);

      await executeQuickOperation(
        CONTEXT,
        "RS",
        {
          invoiceId: INVOICE_ID,
          channel: "EMAIL",
        },
        true,
      );

      expect(resendDigitalReceiptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId: INVOICE_ID,
          businessId: CONTEXT.businessId,
          branchId: CONTEXT.branchId,
        }),
      );
    });

    it("enforces invoices.view permission", async () => {
      hasPermissionMock.mockResolvedValue(false);

      await expect(
        executeQuickOperation(
          CONTEXT,
          "RS",
          {
            invoiceId: INVOICE_ID,
            channel: "EMAIL",
          },
          true,
        ),
      ).rejects.toMatchObject({
        message: "Insufficient permissions for this quick operation",
        statusCode: 403,
      });

      expect(hasPermissionMock).toHaveBeenCalledWith(
        "user-A",
        "biz-A",
        "BUSINESS_OWNER",
        "invoices.view",
      );

      expect(resendDigitalReceiptMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("records a safe audit event without receipt or customer contact data", async () => {
      resendDigitalReceiptMock.mockResolvedValue(deliveryResult);

      await executeQuickOperation(
        CONTEXT,
        "RS",
        {
          invoiceId: INVOICE_ID,
          channel: "EMAIL",
        },
        true,
      );

      expect(recordAuditEventMock).toHaveBeenCalledWith({
        action: "quick_operation.executed",
        entityType: "Invoice",
        entityId: INVOICE_ID,
        businessId: "biz-A",
        branchId: "branch-A",
        actorUserId: "user-A",
        correlationId: "corr-123",
        metadata: {
          operationCode: "RS",
          operationName: "Resend Receipt",
          invoiceId: INVOICE_ID,
          channel: "EMAIL",
        },
      });
    });

    it("does not audit a failed delivery", async () => {
      resendDigitalReceiptMock.mockRejectedValue(
        new Error("EMAIL receipt delivery is not configured"),
      );

      await expect(
        executeQuickOperation(
          CONTEXT,
          "RS",
          {
            invoiceId: INVOICE_ID,
            channel: "EMAIL",
          },
          true,
        ),
      ).rejects.toThrow("EMAIL receipt delivery is not configured");

      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("rejects malformed RS input", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "RS",
          {
            invoiceId: "not-a-uuid",
            channel: "EMAIL",
          },
          true,
        ),
      ).rejects.toThrow();

      expect(resendDigitalReceiptMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("rejects an unsupported delivery channel", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "RS",
          {
            invoiceId: INVOICE_ID,
            channel: "SMS",
          },
          true,
        ),
      ).rejects.toThrow();

      expect(resendDigitalReceiptMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("rejects unexpected RS fields", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "RS",
          {
            invoiceId: INVOICE_ID,
            channel: "EMAIL",
            customerPhone: "08000000000",
          },
          true,
        ),
      ).rejects.toThrow();

      expect(resendDigitalReceiptMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });
  });

  describe("RI - Reprint Invoice / Receipt", () => {
    const INVOICE_ID = "44444444-4444-4444-8444-444444444444";

    const customerReceipt = {
      receiptType: "CUSTOMER" as const,
      invoiceNumber: "INV-00001",
      orderNumber: "00001",
      companyName: "Test Laundry",
      companyPhone: "08000000000",
      companyEmail: "hello@testlaundry.com",
      companyWebsite: "https://testlaundry.com",
      companyAddress: "Enugu, Nigeria",
      customerName: "John Doe",
      branchName: "Main Branch",
      createdAt: "2026-09-07T08:00:00.000Z",
      items: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          quantity: 2,
          itemName: "Complete Agbada",
          totalPieces: 6,
          unitPrice: 4500,
          totalPrice: 9000,
        },
      ],
      totalAmount: 9000,
      garmentNote: "Minor stain noted",
      customerAgreement: "Customer agrees to the company laundry terms.",
    };

    const companyReceipt = {
      ...customerReceipt,
      receiptType: "COMPANY" as const,
      internalNote: "Handle with care.",
    };

    beforeEach(() => {
      getCustomerReceiptMock.mockReset();
      getCompanyReceiptMock.mockReset();
    });

    it("reprints a customer receipt without requiring confirmation", async () => {
      getCustomerReceiptMock.mockResolvedValue(customerReceipt);

      const response = await executeQuickOperation(
        CONTEXT,
        "RI",
        {
          invoiceId: INVOICE_ID,
          receiptType: "CUSTOMER",
        },
      );

      expect(getCustomerReceiptMock).toHaveBeenCalledWith(
        INVOICE_ID,
        "biz-A",
        "branch-A",
      );

      expect(getCompanyReceiptMock).not.toHaveBeenCalled();

      expect(response).toEqual({
        code: "RI",
        result: customerReceipt,
      });
    });

    it("reprints a company receipt without requiring confirmation", async () => {
      getCompanyReceiptMock.mockResolvedValue(companyReceipt);

      const response = await executeQuickOperation(
        CONTEXT,
        "RI",
        {
          invoiceId: INVOICE_ID,
          receiptType: "COMPANY",
        },
      );

      expect(getCompanyReceiptMock).toHaveBeenCalledWith(
        INVOICE_ID,
        "biz-A",
        "branch-A",
      );

      expect(getCustomerReceiptMock).not.toHaveBeenCalled();

      expect(response).toEqual({
        code: "RI",
        result: companyReceipt,
      });
    });

    it("passes the authenticated business and branch scope to receipt generation", async () => {
      getCustomerReceiptMock.mockResolvedValue(customerReceipt);

      await executeQuickOperation(
        CONTEXT,
        "RI",
        {
          invoiceId: INVOICE_ID,
          receiptType: "CUSTOMER",
        },
      );

      expect(getCustomerReceiptMock).toHaveBeenCalledWith(
        INVOICE_ID,
        CONTEXT.businessId,
        CONTEXT.branchId,
      );
    });

    it("enforces invoices.view permission", async () => {
      hasPermissionMock.mockResolvedValue(false);

      await expect(
        executeQuickOperation(
          CONTEXT,
          "RI",
          {
            invoiceId: INVOICE_ID,
            receiptType: "CUSTOMER",
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
        "invoices.view",
      );

      expect(getCustomerReceiptMock).not.toHaveBeenCalled();
      expect(getCompanyReceiptMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("returns 404 when the invoice is not found within the authenticated scope", async () => {
      getCustomerReceiptMock.mockResolvedValue(null);

      await expect(
        executeQuickOperation(
          CONTEXT,
          "RI",
          {
            invoiceId: INVOICE_ID,
            receiptType: "CUSTOMER",
          },
        ),
      ).rejects.toMatchObject({
        message: "Invoice not found",
        statusCode: 404,
      });

      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("records an audit event for a customer receipt reprint", async () => {
      getCustomerReceiptMock.mockResolvedValue(customerReceipt);

      await executeQuickOperation(
        CONTEXT,
        "RI",
        {
          invoiceId: INVOICE_ID,
          receiptType: "CUSTOMER",
        },
      );

      expect(recordAuditEventMock).toHaveBeenCalledWith({
        action: "quick_operation.executed",
        entityType: "Invoice",
        entityId: INVOICE_ID,
        businessId: "biz-A",
        branchId: "branch-A",
        actorUserId: "user-A",
        correlationId: "corr-123",
        metadata: {
          operationCode: "RI",
          operationName: "Reprint Invoice / Receipt",
          invoiceNumber: "INV-00001",
          orderNumber: "00001",
          receiptType: "CUSTOMER",
        },
      });
    });

    it("records the receipt type when reprinting a company receipt", async () => {
      getCompanyReceiptMock.mockResolvedValue(companyReceipt);

      await executeQuickOperation(
        CONTEXT,
        "RI",
        {
          invoiceId: INVOICE_ID,
          receiptType: "COMPANY",
        },
      );

      expect(recordAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "Invoice",
          entityId: INVOICE_ID,
          metadata: expect.objectContaining({
            operationCode: "RI",
            receiptType: "COMPANY",
          }),
        }),
      );
    });

    it("rejects malformed RI input", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "RI",
          {
            invoiceId: "not-a-uuid",
            receiptType: "CUSTOMER",
          },
        ),
      ).rejects.toThrow();

      expect(getCustomerReceiptMock).not.toHaveBeenCalled();
      expect(getCompanyReceiptMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("rejects an unsupported receipt type", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "RI",
          {
            invoiceId: INVOICE_ID,
            receiptType: "PDF",
          },
        ),
      ).rejects.toThrow();

      expect(getCustomerReceiptMock).not.toHaveBeenCalled();
      expect(getCompanyReceiptMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("rejects unexpected RI fields", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "RI",
          {
            invoiceId: INVOICE_ID,
            receiptType: "CUSTOMER",
            customerPhone: "08000000000",
          },
        ),
      ).rejects.toThrow();

      expect(getCustomerReceiptMock).not.toHaveBeenCalled();
      expect(getCompanyReceiptMock).not.toHaveBeenCalled();
      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });
  });

  describe("unsupported operations", () => {
    it("rejects catalog operations that do not have an implementation yet", async () => {
      await expect(
        executeQuickOperation(
          CONTEXT,
          "SOS",
          {},
          true,
        ),
      ).rejects.toMatchObject({
        message: "Quick operation SOS is not implemented yet",
        statusCode: 501,
      });

      expect(hasPermissionMock).toHaveBeenCalledWith(
        "user-A",
        "biz-A",
        "BUSINESS_OWNER",
        expect.any(String),
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

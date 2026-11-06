import type { Role } from "@prisma/client";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import { requireReason } from "../../lib/reason.js";
import { hasPermission } from "../permissions/permissions.service.js";
import {
  getQuickOperationDefinition,
} from "./quick-operations.catalog.js";
import {
  executeQuickOperationSchema,
  manualUpdateQuickOperationSchema,
  stockQuickOperationSchema,
  transferInvoiceQuickOperationSchema,
  transferCustomerQuickOperationSchema,
  mergeCustomerQuickOperationSchema,
  voidPaymentQuickOperationSchema,
  refundPaymentQuickOperationSchema,
  reprintInvoiceQuickOperationSchema,
  resendReceiptQuickOperationSchema,
  reconcileQuickOperationSchema,
  switchOrderQuickOperationSchema,
  switchCustomerQuickOperationSchema,
} from "./quick-operations.validation.js";
import {
  getOrderForBusiness,
  transferOrder,
  updateOrderStatus,
} from "../orders/orders.service.js";
import {
  getCustomerForBusiness,
  transferCustomer,
  mergeCustomer,
} from "../customers/customers.service.js";
import {
  voidPayment,
  refundPayment,
} from "../payments/payments.service.js";

import {
  getCustomerReceipt,
  getCompanyReceipt,
} from "../invoices/receipts.service.js";
import { resendDigitalReceipt } from "../invoices/receipt-delivery.service.js";
import { reconcileInvoice } from "../payments/reconciliation.service.js";
import { createInventoryMovement } from "../inventory/inventory.service.js";

export interface ExecuteQuickOperationContext {
  userId: string;
  role: Role;
  businessId: string;
  branchId: string;
  correlationId?: string | null;
}

export async function executeQuickOperation(
  context: ExecuteQuickOperationContext,
  code: string,
  rawInput: unknown,
  confirmed = false,
  rawReason?: unknown,
) {
  const definition = getQuickOperationDefinition(code);

  if (!definition) {
    throw new AppError("Unknown quick operation", 400);
  }

  const execution = executeQuickOperationSchema.parse({
    code,
    input: rawInput,
    confirmed,
    reason: rawReason,
  });

  const allowed = await hasPermission(
    context.userId,
    context.businessId,
    context.role,
    definition.permission,
  );

  if (!allowed) {
    throw new AppError(
      "Insufficient permissions for this quick operation",
      403,
    );
  }

  if (definition.requiresConfirmation && !execution.confirmed) {
    throw new AppError(
      "Confirmation is required for this quick operation",
      422,
    );
  }

  const reason = definition.sensitive
    ? requireReason(execution.reason)
    : undefined;

  const input = execution.input;

  switch (definition.code) {
    case "MU": {
      const parsed = manualUpdateQuickOperationSchema.parse(input);

      const currentOrder = await getOrderForBusiness(
        parsed.orderId,
        context.businessId,
        context.branchId,
      );

      if (!currentOrder) {
        throw new AppError("Order not found", 404);
      }

      const canChangeStatus = await hasPermission(
        context.userId,
        context.businessId,
        context.role,
        "orders.change_status",
      );

      if (!canChangeStatus) {
        throw new AppError(
          "Insufficient permissions to change order status",
          403,
        );
      }

      const result = await updateOrderStatus(
        parsed.orderId,
        context.businessId,
        context.branchId,
        parsed.status,
      );

      await recordAuditEvent({
        action: "quick_operation.executed",
        entityType: "Order",
        entityId: result.id,
        businessId: context.businessId,
        branchId: context.branchId,
        actorUserId: context.userId,
        correlationId: context.correlationId ?? null,
        metadata: {
          operationCode: definition.code,
          operationName: definition.name,
          ...(reason !== undefined ? { reason } : {}),
          orderNumber: result.orderNumber,
          beforeStatus: currentOrder.status,
          afterStatus: result.status,
        },
      });

      return {
        code: definition.code,
        result,
      };
    }

    case "TI": {
      const parsed = transferInvoiceQuickOperationSchema.parse(input);

      const result = await transferOrder(
        parsed.orderId,
        context.businessId,
        context.branchId,
        parsed.customerId,
        prisma,
        context.userId,
      );

      await recordAuditEvent({
        action: "quick_operation.executed",
        entityType: "Order",
        entityId: result.id,
        businessId: context.businessId,
        branchId: context.branchId,
        actorUserId: context.userId,
        correlationId: context.correlationId ?? null,
        metadata: {
          operationCode: definition.code,
          operationName: definition.name,
          ...(reason !== undefined ? { reason } : {}),
          orderNumber: result.orderNumber,
          customerId: result.customerId,
        },
      });

      return {
        code: definition.code,
        result,
      };
    }

    case "TC": {
      const parsed = transferCustomerQuickOperationSchema.parse(input);

      const result = await transferCustomer(
        parsed.customerId,
        context.businessId,
        context.branchId,
        context.userId,
        parsed.targetCustomerId,
      );

      await recordAuditEvent({
        action: "quick_operation.executed",
        entityType: "Customer",
        entityId: result.customer.id,
        businessId: context.businessId,
        branchId: context.branchId,
        actorUserId: context.userId,
        correlationId: context.correlationId ?? null,
        metadata: {
          operationCode: definition.code,
          operationName: definition.name,
          ...(reason !== undefined ? { reason } : {}),
          targetCustomerId: result.targetCustomer.id,
          transferredOrderCount: result.transferredOrderCount,
          transferredOrderIds: result.transferredOrders.map((order) => order.id),
          transferredOrderNumbers: result.transferredOrders.map(
            (order) => order.orderNumber,
          ),
        },
      });

      return {
        code: definition.code,
        result,
      };
    }

    case "MA": {
      const parsed = mergeCustomerQuickOperationSchema.parse(input);

      const result = await mergeCustomer(
        parsed.customerId,
        context.businessId,
        context.branchId,
        context.userId,
        parsed.targetCustomerId,
      );

      await recordAuditEvent({
        action: "quick_operation.executed",
        entityType: "Customer",
        entityId: result.customer.id,
        businessId: context.businessId,
        branchId: context.branchId,
        actorUserId: context.userId,
        correlationId: context.correlationId ?? null,
        metadata: {
          operationCode: definition.code,
          operationName: definition.name,
          ...(reason !== undefined ? { reason } : {}),
          targetCustomerId: result.targetCustomer.id,
          mergedOrderCount: result.mergedOrderCount,
          mergedOrderIds: result.mergedOrders.map((order) => order.id),
          mergedOrderNumbers: result.mergedOrders.map(
            (order) => order.orderNumber,
          ),
          sourceDeactivated: result.sourceDeactivated,
        },
      });

      return {
        code: definition.code,
        result,
      };
    }

    case "VO": {
      const parsed = voidPaymentQuickOperationSchema.parse(input);

      const result = await voidPayment(
        parsed.paymentId,
        context.businessId,
        context.branchId,
        reason,
      );

      await recordAuditEvent({
        action: "quick_operation.executed",
        entityType: "Payment",
        entityId: result.id,
        businessId: context.businessId,
        branchId: context.branchId,
        actorUserId: context.userId,
        correlationId: context.correlationId ?? null,
        metadata: {
          operationCode: definition.code,
          operationName: definition.name,
          ...(reason !== undefined ? { reason } : {}),
          invoiceId: result.invoiceId,
          amount: result.amount,
          method: result.method,
          status: result.status,
        },
      });

      return {
        code: definition.code,
        result,
      };
    }

    case "RS": {
      const parsed = resendReceiptQuickOperationSchema.parse(input);

      const result = await resendDigitalReceipt({
        invoiceId: parsed.invoiceId,
        businessId: context.businessId,
        branchId: context.branchId,
        channel: parsed.channel,
      });

      await recordAuditEvent({
        action: "quick_operation.executed",
        entityType: "Invoice",
        entityId: parsed.invoiceId,
        businessId: context.businessId,
        branchId: context.branchId,
        actorUserId: context.userId,
        correlationId: context.correlationId ?? null,
        metadata: {
          operationCode: definition.code,
          operationName: definition.name,
          ...(reason !== undefined ? { reason } : {}),
          invoiceId: parsed.invoiceId,
          channel: parsed.channel,
        },
      });

      return {
        code: definition.code,
        result,
      };
    }

    case "SO": {
      const parsed = switchOrderQuickOperationSchema.parse(input);

      const result = await getOrderForBusiness(
        parsed.orderId,
        context.businessId,
        context.branchId,
      );

      if (!result) {
        throw new AppError("Order not found", 404);
      }

      await recordAuditEvent({
        action: "quick_operation.executed",
        entityType: "Order",
        entityId: result.id,
        businessId: context.businessId,
        branchId: context.branchId,
        actorUserId: context.userId,
        correlationId: context.correlationId ?? null,
        metadata: {
          operationCode: definition.code,
          operationName: definition.name,
          ...(reason !== undefined ? { reason } : {}),
          orderNumber: result.orderNumber,
          customerId: result.customerId,
        },
      });

      return {
        code: definition.code,
        result,
      };
    }

    case "SC": {
      const parsed = switchCustomerQuickOperationSchema.parse(input);

      const result = await getCustomerForBusiness(
        parsed.customerId,
        context.businessId,
        context.branchId,
        context.userId,
      );

      if (!result) {
        throw new AppError("Customer not found", 404);
      }

      await recordAuditEvent({
        action: "quick_operation.executed",
        entityType: "Customer",
        entityId: result.id,
        businessId: context.businessId,
        branchId: context.branchId,
        actorUserId: context.userId,
        correlationId: context.correlationId ?? null,
        metadata: {
          operationCode: definition.code,
          operationName: definition.name,
          ...(reason !== undefined ? { reason } : {}),
          customerId: result.id,
        },
      });

      return {
        code: definition.code,
        result,
      };
    }

    case "SOS": {
      const parsed = executeQuickOperationSchema.shape.input.parse(input);

      const pendingOfflineOperationCount =
        parsed.pendingOfflineOperationCount;

      if (
        typeof pendingOfflineOperationCount !== "number" ||
        !Number.isInteger(pendingOfflineOperationCount) ||
        pendingOfflineOperationCount < 0
      ) {
        throw new AppError(
          "SOS requires a valid pending offline operation count",
          400,
        );
      }

      if (Object.keys(parsed).some(
        (key) => key !== "pendingOfflineOperationCount",
      )) {
        throw new AppError(
          "SOS does not accept business record input",
          400,
        );
      }

      await recordAuditEvent({
        action: "quick_operation.executed",
        entityType: "QuickOperation",
        entityId: null,
        businessId: context.businessId,
        branchId: context.branchId,
        actorUserId: context.userId,
        correlationId: context.correlationId ?? null,
        metadata: {
          operationCode: definition.code,
          operationName: definition.name,
          ...(reason !== undefined ? { reason } : {}),
          safeStop: true,
          offlineQueueReconciled: false,
          pendingOfflineOperationCount,
          pendingOfflineOperationsPreserved: true,
        },
      });

      return {
        code: definition.code,
        result: {
          stopped: true,
          safeStateSaved: true,
          pendingOfflineOperationsPreserved: true,
          pendingOfflineOperationCount,
          offlineQueueReconciled: false,
        },
      };
    }

    case "RC": {
      const parsed = reconcileQuickOperationSchema.parse(input);

      const result = await reconcileInvoice({
        invoiceId: parsed.invoiceId,
        businessId: context.businessId,
        branchId: context.branchId,
      });

      await recordAuditEvent({
        action: "quick_operation.executed",
        entityType: "Invoice",
        entityId: parsed.invoiceId,
        businessId: context.businessId,
        branchId: context.branchId,
        actorUserId: context.userId,
        correlationId: context.correlationId ?? null,
        metadata: {
          operationCode: definition.code,
          operationName: definition.name,
          ...(reason !== undefined ? { reason } : {}),
          invoiceId: result.invoiceId,
          invoiceNumber: result.invoiceNumber,
          issueCount: result.issueCount,
          reconciled: result.reconciled,
        },
      });

      return {
        code: definition.code,
        result,
      };
    }

    case "RI": {
      const parsed = reprintInvoiceQuickOperationSchema.parse(input);

      const receipt =
        parsed.receiptType === "CUSTOMER"
          ? await getCustomerReceipt(
              parsed.invoiceId,
              context.businessId,
              context.branchId,
            )
          : await getCompanyReceipt(
              parsed.invoiceId,
              context.businessId,
              context.branchId,
            );

      if (!receipt) {
        throw new AppError("Invoice not found", 404);
      }

      await recordAuditEvent({
        action: "quick_operation.executed",
        entityType: "Invoice",
        entityId: parsed.invoiceId,
        businessId: context.businessId,
        branchId: context.branchId,
        actorUserId: context.userId,
        correlationId: context.correlationId ?? null,
        metadata: {
          operationCode: definition.code,
          operationName: definition.name,
          ...(reason !== undefined ? { reason } : {}),
          invoiceNumber: receipt.invoiceNumber,
          orderNumber: receipt.orderNumber,
          receiptType: receipt.receiptType,
        },
      });

      return {
        code: definition.code,
        result: receipt,
      };
    }

    case "RF": {
      const parsed = refundPaymentQuickOperationSchema.parse(input);

      const result = await refundPayment({
        paymentId: parsed.paymentId,
        businessId: context.businessId,
        branchId: context.branchId,
        amount: parsed.amount,
        method: parsed.method,
        ...(parsed.reference !== undefined && {
          reference: parsed.reference,
        }),
        ...(parsed.note !== undefined && {
          note: parsed.note,
        }),
      });

      await recordAuditEvent({
        action: "quick_operation.executed",
        entityType: "Payment",
        entityId: result.id,
        businessId: context.businessId,
        branchId: context.branchId,
        actorUserId: context.userId,
        correlationId: context.correlationId ?? null,
        metadata: {
          operationCode: definition.code,
          operationName: definition.name,
          ...(reason !== undefined ? { reason } : {}),
          originalPaymentId: result.refundOfPaymentId,
          invoiceId: result.invoiceId,
          amount: result.amount,
          method: result.method,
          type: result.type,
          status: result.status,
        },
      });

      return {
        code: definition.code,
        result,
      };
    }

    case "SI":
    case "SR": {
      const parsed = stockQuickOperationSchema.parse(input);

      const type = definition.code === "SI" ? "ISSUE" : "RECEIPT";

      const result = await createInventoryMovement(
        {
          businessId: context.businessId,
          branchId: context.branchId,
          userId: context.userId,
        },
        {
          inventoryItemId: parsed.inventoryItemId,
          quantity: parsed.quantity,
          type,
          createdById: context.userId,
          ...(reason !== undefined && {
            reason,
          }),
          ...(parsed.reference !== undefined && {
            reference: parsed.reference,
          }),
        },
      );

      await recordAuditEvent({
        action: "quick_operation.executed",
        entityType: "InventoryMovement",
        entityId: result.movement.id,
        businessId: context.businessId,
        branchId: context.branchId,
        actorUserId: context.userId,
        correlationId: context.correlationId ?? null,
        metadata: {
          operationCode: definition.code,
          operationName: definition.name,
          ...(reason !== undefined ? { reason } : {}),
          inventoryItemId: result.inventoryItem.id,
          type: result.movement.type,
          quantity: result.movement.quantity,
          resultingQuantity: result.movement.resultingQuantity,
        },
      });

      return {
        code: definition.code,
        result,
      };
    }

    default:
      throw new AppError(
        `Quick operation ${definition.code} is not implemented yet`,
        501,
      );
  }
}

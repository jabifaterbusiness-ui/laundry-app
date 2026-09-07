import type { Role } from "@prisma/client";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { hasPermission } from "../permissions/permissions.service.js";
import {
  getQuickOperationDefinition,
} from "./quick-operations.catalog.js";
import {
  executeQuickOperationSchema,
  stockQuickOperationSchema,
  transferInvoiceQuickOperationSchema,
  transferCustomerQuickOperationSchema,
  voidPaymentQuickOperationSchema,
} from "./quick-operations.validation.js";
import { transferOrder } from "../orders/orders.service.js";
import { transferCustomer } from "../customers/customers.service.js";
import { voidPayment } from "../payments/payments.service.js";
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
) {
  const definition = getQuickOperationDefinition(code);

  if (!definition) {
    throw new AppError("Unknown quick operation", 400);
  }

  const execution = executeQuickOperationSchema.parse({
    code,
    input: rawInput,
    confirmed,
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

  if (definition.sensitive && !execution.confirmed) {
    throw new AppError(
      "Confirmation is required for this quick operation",
      422,
    );
  }

  const input = execution.input;

  switch (definition.code) {
    case "TI": {
      const parsed = transferInvoiceQuickOperationSchema.parse(input);

      const result = await transferOrder(
        parsed.orderId,
        context.businessId,
        context.branchId,
        parsed.customerId,
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
        parsed.targetCustomerId,
      );

      await recordAuditEvent({
        action: "quick_operation.executed",
        entityType: "Customer",
        entityId: result.customer.id,
        businessId: context.businessId,
        actorUserId: context.userId,
        correlationId: context.correlationId ?? null,
        metadata: {
          operationCode: definition.code,
          operationName: definition.name,
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

    case "VO": {
      const parsed = voidPaymentQuickOperationSchema.parse(input);

      const result = await voidPayment(
        parsed.paymentId,
        context.businessId,
        context.branchId,
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

    case "SI":
    case "SR": {
      const parsed = stockQuickOperationSchema.parse(input);

      const type = definition.code === "SI" ? "ISSUE" : "RECEIPT";

      const result = await createInventoryMovement(
        {
          businessId: context.businessId,
          branchId: context.branchId,
        },
        {
          inventoryItemId: parsed.inventoryItemId,
          quantity: parsed.quantity,
          type,
          createdById: context.userId,
          ...(parsed.reason !== undefined && {
            reason: parsed.reason,
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

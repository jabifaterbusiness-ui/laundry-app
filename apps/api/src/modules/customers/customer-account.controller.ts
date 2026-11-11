import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  fundCustomerAccountSchema,
} from "./customer-account.validation.js";
import {
  getCustomerAccount,
  fundCustomerAccount,
} from "./customer-account.service.js";
import { customerIdParamSchema } from "./customers.validation.js";

function requireBusinessId(req: Request): string {
  if (!req.user?.businessId) {
    throw new AppError(
      "This action requires an account scoped to a business",
      403,
    );
  }

  return req.user.businessId;
}

function requireBranchId(req: Request): string {
  if (!req.branchId) {
    throw new AppError("A valid branch context is required", 400);
  }

  return req.branchId;
}

export async function getAccount(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const { id: customerId } = customerIdParamSchema.parse(req.params);

  const account = await getCustomerAccount(customerId, businessId, requireBranchId(req), req.user!.id);

  res.status(200).json(account);
}

export async function fundAccount(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id: customerId } = customerIdParamSchema.parse(req.params);
  const input = fundCustomerAccountSchema.parse(req.body);

  const transaction = await fundCustomerAccount({
    customerId,
    businessId,
    branchId,
    userId: req.user!.id,
    amount: input.amount,
    ...(input.note !== undefined && {
      note: input.note,
    }),
  });

  await recordAuditEvent({
    action: "customer.account.funded",
    entityType: "CustomerAccountTransaction",
    entityId: transaction.id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      customerId,
      amount: transaction.amount,
      type: transaction.type,
      note: transaction.note,
    },
  });

  res.status(201).json(transaction);
}

import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { executeQuickOperationSchema } from "./quick-operations.validation.js";
import { executeQuickOperation } from "./quick-operations.service.js";

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
    throw new AppError(
      "A valid branch context is required",
      400,
    );
  }

  return req.branchId;
}

export async function execute(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const input = executeQuickOperationSchema.parse(req.body);

  const result = await executeQuickOperation(
    {
      userId: req.user!.id,
      role: req.user!.securityRole,
      businessId,
      branchId,
      correlationId: req.correlationId ?? null,
    },
    input.code,
    input.input,
    input.confirmed,
    input.reason,
  );

  res.status(200).json({
    data: result,
  });
}

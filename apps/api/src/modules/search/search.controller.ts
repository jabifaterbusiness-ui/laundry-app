import type { Request, Response } from "express";
import { globalSearch } from "./search.service.js";
import { globalSearchQuerySchema } from "./search.validation.js";
import { AppError } from "../../middleware/error-handler.js";

function requireBusinessId(req: Request): string {
  const businessId = req.user?.businessId;

  if (!businessId) {
    throw new AppError("Business context is required", 403);
  }

  return businessId;
}

function requireBranchId(req: Request): string {
  if (!req.branchId) {
    throw new AppError("Branch context is required", 400);
  }

  return req.branchId;
}

export async function search(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const query = globalSearchQuerySchema.parse(req.query);

  const results = await globalSearch(
    req.user!.id,
    req.user!.securityRole,
    businessId,
    branchId,
    query,
  );

  res.status(200).json({
    data: results,
  });
}

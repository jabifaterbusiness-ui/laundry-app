import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import {
  invoiceIdParamSchema,
} from "./invoices.validation.js";
import {
  getCompanyReceipt,
  getCustomerReceipt,
} from "./receipts.service.js";

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

export async function customerReceipt(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = invoiceIdParamSchema.parse(req.params);

  const receipt = await getCustomerReceipt(
    id,
    businessId,
    branchId,
  );

  if (!receipt) {
    throw new AppError("Invoice not found", 404);
  }

  res.status(200).json(receipt);
}

export async function companyReceipt(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = invoiceIdParamSchema.parse(req.params);

  const receipt = await getCompanyReceipt(
    id,
    businessId,
    branchId,
  );

  if (!receipt) {
    throw new AppError("Invoice not found", 404);
  }

  res.status(200).json(receipt);
}

import type { Request, Response } from "express";

import { LoanStatus } from "@prisma/client";

import { AppError } from "../../middleware/error-handler.js";

import {
  approveLoan,
  cancelLoan,
  createLoan,
  getLoan,
  listLoans,
  rejectLoan,
} from "./loans.service.js";

import { createLoanSchema, rejectLoanSchema } from "./loans.validation.js";

function businessId(req: Request) {
  if (!req.user?.businessId) {
    throw new AppError(
      "This action requires an account scoped to a business",
      403,
    );
  }

  return req.user.businessId;
}

function branchId(req: Request) {
  if (!req.branchId) {
    throw new AppError("Missing branch context", 400);
  }

  return req.branchId;
}

export async function createLoanController(req: Request, res: Response) {
  const parsed = createLoanSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Invalid loan data", 400);
  }

  const result = await createLoan({
    businessId: businessId(req),
    branchId: branchId(req),
    employeeId: parsed.data.employeeId,
    principalAmount: parsed.data.principalAmount,
    ...(parsed.data.reason !== undefined
      ? { reason: parsed.data.reason }
      : {}),
  });

  res.status(201).json(result);
}

export async function listLoansController(req: Request, res: Response) {
  const status =
    typeof req.query.status === "string" &&
    Object.values(LoanStatus).includes(req.query.status as LoanStatus)
      ? (req.query.status as LoanStatus)
      : undefined;

  const employeeId =
    typeof req.query.employeeId === "string"
      ? req.query.employeeId
      : undefined;

  const result = await listLoans({
    businessId: businessId(req),
    branchId: branchId(req),
    ...(employeeId !== undefined ? { employeeId } : {}),
    ...(status !== undefined ? { status } : {}),
  });

  res.json(result);
}

export async function getLoanController(req: Request, res: Response) {
  const result = await getLoan({
    businessId: businessId(req),
    branchId: branchId(req),
    id: req.params.id!,
  });

  res.json(result);
}

export async function approveLoanController(req: Request, res: Response) {
  const result = await approveLoan({
    businessId: businessId(req),
    branchId: branchId(req),
    id: req.params.id!,
    actorUserId: req.user!.id,
  });

  res.json(result);
}

export async function rejectLoanController(req: Request, res: Response) {
  const parsed = rejectLoanSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    throw new AppError("Invalid rejection data", 400);
  }

  const result = await rejectLoan({
    businessId: businessId(req),
    branchId: branchId(req),
    id: req.params.id!,
    actorUserId: req.user!.id,
    ...(parsed.data.reason !== undefined
      ? { reason: parsed.data.reason }
      : {}),
  });

  res.json(result);
}

export async function cancelLoanController(req: Request, res: Response) {
  const result = await cancelLoan({
    businessId: businessId(req),
    branchId: branchId(req),
    id: req.params.id!,
    actorUserId: req.user!.id,
  });

  res.json(result);
}

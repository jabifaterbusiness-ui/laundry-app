import type { Request, Response } from "express";

import {
  FinancialRepaymentStatus,
  FinancialRepaymentType,
} from "@prisma/client";

import { AppError } from "../../middleware/error-handler.js";
import { requireReason } from "../../lib/reason.js";

import {
  createRepayment,
  getRepayment,
  listRepayments,
  listRepaymentSources,
  voidRepayment,
} from "./repayments.service.js";

import { createRepaymentSchema } from "./repayments.validation.js";

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

export async function createRepaymentController(
  req: Request,
  res: Response,
) {
  const parsed = createRepaymentSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Invalid repayment data", 400);
  }

  const result = await createRepayment({
    businessId: businessId(req),
    branchId: branchId(req),
    employeeId: parsed.data.employeeId,
    type: parsed.data.type,
    ...(parsed.data.iouId !== undefined
      ? { iouId: parsed.data.iouId }
      : {}),
    ...(parsed.data.loanId !== undefined
      ? { loanId: parsed.data.loanId }
      : {}),
    amount: parsed.data.amount,
    method: parsed.data.method,
    ...(parsed.data.reference !== undefined
      ? { reference: parsed.data.reference }
      : {}),
    ...(parsed.data.note !== undefined
      ? { note: parsed.data.note }
      : {}),
    actorUserId: req.user!.id,
  });

  res.status(201).json(result);
}

export async function listRepaymentsController(
  req: Request,
  res: Response,
) {
  const type =
    typeof req.query.type === "string" &&
    Object.values(FinancialRepaymentType).includes(
      req.query.type as FinancialRepaymentType,
    )
      ? (req.query.type as FinancialRepaymentType)
      : undefined;

  const status =
    typeof req.query.status === "string" &&
    Object.values(FinancialRepaymentStatus).includes(
      req.query.status as FinancialRepaymentStatus,
    )
      ? (req.query.status as FinancialRepaymentStatus)
      : undefined;

  const employeeId =
    typeof req.query.employeeId === "string"
      ? req.query.employeeId
      : undefined;

  const iouId =
    typeof req.query.iouId === "string"
      ? req.query.iouId
      : undefined;

  const loanId =
    typeof req.query.loanId === "string"
      ? req.query.loanId
      : undefined;

  const result = await listRepayments({
    businessId: businessId(req),
    branchId: branchId(req),
    ...(employeeId !== undefined ? { employeeId } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(iouId !== undefined ? { iouId } : {}),
    ...(loanId !== undefined ? { loanId } : {}),
  });

  res.json(result);
}

export async function listRepaymentSourcesController(
  req: Request,
  res: Response,
) {
  const employeeId = req.query.employeeId;
  const type = req.query.type;

  if (
    typeof employeeId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId) ||
    typeof type !== "string" ||
    !Object.values(FinancialRepaymentType).includes(type as FinancialRepaymentType)
  ) {
    throw new AppError("A valid employeeId and repayment type are required", 400);
  }

  const result = await listRepaymentSources({
    businessId: businessId(req),
    branchId: branchId(req),
    employeeId,
    type: type as FinancialRepaymentType,
  });

  res.status(200).json(result);
}

export async function getRepaymentController(
  req: Request,
  res: Response,
) {
  const result = await getRepayment({
    businessId: businessId(req),
    branchId: branchId(req),
    id: req.params.id!,
  });

  res.json(result);
}

export async function voidRepaymentController(
  req: Request,
  res: Response,
) {
  const result = await voidRepayment({
    businessId: businessId(req),
    branchId: branchId(req),
    id: req.params.id!,
    actorUserId: req.user!.id,
    reason: requireReason(
      (req.body as { reason?: unknown }).reason,
    ),
  });

  res.json(result);
}

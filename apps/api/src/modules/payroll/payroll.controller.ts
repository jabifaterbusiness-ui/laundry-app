import type { Request, Response } from "express";

import { AppError } from "../../middleware/error-handler.js";

import {
  createPayrollPeriod,
  finalizePayroll,
  generatePayroll,
  getPayrollPeriod,
  listPayrollPeriods,
} from "./payroll.service.js";

import { processPayrollDeductions } from "./payroll-deductions.service.js";

import { createPayrollPeriodSchema } from "./payroll.validation.js";

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
    throw new AppError(
      "This action requires a selected branch context",
      400,
    );
  }

  return req.branchId;
}

export async function createPayrollPeriodController(
  req: Request,
  res: Response,
) {
  const parsed = createPayrollPeriodSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Invalid payroll period data", 400);
  }

  const result = await createPayrollPeriod({
    businessId: businessId(req),
    branchId: branchId(req),
    periodStart: parsed.data.periodStart,
    periodEnd: parsed.data.periodEnd,
    actorUserId: req.user!.id,
  });

  res.status(201).json(result);
}

export async function listPayrollPeriodsController(
  req: Request,
  res: Response,
) {
  const result = await listPayrollPeriods({
    businessId: businessId(req),
    branchId: branchId(req),
  });

  res.json(result);
}

export async function getPayrollPeriodController(
  req: Request,
  res: Response,
) {
  const result = await getPayrollPeriod({
    businessId: businessId(req),
    branchId: branchId(req),
    id: req.params.id!,
  });

  res.json(result);
}

export async function finalizePayrollController(
  req: Request,
  res: Response,
) {
  const result = await finalizePayroll({
    businessId: businessId(req),
    branchId: branchId(req),
    payrollPeriodId: req.params.id!,
    actorUserId: req.user!.id,
  });

  res.json(result);
}

export async function generatePayrollController(
  req: Request,
  res: Response,
) {
  const result = await generatePayroll({
    businessId: businessId(req),
    branchId: branchId(req),
    payrollPeriodId: req.params.id!,
    actorUserId: req.user!.id,
  });

  res.json(result);
}


export async function processPayrollDeductionsController(
  req: Request,
  res: Response,
) {
  const result = await processPayrollDeductions({
    businessId: businessId(req),
    branchId: branchId(req),
    payrollPeriodId: req.params.id!,
    actorUserId: req.user!.id,
  });

  res.json(result);
}

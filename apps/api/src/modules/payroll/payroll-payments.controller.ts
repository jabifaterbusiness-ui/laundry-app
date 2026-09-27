import type { Request, Response } from "express";

import { AppError } from "../../middleware/error-handler.js";
import { requireReason } from "../../lib/reason.js";

import {
  createPayrollPayment,
  getPayrollPayment,
  listPayrollPayments,
  voidPayrollPayment,
} from "./payroll-payments.service.js";

import {
  createPayrollPaymentSchema,
  listPayrollPaymentsQuerySchema,
} from "./payroll-payments.validation.js";

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

export async function createPayrollPaymentController(
  req: Request,
  res: Response,
) {
  const parsed = createPayrollPaymentSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Invalid payroll payment data", 400);
  }

  const result = await createPayrollPayment({
    businessId: businessId(req),
    branchId: branchId(req),
    payrollRecordId: parsed.data.payrollRecordId,
    employeeId: parsed.data.employeeId,
    amount: parsed.data.amount,
    method: parsed.data.method,
    ...(parsed.data.reference !== undefined && {
      reference: parsed.data.reference,
    }),
    ...(parsed.data.note !== undefined && {
      note: parsed.data.note,
    }),
    actorUserId: req.user!.id,
  });

  res.status(201).json(result);
}

export async function getPayrollPaymentController(
  req: Request,
  res: Response,
) {
  const result = await getPayrollPayment(
    req.params.id!,
    businessId(req),
    branchId(req),
  );

  if (!result) {
    throw new AppError("Payroll payment not found", 404);
  }

  res.json(result);
}

export async function listPayrollPaymentsController(
  req: Request,
  res: Response,
) {
  const parsed = listPayrollPaymentsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Invalid payroll payment filters", 400);
  }

  const result = await listPayrollPayments({
    businessId: businessId(req),
    branchId: branchId(req),
    ...(parsed.data.payrollRecordId !== undefined && {
      payrollRecordId: parsed.data.payrollRecordId,
    }),
    ...(parsed.data.employeeId !== undefined && {
      employeeId: parsed.data.employeeId,
    }),
    ...(parsed.data.status !== undefined && {
      status: parsed.data.status,
    }),
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  });

  res.json(result);
}

export async function voidPayrollPaymentController(
  req: Request,
  res: Response,
) {
  const result = await voidPayrollPayment(
    req.params.id!,
    businessId(req),
    branchId(req),
    req.user!.id,
    requireReason((req.body as { reason?: unknown }).reason),
  );

  res.json(result);
}

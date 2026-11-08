import type { Request, Response } from "express";

import { AppError } from "../../middleware/error-handler.js";

import {
  assignLegacyCompensationToBranch,
  createCompensation,
  getCompensation,
  getCurrentCompensation,
  listCompensation,
  listUnassignedLegacyCompensation,
} from "./compensation.service.js";

import { createCompensationSchema } from "./compensation.validation.js";

function branchId(req: Request) {
  if (!req.branchId) throw new AppError("A valid branch context is required", 400);
  return req.branchId;
}

function businessId(req: Request) {
  if (!req.user?.businessId) {
    throw new AppError(
      "This action requires an account scoped to a business",
      403,
    );
  }

  return req.user.businessId;
}

export async function listUnassignedLegacyCompensationController(
  req: Request,
  res: Response,
) {
  if (req.user?.securityRole !== "BUSINESS_OWNER") {
    throw new AppError(
      "Only a business owner can review unassigned legacy compensation",
      403,
    );
  }

  const result = await listUnassignedLegacyCompensation({
    businessId: businessId(req),
  });

  res.json(result);
}

export async function assignLegacyCompensationController(
  req: Request,
  res: Response,
) {
  const result = await assignLegacyCompensationToBranch({
    businessId: businessId(req),
    branchId: branchId(req),
    id: req.params.id!,
    actorUserId: req.user!.id,
  });

  res.json(result);
}

export async function createCompensationController(
  req: Request,
  res: Response,
) {
  const parsed = createCompensationSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Invalid compensation data", 400);
  }

  const result = await createCompensation({
    businessId: businessId(req),
    branchId: branchId(req),
    employeeId: parsed.data.employeeId,
    basicSalary: parsed.data.basicSalary,
    effectiveFrom: parsed.data.effectiveFrom,
    actorUserId: req.user!.id,
  });

  res.status(201).json(result);
}

export async function listCompensationController(req: Request, res: Response) {
  const employeeId =
    typeof req.query.employeeId === "string" ? req.query.employeeId : undefined;

  const result = await listCompensation({
    businessId: businessId(req),
    branchId: branchId(req),
    userId: req.user!.id,
    ...(employeeId !== undefined ? { employeeId } : {}),
  });

  res.json(result);
}

export async function getCompensationController(req: Request, res: Response) {
  const result = await getCompensation({
    businessId: businessId(req),
    branchId: branchId(req),
    id: req.params.id!,
    userId: req.user!.id,
  });

  res.json(result);
}

export async function getCurrentCompensationController(
  req: Request,
  res: Response,
) {
  const effectiveDate =
    typeof req.query.effectiveDate === "string"
      ? new Date(req.query.effectiveDate)
      : new Date();

  if (Number.isNaN(effectiveDate.getTime())) {
    throw new AppError("Invalid effective date", 400);
  }

  const result = await getCurrentCompensation({
    businessId: businessId(req),
    branchId: branchId(req),
    employeeId: req.params.employeeId!,
    userId: req.user!.id,
    effectiveDate,
  });

  res.json(result);
}

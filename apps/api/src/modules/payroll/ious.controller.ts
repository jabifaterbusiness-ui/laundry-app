import type { Request, Response } from "express";

import { IOUStatus } from "@prisma/client";

import { AppError } from "../../middleware/error-handler.js";

import {
  approveIOU,
  cancelIOU,
  createIOU,
  getIOU,
  listIOUs,
  rejectIOU,
} from "./ious.service.js";

import { createIOUSchema, rejectIOUSchema } from "./ious.validation.js";

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

export async function createIOUController(req: Request, res: Response) {
  const parsed = createIOUSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Invalid IOU data", 400);
  }

  const result = await createIOU({
    businessId: businessId(req),
    branchId: branchId(req),
    employeeId: parsed.data.employeeId,
    amount: parsed.data.amount,
    ...(parsed.data.reason !== undefined
      ? { reason: parsed.data.reason }
      : {}),
  });

  res.status(201).json(result);
}

export async function listIOUsController(req: Request, res: Response) {
  const status =
    typeof req.query.status === "string" &&
    Object.values(IOUStatus).includes(req.query.status as IOUStatus)
      ? (req.query.status as IOUStatus)
      : undefined;

  const employeeId =
    typeof req.query.employeeId === "string"
      ? req.query.employeeId
      : undefined;

  const result = await listIOUs({
    businessId: businessId(req),
    branchId: branchId(req),
    ...(employeeId !== undefined ? { employeeId } : {}),
    ...(status !== undefined ? { status } : {}),
  });

  res.json(result);
}

export async function getIOUController(req: Request, res: Response) {
  const result = await getIOU({
    businessId: businessId(req),
    branchId: branchId(req),
    id: req.params.id!,
  });

  res.json(result);
}

export async function approveIOUController(req: Request, res: Response) {
  const result = await approveIOU({
    businessId: businessId(req),
    branchId: branchId(req),
    id: req.params.id!,
    actorUserId: req.user!.id,
  });

  res.json(result);
}

export async function rejectIOUController(req: Request, res: Response) {
  const parsed = rejectIOUSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    throw new AppError("Invalid rejection data", 400);
  }

  const result = await rejectIOU({
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

export async function cancelIOUController(req: Request, res: Response) {
  const parsed = rejectIOUSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    throw new AppError("Invalid cancellation data", 400);
  }

  const result = await cancelIOU({
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

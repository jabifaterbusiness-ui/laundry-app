import type { Request, Response } from "express";
import { ExpenseCategory, ExpenseStatus } from "@prisma/client";

import { AppError } from "../../middleware/error-handler.js";

import {
  approveExpense,
  createExpense,
  getExpense,
  listExpenses,
  recognizeExpense,
  rejectExpense,
  voidExpense,
} from "./expenses.service.js";

import {
  createExpenseSchema,
  rejectExpenseSchema,
} from "./expenses.validation.js";

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

export async function createExpenseController(req: Request, res: Response) {
  const parsed = createExpenseSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Invalid expense data", 400);
  }

  const result = await createExpense({
    businessId: businessId(req),
    branchId: branchId(req),
    actorUserId: req.user!.id,
    category: parsed.data.category,
    description: parsed.data.description,
    amount: parsed.data.amount,
    incurredAt: parsed.data.incurredAt,
    ...(parsed.data.reference !== undefined
      ? { reference: parsed.data.reference }
      : {}),
    ...(parsed.data.note !== undefined
      ? { note: parsed.data.note }
      : {}),
  });

  res.status(201).json(result);
}

export async function listExpensesController(req: Request, res: Response) {
  const category =
    typeof req.query.category === "string" &&
    Object.values(ExpenseCategory).includes(
      req.query.category as ExpenseCategory,
    )
      ? (req.query.category as ExpenseCategory)
      : undefined;

  const status =
    typeof req.query.status === "string" &&
    Object.values(ExpenseStatus).includes(req.query.status as ExpenseStatus)
      ? (req.query.status as ExpenseStatus)
      : undefined;

  const result = await listExpenses(
    {
      businessId: businessId(req),
      branchId: branchId(req),
    },
    {
      ...(category !== undefined ? { category } : {}),
      ...(status !== undefined ? { status } : {}),
    },
  );

  res.json(result);
}

export async function getExpenseController(req: Request, res: Response) {
  const result = await getExpense({
    businessId: businessId(req),
    branchId: branchId(req),
    id: req.params.id!,
  });

  res.json(result);
}

export async function approveExpenseController(
  req: Request,
  res: Response,
) {
  const result = await approveExpense({
    businessId: businessId(req),
    branchId: branchId(req),
    id: req.params.id!,
    actorUserId: req.user!.id,
  });

  res.json(result);
}

export async function rejectExpenseController(
  req: Request,
  res: Response,
) {
  const parsed = rejectExpenseSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    throw new AppError("Invalid rejection data", 400);
  }

  const result = await rejectExpense({
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

export async function recognizeExpenseController(
  req: Request,
  res: Response,
) {
  const result = await recognizeExpense({
    businessId: businessId(req),
    branchId: branchId(req),
    id: req.params.id!,
    actorUserId: req.user!.id,
  });

  res.json(result);
}

export async function voidExpenseController(
  req: Request,
  res: Response,
) {
  const result = await voidExpense({
    businessId: businessId(req),
    branchId: branchId(req),
    id: req.params.id!,
    actorUserId: req.user!.id,
  });

  res.json(result);
}

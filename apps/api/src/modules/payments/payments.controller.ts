import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { requireReason } from "../../lib/reason.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  createPaymentSchema,
  invoicePaymentParamSchema,
  listPaymentsQuerySchema,
  paymentIdParamSchema,
} from "./payments.validation.js";
import {
  createPayment,
  getInvoicePaymentSummary,
  getPaymentForBranch,
  listPayments,
  voidPayment,
} from "./payments.service.js";

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

export async function create(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const input = createPaymentSchema.parse(req.body);

  const payment = await createPayment({
    businessId,
    branchId,
    invoiceId: input.invoiceId,
    amount: input.amount,
    method: input.method,
    ...(input.reference !== undefined && {
      reference: input.reference,
    }),
    ...(input.note !== undefined && {
      note: input.note,
    }),
  });

  await recordAuditEvent({
    action: "payment.created",
    entityType: "Payment",
    entityId: payment.id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      invoiceId: payment.invoiceId,
      amount: payment.amount,
      method: payment.method,
      status: payment.status,
    },
  });

  res.status(201).json(payment);
}

export async function list(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const query = listPaymentsQuerySchema.parse(req.query);

  const result = await listPayments({
    businessId,
    branchId,
    page: query.page,
    pageSize: query.pageSize,
    ...(query.invoiceId !== undefined && {
      invoiceId: query.invoiceId,
    }),
    ...(query.status !== undefined && {
      status: query.status,
    }),
    ...(query.search !== undefined && { search: query.search }),
  });

  res.status(200).json(result);
}

export async function getOne(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = paymentIdParamSchema.parse(req.params);

  const payment = await getPaymentForBranch(
    id,
    businessId,
    branchId,
  );

  if (!payment) {
    throw new AppError("Payment not found", 404);
  }

  res.status(200).json(payment);
}

export async function getInvoiceSummary(
  req: Request,
  res: Response,
) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { invoiceId } = invoicePaymentParamSchema.parse(req.params);

  const summary = await getInvoicePaymentSummary(
    invoiceId,
    businessId,
    branchId,
  );

  res.status(200).json(summary);
}

export async function voidPaymentController(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = paymentIdParamSchema.parse(req.params);
  const reason = requireReason(
    (req.body as { reason?: unknown }).reason,
  );

  const payment = await voidPayment(
    id,
    businessId,
    branchId,
    reason,
  );

  await recordAuditEvent({
    action: "payment.voided",
    entityType: "Payment",
    entityId: payment.id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      invoiceId: payment.invoiceId,
      amount: payment.amount,
      method: payment.method,
      status: payment.status,
      reason,
    },
  });

  res.status(200).json(payment);
}

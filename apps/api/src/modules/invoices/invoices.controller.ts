import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { updateInvoiceFinancialRulesSchema } from "./invoice-financial-rules.validation.js";
import { updateInvoiceFinancialRules } from "./invoice-financial-rules.service.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  createInvoiceSchema,
  invoiceIdParamSchema,
  invoiceOrderParamSchema,
  listInvoicesQuerySchema,
  transferInvoiceCorrectionSchema,
  updateInvoiceCorrectionSchema,
  voidInvoiceCorrectionSchema,
} from "./invoices.validation.js";
import {
  createInvoice,
  getInvoiceForBranch,
  getInvoiceForOrder,
  listInvoices,
} from "./invoices.service.js";
import {
  deleteInvoiceWithCorrection,
  listInvoiceHistory,
  transferInvoiceWithCorrection,
  updateInvoiceWithCorrection,
  voidInvoiceWithCorrection,
} from "./invoice-corrections.service.js";

function requireBusinessId(req: Request): string {
  if (!req.user?.businessId) {
    throw new AppError(
      "This action requires an account scoped to a business",
      403,
    );
  }

  return req.user.businessId;
}

async function assertInvoiceVisibleToBranch(
  invoiceId: string,
  businessId: string,
  branchId: string,
  userId: string,
) {
  const invoice = await getInvoiceForBranch(invoiceId, businessId, branchId, userId);
  if (!invoice) throw new AppError("Invoice not found", 404);
  return invoice;
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
  const input = createInvoiceSchema.parse(req.body);

  const invoice = await createInvoice({
    businessId,
    branchId,
    orderId: input.orderId,
    customerAgreement: input.customerAgreement,
    actorUserId: req.user!.id,
  });

  await recordAuditEvent({
    action: "invoice.created",
    entityType: "Invoice",
    entityId: invoice.id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      invoiceNumber: invoice.invoiceNumber,
      orderId: invoice.orderId,
      totalAmount: invoice.totalAmount,
    },
  });

  res.status(201).json(invoice);
}

export async function list(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const query = listInvoicesQuerySchema.parse(req.query);

  const result = await listInvoices({
    businessId,
    branchId,
    userId: req.user!.id,
    page: query.page,
    pageSize: query.pageSize,
    ...(query.status !== undefined && {
      status: query.status,
    }),
    ...(query.customerId !== undefined && {
      customerId: query.customerId,
    }),
  });

  res.status(200).json(result);
}

export async function getOne(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = invoiceIdParamSchema.parse(req.params);

  const invoice = await getInvoiceForBranch(
    id,
    businessId,
    branchId,
    req.user!.id,
  );

  if (!invoice) {
    throw new AppError("Invoice not found", 404);
  }

  res.status(200).json(invoice);
}

export async function getByOrder(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { orderId } = invoiceOrderParamSchema.parse(req.params);

  const invoice = await getInvoiceForOrder(
    orderId,
    businessId,
    branchId,
    req.user!.id,
  );

  if (!invoice) {
    throw new AppError("Invoice not found", 404);
  }

  res.status(200).json(invoice);
}


export async function update(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = invoiceIdParamSchema.parse(req.params);
  await assertInvoiceVisibleToBranch(id, businessId, branchId, req.user!.id);
  const input = updateInvoiceCorrectionSchema.parse(req.body);

  const result = await updateInvoiceWithCorrection({
    invoiceId: id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    reason: input.reason,
    input: {
      ...(input.garmentNote !== undefined && {
        garmentNote: input.garmentNote,
      }),
      ...(input.internalNote !== undefined && {
        internalNote: input.internalNote,
      }),
      ...(input.customerAgreement !== undefined && {
        customerAgreement: input.customerAgreement,
      }),
      ...(input.items !== undefined && {
        items: input.items,
      }),
    },
  });

  await recordAuditEvent({
    action: "invoice.updated",
    entityType: "Invoice",
    entityId: result.invoice.id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      invoiceNumber: result.invoice.invoiceNumber,
      reason: result.reason,
      historyId: result.history.id,
      before: result.before,
      after: result.after,
    },
  });

  res.status(200).json(result.invoice);
}

export async function voidInvoice(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = invoiceIdParamSchema.parse(req.params);
  await assertInvoiceVisibleToBranch(id, businessId, branchId, req.user!.id);
  const input = voidInvoiceCorrectionSchema.parse(req.body);

  const result = await voidInvoiceWithCorrection({
    invoiceId: id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    reason: input.reason,
  });

  await recordAuditEvent({
    action: "invoice.voided",
    entityType: "Invoice",
    entityId: result.invoice.id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      invoiceNumber: result.invoice.invoiceNumber,
      reason: result.reason,
      historyId: result.history.id,
      before: result.before,
      after: result.after,
    },
  });

  res.status(200).json(result.invoice);
}

export async function deleteInvoice(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = invoiceIdParamSchema.parse(req.params);
  await assertInvoiceVisibleToBranch(id, businessId, branchId, req.user!.id);
  const input = voidInvoiceCorrectionSchema.parse(req.body);

  const result = await deleteInvoiceWithCorrection({
    invoiceId: id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    reason: input.reason,
  });

  await recordAuditEvent({
    action: "invoice.deleted",
    entityType: "Invoice",
    entityId: result.invoice.id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      invoiceNumber: result.invoice.invoiceNumber,
      reason: result.reason,
      historyId: result.history.id,
      before: result.before,
      after: result.after,
      deletionType: "logical",
    },
  });

  res.status(200).json(result.invoice);
}

export async function transfer(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = invoiceIdParamSchema.parse(req.params);
  await assertInvoiceVisibleToBranch(id, businessId, branchId, req.user!.id);
  const input = transferInvoiceCorrectionSchema.parse(req.body);

  const result = await transferInvoiceWithCorrection({
    invoiceId: id,
    customerId: input.customerId,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    reason: input.reason,
  });

  await recordAuditEvent({
    action: "invoice.transferred",
    entityType: "Invoice",
    entityId: result.invoice.id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      invoiceNumber: result.invoice.invoiceNumber,
      previousCustomerId: result.previousCustomerId,
      newCustomerId: result.newCustomerId,
      reason: result.reason,
      historyId: result.history.id,
      before: result.before,
      after: result.after,
    },
  });

  res.status(200).json(result.invoice);
}

export async function history(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = invoiceIdParamSchema.parse(req.params);
  await assertInvoiceVisibleToBranch(id, businessId, branchId, req.user!.id);

  const result = await listInvoiceHistory({
    invoiceId: id,
    businessId,
    branchId,
  });

  res.status(200).json(result);
}


export async function updateFinancialRules(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = invoiceIdParamSchema.parse(req.params);
  await assertInvoiceVisibleToBranch(id, businessId, branchId, req.user!.id);
  const input = updateInvoiceFinancialRulesSchema.parse(req.body);
  const result = await updateInvoiceFinancialRules({
    invoiceId: id, businessId, branchId, actorUserId: req.user!.id,
    reason: input.reason,
    adjustments: input.adjustments.map((rule) => ({
      adjustmentId: rule.adjustmentId, scope: rule.scope,
      ...(rule.itemIndexes !== undefined ? { itemIndexes: rule.itemIndexes } : {}),
    })),
    taxRuleIds: input.taxRuleIds,
  });
  await recordAuditEvent({
    action: "invoice.financial_rules_updated",
    entityType: "Invoice",
    entityId: result.invoice.id,
    businessId,
    branchId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      invoiceNumber: result.invoice.invoiceNumber,
      reason: result.reason,
      historyId: result.history.id,
      before: result.before,
      after: result.after,
    },
  });
  res.status(200).json(result.invoice);
}

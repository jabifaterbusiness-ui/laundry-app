import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  createInvoiceSchema,
  invoiceIdParamSchema,
  invoiceOrderParamSchema,
  listInvoicesQuerySchema,
} from "./invoices.validation.js";
import {
  createInvoice,
  getInvoiceForBranch,
  getInvoiceForOrder,
  listInvoices,
} from "./invoices.service.js";

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
  const input = createInvoiceSchema.parse(req.body);

  const invoice = await createInvoice({
    businessId,
    branchId,
    orderId: input.orderId,
    customerAgreement: input.customerAgreement,
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
  );

  if (!invoice) {
    throw new AppError("Invoice not found", 404);
  }

  res.status(200).json(invoice);
}

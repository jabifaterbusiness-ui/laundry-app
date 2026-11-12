import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  createCustomerSchema,
  customerIdParamSchema,
  listCustomersQuerySchema,
  normalizePhone,
  updateCustomerSchema,
  changeCustomerStatusSchema,
  legacyCustomerReviewQuerySchema,
  assignLegacyCustomerOwnerSchema,
  assignLegacyCustomersBulkSchema,
} from "./customers.validation.js";
import {
  createCustomer,
  findPossibleDuplicates,
  getCustomerForBusiness,
  listCustomers,
  setCustomerLifecycleStatus,
  updateCustomer,
  listUnassignedLegacyCustomers,
  assignLegacyCustomerOwnerBranch,
  assignLegacyCustomerOwnersBulk,
} from "./customers.service.js";

/**
 * Every handler below reads businessId ONLY from req.user (populated by
 * requireAuth from the verified access token) - never from req.body,
 * req.query, or req.params. This is the enforcement point for the
 * LOCKED tenant-isolation decision at the Customers module boundary.
 */
function requireBranchId(req: Request): string {
  if (!req.branchId) throw new AppError("A valid branch context is required", 400);
  return req.branchId;
}

function requireBusinessId(req: Request): string {
  if (!req.user?.businessId) {
    throw new AppError("This action requires an account scoped to a business", 403);
  }
  return req.user.businessId;
}

export async function create(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const input = createCustomerSchema.parse(req.body);
  const normalizedPhone = normalizePhone(input.phone);

  if (!input.confirmDuplicate) {
    const duplicates = await findPossibleDuplicates(businessId, branchId, req.user!.id, normalizedPhone);
    if (duplicates.length > 0) {
      res.status(409).json({
        error: {
          message: "A customer with this phone number may already exist. Resubmit with confirmDuplicate: true to create anyway.",
          duplicates,
        },
      });
      return;
    }
  }

  const customer = await createCustomer({
  businessId,
  branchId,
  name: input.name,
  phone: normalizedPhone,
  ...(input.email !== undefined && { email: input.email }),
  ...(input.address !== undefined && { address: input.address }),
  ...(input.notes !== undefined && { notes: input.notes }),
  whatsappOptIn: input.whatsappOptIn,
  ...(input.whatsappOptInSource !== undefined && { whatsappOptInSource: input.whatsappOptInSource }),
});

  await recordAuditEvent({
    action: "customer.created",
    entityType: "Customer",
    entityId: customer.id,
    businessId,
    actorUserId: req.user!.id,
    branchId,
    correlationId: req.correlationId ?? null,
    metadata: { name: customer.name },
  });

  res.status(201).json(customer);
}

export async function list(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const query = listCustomersQuerySchema.parse(req.query);

  const result = await listCustomers({
  businessId,
  branchId,
  userId: req.user!.id,
  status: query.status,
  page: query.page,
  pageSize: query.pageSize,
  ...(query.search !== undefined && { search: query.search }),
});
  res.status(200).json(result);
}

export async function getOne(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = customerIdParamSchema.parse(req.params);

  const customer = await getCustomerForBusiness(id, businessId, branchId, req.user!.id);
  if (!customer) {
    throw new AppError("Customer not found", 404);
  }

  res.status(200).json(customer);
}

export async function update(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = customerIdParamSchema.parse(req.params);
  const { confirmDuplicate, ...fields } = updateCustomerSchema.parse(req.body);

  const normalizedPhone = fields.phone !== undefined ? normalizePhone(fields.phone) : undefined;

  // Same soft duplicate policy as create (see docs/CUSTOMERS.md section
  // E): only runs when the phone is actually being changed, excludes
  // this customer's own record from the match set, and is scoped to the
  // authenticated businessId only - never a client-supplied one. On a
  // 409 the update is not performed and no audit event is written,
  // since nothing actually changed yet.
  if (normalizedPhone !== undefined && !confirmDuplicate) {
    const duplicates = await findPossibleDuplicates(businessId, branchId, req.user!.id, normalizedPhone, id);
    if (duplicates.length > 0) {
      res.status(409).json({
        error: {
          message: "A customer with this phone number may already exist. Resubmit with confirmDuplicate: true to update anyway.",
          duplicates,
        },
      });
      return;
    }
  }

const patch = {
  ...(fields.name !== undefined && { name: fields.name }),
  ...(fields.email !== undefined && { email: fields.email }),
  ...(fields.address !== undefined && { address: fields.address }),
  ...(fields.notes !== undefined && { notes: fields.notes }),
  ...(normalizedPhone !== undefined && { phone: normalizedPhone }),
  ...(fields.whatsappOptIn !== undefined && { whatsappOptIn: fields.whatsappOptIn }),
  ...(fields.whatsappOptInSource !== undefined && { whatsappOptInSource: fields.whatsappOptInSource }),
};

const existingCustomer = await getCustomerForBusiness(id, businessId, branchId, req.user!.id);
if (!existingCustomer) {
  throw new AppError("Customer not found", 404);
}

const customer = await updateCustomer(id, businessId, branchId, req.user!.id, patch);

const before: Record<string, unknown> = {};
const after: Record<string, unknown> = {};

for (const field of Object.keys(patch) as Array<keyof typeof patch>) {
    const oldValue = existingCustomer[field];
    const newValue = customer?.[field];

    if (oldValue !== newValue) {
      before[field] = oldValue;
      after[field] = newValue;
    }
  }

  await recordAuditEvent({
    action: "customer.updated",
    entityType: "Customer",
    entityId: id,
    businessId,
    actorUserId: req.user!.id,
    branchId,
    correlationId: req.correlationId ?? null,
    metadata: {
      changedFields: Object.keys(after),
      before,
      after,
    },
  });

  res.status(200).json(customer);
}

export async function changeStatus(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = customerIdParamSchema.parse(req.params);
  const input = changeCustomerStatusSchema.parse(req.body);

  const result = await setCustomerLifecycleStatus(
    id,
    businessId,
    branchId,
    req.user!.id,
    input.status,
    input.reason,
    req.user!.id,
  );

  await recordAuditEvent({
    action: "customer.status_changed",
    entityType: "Customer",
    entityId: id,
    businessId,
    actorUserId: req.user!.id,
    branchId,
    correlationId: req.correlationId ?? null,
    metadata: {
      previousStatus: result.previousStatus,
      newStatus: input.status,
      reason: input.reason,
    },
  });

  res.status(200).json(result.customer);
}

function requireBusinessOwner(req: Request): string {
  const businessId = requireBusinessId(req);
  if (req.user?.securityRole !== "BUSINESS_OWNER") {
    throw new AppError("Only a Business Owner can review and assign legacy customer ownership", 403);
  }
  return businessId;
}

export async function listLegacyUnassigned(req: Request, res: Response) {
  const businessId = requireBusinessOwner(req);
  const query = legacyCustomerReviewQuerySchema.parse(req.query);
  const result = await listUnassignedLegacyCustomers({
    businessId,
    page: query.page,
    pageSize: query.pageSize,
    ...(query.search !== undefined ? { search: query.search } : {}),
  });
  res.status(200).json(result);
}

export async function assignLegacyOwnerBranch(req: Request, res: Response) {
  const businessId = requireBusinessOwner(req);
  const { id } = customerIdParamSchema.parse(req.params);
  const input = assignLegacyCustomerOwnerSchema.parse(req.body);
  const customer = await assignLegacyCustomerOwnerBranch({
    customerId: id,
    businessId,
    branchId: input.branchId,
  });
  await recordAuditEvent({
    action: "customer.legacy_owner_assigned",
    entityType: "Customer",
    entityId: customer.id,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      previousOwnerBranchId: null,
      ownerBranchId: customer.ownerBranchId,
      ownerBranchName: customer.ownerBranch?.name ?? null,
    },
  });
  res.status(200).json(customer);
}


export async function assignLegacyOwnersBulk(req: Request, res: Response) {
  const businessId = requireBusinessOwner(req);
  const input = assignLegacyCustomersBulkSchema.parse(req.body);
  const result = await assignLegacyCustomerOwnersBulk({
    businessId,
    branchId: input.branchId,
    ...(input.customerIds ? { customerIds: input.customerIds } : {}),
    all: input.all,
  });

  await recordAuditEvent({
    action: "customer.legacy_owner_bulk_assigned",
    entityType: "Customer",
    entityId: null,
    businessId,
    actorUserId: req.user!.id,
    branchId: req.branchId ?? null,
    correlationId: req.correlationId ?? null,
    metadata: {
      assignmentScope: result.assignmentScope,
      assignedCount: result.assignedCount,
      ownerBranchId: result.branchId,
      ownerBranchName: result.branchName,
    },
  });

  res.status(200).json(result);
}

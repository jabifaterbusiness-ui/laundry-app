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
} from "./customers.validation.js";
import {
  createCustomer,
  findPossibleDuplicates,
  getCustomerForBusiness,
  listCustomers,
  setCustomerLifecycleStatus,
  updateCustomer,
} from "./customers.service.js";

/**
 * Every handler below reads businessId ONLY from req.user (populated by
 * requireAuth from the verified access token) - never from req.body,
 * req.query, or req.params. This is the enforcement point for the
 * LOCKED tenant-isolation decision at the Customers module boundary.
 */
function requireBusinessId(req: Request): string {
  if (!req.user?.businessId) {
    throw new AppError("This action requires an account scoped to a business", 403);
  }
  return req.user.businessId;
}

export async function create(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const input = createCustomerSchema.parse(req.body);
  const normalizedPhone = normalizePhone(input.phone);

  if (!input.confirmDuplicate) {
    const duplicates = await findPossibleDuplicates(businessId, normalizedPhone);
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
    correlationId: req.correlationId ?? null,
    metadata: { name: customer.name },
  });

  res.status(201).json(customer);
}

export async function list(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const query = listCustomersQuerySchema.parse(req.query);

  const result = await listCustomers({
  businessId,
  status: query.status,
  page: query.page,
  pageSize: query.pageSize,
  ...(query.search !== undefined && { search: query.search }),
});
  res.status(200).json(result);
}

export async function getOne(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const { id } = customerIdParamSchema.parse(req.params);

  const customer = await getCustomerForBusiness(id, businessId);
  if (!customer) {
    throw new AppError("Customer not found", 404);
  }

  res.status(200).json(customer);
}

export async function update(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
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
    const duplicates = await findPossibleDuplicates(businessId, normalizedPhone, id);
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
};

const existingCustomer = await getCustomerForBusiness(id, businessId);
if (!existingCustomer) {
  throw new AppError("Customer not found", 404);
}

const customer = await updateCustomer(id, businessId, patch);

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
  const { id } = customerIdParamSchema.parse(req.params);
  const input = changeCustomerStatusSchema.parse(req.body);

  const result = await setCustomerLifecycleStatus(
    id,
    businessId,
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
    correlationId: req.correlationId ?? null,
    metadata: {
      previousStatus: result.previousStatus,
      newStatus: input.status,
      reason: input.reason,
    },
  });

  res.status(200).json(result.customer);
}

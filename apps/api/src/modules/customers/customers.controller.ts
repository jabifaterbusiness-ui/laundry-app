import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  createCustomerSchema,
  customerIdParamSchema,
  listCustomersQuerySchema,
  normalizePhone,
  updateCustomerSchema,
} from "./customers.validation.js";
import {
  createCustomer,
  findPossibleDuplicates,
  getCustomerForBusiness,
  listCustomers,
  setCustomerActiveStatus,
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
    email: input.email,
    address: input.address,
    notes: input.notes,
  });

  await recordAuditEvent({
    action: "customer.created",
    entityType: "Customer",
    entityId: customer.id,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId,
    metadata: { name: customer.name },
  });

  res.status(201).json(customer);
}

export async function list(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const query = listCustomersQuerySchema.parse(req.query);

  const result = await listCustomers({ businessId, ...query });
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

  const patch = { ...fields, phone: normalizedPhone };
  const customer = await updateCustomer(id, businessId, patch);

  await recordAuditEvent({
    action: "customer.updated",
    entityType: "Customer",
    entityId: id,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId,
    metadata: { fields: Object.keys(fields) },
  });

  res.status(200).json(customer);
}

async function setActiveStatus(req: Request, res: Response, isActive: boolean) {
  const businessId = requireBusinessId(req);
  const { id } = customerIdParamSchema.parse(req.params);

  const customer = await setCustomerActiveStatus(id, businessId, isActive);

  await recordAuditEvent({
    action: isActive ? "customer.activated" : "customer.deactivated",
    entityType: "Customer",
    entityId: id,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId,
  });

  res.status(200).json(customer);
}

export async function activate(req: Request, res: Response) {
  await setActiveStatus(req, res, true);
}

export async function deactivate(req: Request, res: Response) {
  await setActiveStatus(req, res, false);
}

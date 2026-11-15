import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import {
  createServiceSchema,
  listServicesQuerySchema,
  serviceIdParamSchema,
  updateServiceSchema,
} from "./services.validation.js";
import {
  createService,
  getServiceForBusiness,
  listServices,
  setServiceActiveStatus,
  updateService,
} from "./services.service.js";

function requireBranchId(req: Request): string {
  if (!req.branchId) throw new AppError("A valid branch context is required", 400);
  return req.branchId;
}

function requireBusinessId(req: Request): string {
  if (!req.user?.businessId) {
    throw new AppError(
      "This action requires an account scoped to a business",
      403,
    );
  }

  return req.user.businessId;
}

export async function create(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const input = createServiceSchema.parse(req.body);

  const service = await createService({
    businessId,
    branchId,
    name: input.name,
    pieces: input.pieces,
    unitPrice: input.unitPrice,
  });

  await recordAuditEvent({
    action: "service.created",
    entityType: "Service",
    entityId: service.id,
    businessId,
    actorUserId: req.user!.id,
    branchId,
    correlationId: req.correlationId ?? null,
    metadata: {
      name: service.name,
      pieces: service.pieces,
      unitPrice: service.unitPrice,
    },
  });

  res.status(201).json(service);
}

export async function list(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const query = listServicesQuerySchema.parse(req.query);

  const services = await listServices({
    businessId,
    branchId,
    userId: req.user!.id,
    status: query.status,
    ...(query.search !== undefined && { search: query.search }),
  });

  res.status(200).json({
    data: services,
  });
}

export async function getOne(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = serviceIdParamSchema.parse(req.params);

  const service = await getServiceForBusiness(id, businessId, branchId, req.user!.id);

  if (!service) {
    throw new AppError("Service not found", 404);
  }

  res.status(200).json(service);
}

export async function update(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = serviceIdParamSchema.parse(req.params);
  const input = updateServiceSchema.parse(req.body);

  const service = await updateService(id, businessId, branchId, req.user!.id, input);

  await recordAuditEvent({
    action: "service.updated",
    entityType: "Service",
    entityId: id,
    businessId,
    actorUserId: req.user!.id,
    branchId,
    correlationId: req.correlationId ?? null,
    metadata: {
      fields: Object.keys(input),
    },
  });

  res.status(200).json(service);
}

async function setActiveStatus(
  req: Request,
  res: Response,
  isActive: boolean,
) {
  const businessId = requireBusinessId(req);
  const branchId = requireBranchId(req);
  const { id } = serviceIdParamSchema.parse(req.params);

  const service = await setServiceActiveStatus(
    id,
    businessId,
    branchId,
    req.user!.id,
    isActive,
  );

  await recordAuditEvent({
    action: isActive ? "service.activated" : "service.deactivated",
    entityType: "Service",
    entityId: id,
    businessId,
    actorUserId: req.user!.id,
    branchId,
    correlationId: req.correlationId ?? null,
  });

  res.status(200).json(service);
}

export async function activate(req: Request, res: Response) {
  await setActiveStatus(req, res, true);
}

export async function deactivate(req: Request, res: Response) {
  await setActiveStatus(req, res, false);
}


const LEGACY_RESOURCE_TYPES = ["SERVICE", "DISCOUNT", "TAX", "CUSTOMER_PRICE"] as const;
type LegacyResourceType = (typeof LEGACY_RESOURCE_TYPES)[number];

function requireBusinessOwner(req: Request) {
  if (req.user?.securityRole !== "BUSINESS_OWNER") {
    throw new AppError("Only the Business Owner can assign unassigned legacy pricing records", 403);
  }
}

export async function listUnassignedLegacyPricing(req: Request, res: Response) {
  requireBusinessOwner(req);
  const businessId = requireBusinessId(req);
  const [services, discounts, taxes, customerPrices] = await Promise.all([
    prisma.service.findMany({ where: { businessId, ownerBranchId: null }, orderBy: { name: "asc" } }),
    prisma.priceAdjustment.findMany({ where: { businessId, branchId: null }, orderBy: { name: "asc" }, include: { customer: { select: { id: true, name: true } }, group: { select: { id: true, name: true } } } }),
    prisma.taxRule.findMany({ where: { businessId, branchId: null }, orderBy: { name: "asc" } }),
    prisma.customerServicePrice.findMany({ where: { businessId, branchId: null }, include: { customer: { select: { id: true, name: true, ownerBranchId: true } }, service: { select: { id: true, name: true, ownerBranchId: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  res.status(200).json({ services, discounts, taxes, customerPrices });
}

export async function assignUnassignedLegacyPricing(req: Request, res: Response) {
  requireBusinessOwner(req);
  const businessId = requireBusinessId(req);
  const { resourceType, resourceId, targetBranchId } = req.body ?? {};
  if (!LEGACY_RESOURCE_TYPES.includes(resourceType) || typeof resourceId !== "string" || !resourceId.trim() || typeof targetBranchId !== "string" || !targetBranchId.trim()) {
    throw new AppError("A valid legacy resource, record ID and target branch are required", 422);
  }

  await prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({ where: { id: targetBranchId, businessId }, select: { id: true } });
    if (!branch) throw new AppError("Target branch not found in this business", 404);

    let changed = 0;
    if (resourceType === "SERVICE") {
      const result = await tx.service.updateMany({ where: { id: resourceId, businessId, ownerBranchId: null }, data: { ownerBranchId: targetBranchId } });
      changed = result.count;
    } else if (resourceType === "DISCOUNT") {
      const result = await tx.priceAdjustment.updateMany({ where: { id: resourceId, businessId, branchId: null }, data: { branchId: targetBranchId } });
      changed = result.count;
    } else if (resourceType === "TAX") {
      const result = await tx.taxRule.updateMany({ where: { id: resourceId, businessId, branchId: null }, data: { branchId: targetBranchId } });
      changed = result.count;
    } else {
      const price = await tx.customerServicePrice.findFirst({
        where: { id: resourceId, businessId, branchId: null },
        include: { customer: { select: { ownerBranchId: true } }, service: { select: { ownerBranchId: true } } },
      });
      if (!price) throw new AppError("Unassigned customer price not found", 404);
      if (price.service.ownerBranchId !== targetBranchId || (price.customer.ownerBranchId !== null && price.customer.ownerBranchId !== targetBranchId)) {
        throw new AppError("Assign the related service and customer to this branch before assigning its customer-specific price", 422);
      }
      const result = await tx.customerServicePrice.updateMany({ where: { id: resourceId, businessId, branchId: null }, data: { branchId: targetBranchId } });
      changed = result.count;
    }
    if (!changed) throw new AppError("Unassigned legacy record not found or already assigned", 409);
  }, { isolationLevel: "Serializable" });

  await recordAuditEvent({
    action: "pricing.legacy_record_assigned",
    entityType: resourceType,
    entityId: resourceId,
    businessId,
    actorUserId: req.user!.id,
    branchId: targetBranchId,
    correlationId: req.correlationId ?? null,
    metadata: { resourceType, targetBranchId },
  });
  res.status(200).json({ success: true });
}

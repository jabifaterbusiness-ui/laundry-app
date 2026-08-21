import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
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
  const input = createServiceSchema.parse(req.body);

  const service = await createService({
    businessId,
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
  const query = listServicesQuerySchema.parse(req.query);

  const services = await listServices({
    businessId,
    status: query.status,
    ...(query.search !== undefined && { search: query.search }),
  });

  res.status(200).json({
    data: services,
  });
}

export async function getOne(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const { id } = serviceIdParamSchema.parse(req.params);

  const service = await getServiceForBusiness(id, businessId);

  if (!service) {
    throw new AppError("Service not found", 404);
  }

  res.status(200).json(service);
}

export async function update(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const { id } = serviceIdParamSchema.parse(req.params);
  const input = updateServiceSchema.parse(req.body);

  const service = await updateService(id, businessId, input);

  await recordAuditEvent({
    action: "service.updated",
    entityType: "Service",
    entityId: id,
    businessId,
    actorUserId: req.user!.id,
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
  const { id } = serviceIdParamSchema.parse(req.params);

  const service = await setServiceActiveStatus(
    id,
    businessId,
    isActive,
  );

  await recordAuditEvent({
    action: isActive ? "service.activated" : "service.deactivated",
    entityType: "Service",
    entityId: id,
    businessId,
    actorUserId: req.user!.id,
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

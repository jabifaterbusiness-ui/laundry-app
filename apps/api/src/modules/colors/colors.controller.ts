import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  colorIdParamSchema,
  createColorSchema,
  listColorsQuerySchema,
  updateColorSchema,
} from "./colors.validation.js";
import {
  createColor,
  listColors,
  setColorActiveStatus,
  updateColor,
} from "./colors.service.js";

function requireBusinessId(req: Request) {
  if (!req.user?.businessId) {
    throw new AppError(
      "This action requires an account scoped to a business",
      403,
    );
  }
  return req.user.businessId;
}

export async function list(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const query = listColorsQuerySchema.parse(req.query);

  const colors = await listColors({
    businessId,
    status: query.status,
    ...(query.search !== undefined && { search: query.search }),
  });

  res.status(200).json({ data: colors });
}

export async function create(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const input = createColorSchema.parse(req.body);

  const color = await createColor(businessId, input.name);

  await recordAuditEvent({
    action: "color.created",
    entityType: "Color",
    entityId: color.id,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: { name: color.name },
  });

  res.status(201).json(color);
}

export async function update(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const { id } = colorIdParamSchema.parse(req.params);
  const input = updateColorSchema.parse(req.body);

  const color = await updateColor(id, businessId, input.name!);

  await recordAuditEvent({
    action: "color.updated",
    entityType: "Color",
    entityId: id,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: { fields: Object.keys(input) },
  });

  res.status(200).json(color);
}

async function setStatus(req: Request, res: Response, isActive: boolean) {
  const businessId = requireBusinessId(req);
  const { id } = colorIdParamSchema.parse(req.params);

  const color = await setColorActiveStatus(id, businessId, isActive);

  await recordAuditEvent({
    action: isActive ? "color.activated" : "color.deactivated",
    entityType: "Color",
    entityId: id,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
  });

  res.status(200).json(color);
}

export async function activate(req: Request, res: Response) {
  await setStatus(req, res, true);
}

export async function deactivate(req: Request, res: Response) {
  await setStatus(req, res, false);
}

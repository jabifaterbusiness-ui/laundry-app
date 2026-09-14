import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  clearBusinessLogo,
  getBusinessBranding,
  setBusinessLogo,
  updateBusinessBranding,
} from "./businesses.service.js";
import {
  deleteBusinessLogo,
  readBusinessLogo,
  saveBusinessLogo,
} from "./business-branding.storage.js";
import { updateBusinessBrandingSchema } from "./businesses.validation.js";

function requireBusinessId(req: Request): string {
  if (!req.user?.businessId) {
    throw new AppError(
      "This action requires an account scoped to a business",
      403,
    );
  }

  return req.user.businessId;
}

export async function getBranding(req: Request, res: Response) {
  const businessId = requireBusinessId(req);

  const branding = await getBusinessBranding(businessId);

  res.status(200).json(branding);
}

export async function updateBranding(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const input = updateBusinessBrandingSchema.parse(req.body);

  const branding = await updateBusinessBranding(
    businessId,
    input,
  );

  await recordAuditEvent({
    action: "business.branding.updated",
    entityType: "Business",
    entityId: businessId,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      fields: Object.keys(input),
    },
  });

  res.status(200).json(branding);
}


export async function uploadLogo(req: Request, res: Response) {
  const businessId = requireBusinessId(req);

  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new AppError("Logo image is required", 422);
  }

  const mimeType = req.header("content-type")?.split(";")[0]?.trim().toLowerCase();

  if (!mimeType) {
    throw new AppError("Logo image content type is required", 422);
  }

  const result = await saveBusinessLogo(
    businessId,
    req.body,
    mimeType,
  );

  let branding;
  try {
    branding = await setBusinessLogo(
      businessId,
      result.logoUrl,
    );
  } catch (error) {
    await deleteBusinessLogo(businessId);
    throw error;
  }

  await recordAuditEvent({
    action: "business.logo.uploaded",
    entityType: "Business",
    entityId: businessId,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      contentType: mimeType,
      logoUrl: result.logoUrl,
    },
  });

  res.status(200).json(branding);
}

export async function getLogo(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const logo = await readBusinessLogo(businessId);

  if (!logo) {
    throw new AppError("Business logo not found", 404);
  }

  res.status(200);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "private, no-store");
  res.send(logo);
}

export async function removeLogo(req: Request, res: Response) {
  const businessId = requireBusinessId(req);

  await deleteBusinessLogo(businessId);
  const branding = await clearBusinessLogo(businessId);

  await recordAuditEvent({
    action: "business.logo.deleted",
    entityType: "Business",
    entityId: businessId,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {},
  });

  res.status(200).json(branding);
}

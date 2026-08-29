import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  getBusinessBranding,
  updateBusinessBranding,
} from "./businesses.service.js";
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

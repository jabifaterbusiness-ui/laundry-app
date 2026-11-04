import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  branchResourceShareIdSchema,
  createBranchResourceShareSchema,
} from "./branch-resource-sharing.validation.js";
import {
  deleteBranchResourceShare,
  listBranchResourceShares,
  saveBranchResourceShare,
} from "./branch-resource-sharing.service.js";

function requireBusinessId(req: Request): string {
  if (!req.user?.businessId) throw new AppError("This action requires an account scoped to a business", 403);
  return req.user.businessId;
}

export async function listBranchResourceSharesController(req: Request, res: Response) {
  res.status(200).json(await listBranchResourceShares(requireBusinessId(req)));
}

export async function createBranchResourceShareController(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const input = createBranchResourceShareSchema.parse(req.body);
  const share = await saveBranchResourceShare({
    businessId,
    ...input,
    createdByUserId: req.user!.id,
  });
  await recordAuditEvent({
    action: "branch.resource_share.created",
    entityType: "BranchResourceShare",
    entityId: share.id,
    businessId,
    actorUserId: req.user!.id,
    metadata: {
      ownerBranchId: share.ownerBranchId,
      targetBranchId: share.targetBranchId,
      resourceType: share.resourceType,
      resourceId: share.resourceId,
      userId: share.userId,
      accessLevel: share.accessLevel,
    },
  });
  res.status(201).json(share);
}

export async function deleteBranchResourceShareController(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const { id } = branchResourceShareIdSchema.parse(req.params);
  await deleteBranchResourceShare({ businessId, id });
  await recordAuditEvent({
    action: "branch.resource_share.deleted",
    entityType: "BranchResourceShare",
    entityId: id,
    businessId,
    actorUserId: req.user!.id,
  });
  res.status(204).send();
}

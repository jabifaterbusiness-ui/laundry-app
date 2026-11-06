import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { hasPermission } from "../permissions/permissions.service.js";
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
  const businessId = requireBusinessId(req);
  const shares = await listBranchResourceShares(businessId);
  const canViewPayroll = await hasPermission(
    req.user!.id,
    businessId,
    req.user!.securityRole,
    "compensation.view",
  );
  res.status(200).json(
    canViewPayroll
      ? shares
      : shares.filter((share) => share.resourceType !== "PAYROLL_COMPENSATION"),
  );
}

export async function createBranchResourceShareController(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const input = createBranchResourceShareSchema.parse(req.body);
  if (input.resourceType === "PAYROLL_COMPENSATION") {
    const canManagePayroll = await hasPermission(
      req.user!.id,
      businessId,
      req.user!.securityRole,
      "compensation.manage",
    );
    if (!canManagePayroll) throw new AppError("Compensation management permission is required to share salary data", 403);
  }
  const share = await saveBranchResourceShare({
    businessId,
    ownerBranchId: input.ownerBranchId,
    targetBranchId: input.targetBranchId,
    resourceType: input.resourceType,
    ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
    accessLevel: input.accessLevel,
    ...(input.customerAccountMode !== undefined ? { customerAccountMode: input.customerAccountMode } : {}),
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
  const existingShare = (await listBranchResourceShares(businessId)).find((share) => share.id === id);
  if (existingShare?.resourceType === "PAYROLL_COMPENSATION") {
    const canManagePayroll = await hasPermission(
      req.user!.id,
      businessId,
      req.user!.securityRole,
      "compensation.manage",
    );
    if (!canManagePayroll) throw new AppError("Compensation management permission is required to change salary sharing", 403);
  }
  await deleteBranchResourceShare({ businessId, id, actorUserId: req.user!.id });
  await recordAuditEvent({
    action: "branch.resource_share.deleted",
    entityType: "BranchResourceShare",
    entityId: id,
    businessId,
    actorUserId: req.user!.id,
  });
  res.status(204).send();
}

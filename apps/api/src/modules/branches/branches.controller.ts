import { hasPermission } from "../permissions/permissions.service.js";
import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  listBranches,
  getBranchForBusiness,
  createBranch,
  updateBranch,
  setBranchActiveStatus,
  listBranchUsers,
  assignUserToBranch,
  removeUserFromBranch,
} from "./branches.service.js";
import {
  createBranchSchema,
  updateBranchSchema,
  listBranchesQuerySchema,
  branchIdParamSchema,
  branchUserParamsSchema,
} from "./branches.validation.js";

function requireBusinessId(req: Request): string {
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
  const query = listBranchesQuerySchema.parse(req.query);

  const branches = await listBranches({
    businessId,
    status: query.status,
  });

  res.status(200).json(branches);
}

export async function get(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const { branchId } = branchIdParamSchema.parse(req.params);

  const branch = await getBranchForBusiness(branchId, businessId);

  if (!branch) {
    throw new AppError("Branch not found", 404);
  }

  res.status(200).json(branch);
}

export async function create(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const input = createBranchSchema.parse(req.body);

  const branch = await createBranch({
    businessId,
    name: input.name,
    ...(input.address !== undefined ? { address: input.address } : {}),
  });

  await recordAuditEvent({
    action: "branch.created",
    entityType: "Branch",
    entityId: branch.id,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      name: branch.name,
    },
  });

  res.status(201).json(branch);
}

export async function update(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const { branchId } = branchIdParamSchema.parse(req.params);
  const input = updateBranchSchema.parse(req.body);

  const branch = await updateBranch(
    branchId,
    businessId,
    {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
    },
  );

  await recordAuditEvent({
    action: "branch.updated",
    entityType: "Branch",
    entityId: branchId,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      fields: Object.keys(input),
    },
  });

  res.status(200).json(branch);
}

export async function activate(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const { branchId } = branchIdParamSchema.parse(req.params);

  const branch = await setBranchActiveStatus(
    branchId,
    businessId,
    true,
  );

  await recordAuditEvent({
    action: "branch.activated",
    entityType: "Branch",
    entityId: branchId,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
  });

  res.status(200).json(branch);
}

export async function deactivate(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const { branchId } = branchIdParamSchema.parse(req.params);

  const branch = await setBranchActiveStatus(
    branchId,
    businessId,
    false,
  );

  await recordAuditEvent({
    action: "branch.deactivated",
    entityType: "Branch",
    entityId: branchId,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
  });

  res.status(200).json(branch);
}

export async function users(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const { branchId } = branchIdParamSchema.parse(req.params);

  const branchUsers = await listBranchUsers(
    branchId,
    businessId,
  );

  const detailPermissions = await Promise.all(
    ["branches.view", "branches.manage_users", "compensation.view"].map(
      (permission) =>
        hasPermission(
          req.user!.id,
          businessId,
          req.user!.securityRole,
          permission,
        ),
    ),
  );
  const canViewBranchDetails = detailPermissions.some(Boolean);

  res.status(200).json(
    canViewBranchDetails
      ? branchUsers
      : branchUsers.map(({ id, fullName, isActive }) => ({
          id,
          fullName,
          isActive,
        })),
  );
}

export async function assignUser(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const { branchId, userId } =
    branchUserParamsSchema.parse(req.params);

  const user = await assignUserToBranch(
    branchId,
    businessId,
    userId,
  );

  await recordAuditEvent({
    action: "branch.user.assigned",
    entityType: "Branch",
    entityId: branchId,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      userId,
    },
  });

  res.status(201).json(user);
}

export async function removeUser(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const { branchId, userId } =
    branchUserParamsSchema.parse(req.params);

  await removeUserFromBranch(
    branchId,
    businessId,
    userId,
  );

  await recordAuditEvent({
    action: "branch.user.removed",
    entityType: "Branch",
    entityId: branchId,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      userId,
    },
  });

  res.status(204).send();
}

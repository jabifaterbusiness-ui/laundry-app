import type { Request, Response } from "express";
import type { Role } from "@prisma/client";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  listPermissions,
  getRolePermissions,
  getUserPermissions,
  upsertBusinessRolePermission,
  removeBusinessRolePermission,
  upsertUserPermissionOverride,
  removeUserPermissionOverride,
  allowAllUserPermissions,
  disallowAllUserPermissions,
  requirePermissionForGrant,
} from "./permissions.service.js";
import {
  rolePermissionParamsSchema,
  userIdParamSchema,
  roleParamSchema,
  userPermissionParamsSchema,
  permissionValueSchema,
  permissionReasonSchema,
} from "./permissions.validation.js";

function requireBusinessId(req: Request): string {
  if (!req.user?.businessId) {
    throw new AppError(
      "This action requires an account scoped to a business",
      403,
    );
  }

  return req.user.businessId;
}

import { requireReason } from "../../lib/reason.js";

export async function list(req: Request, res: Response) {
  requireBusinessId(req);

  res.status(200).json(await listPermissions());
}

export async function rolePermissions(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const { role } = roleParamSchema.parse(req.params);

  if (role === "PLATFORM_ADMIN") {
    throw new AppError(
      "PLATFORM_ADMIN permissions cannot be configured at business level",
      400,
    );
  }

  res.status(200).json(
    await getRolePermissions(businessId, role as Role),
  );
}

export async function updateRolePermission(
  req: Request,
  res: Response,
) {
  const businessId = requireBusinessId(req);
  const { role, permissionCode } =
    rolePermissionParamsSchema.parse(req.params);
  const { allowed, reason } = permissionValueSchema.parse(req.body);
  const normalizedReason = requireReason(reason);

  if (role === "PLATFORM_ADMIN") {
    throw new AppError(
      "PLATFORM_ADMIN permissions cannot be configured at business level",
      400,
    );
  }

  if (allowed) {
    await requirePermissionForGrant(
      req.user!.id,
      businessId,
      req.user!.securityRole,
      permissionCode,
    );
  }

  const previousPermissions = await getRolePermissions(
    businessId,
    role as Role,
  );
  const previous = previousPermissions.find(
    (permission) => permission.code === permissionCode,
  );

  const result = await upsertBusinessRolePermission(
    businessId,
    role as Role,
    permissionCode,
    allowed,
  );

  await recordAuditEvent({
    action: "permission.role.updated",
    entityType: "BusinessRolePermission",
    entityId: result.id,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      role,
      permissionCode,
      before: {
        allowed: previous?.allowed ?? false,
      },
      after: {
        allowed,
      },
      reason: normalizedReason,
    },
  });

  res.status(200).json(result);
}

export async function removeRolePermission(
  req: Request,
  res: Response,
) {
  const businessId = requireBusinessId(req);
  const { role, permissionCode } =
    rolePermissionParamsSchema.parse(req.params);
  const { reason } = permissionReasonSchema.parse(req.body);
  const normalizedReason = requireReason(reason);

  if (role === "PLATFORM_ADMIN") {
    throw new AppError(
      "PLATFORM_ADMIN permissions cannot be configured at business level",
      400,
    );
  }

  const previousPermissions = await getRolePermissions(
    businessId,
    role as Role,
  );
  const previous = previousPermissions.find(
    (permission) => permission.code === permissionCode,
  );

  const result = await removeBusinessRolePermission(
    businessId,
    role as Role,
    permissionCode,
  );

  await recordAuditEvent({
    action: "permission.role.removed",
    entityType: "BusinessRolePermission",
    entityId: null,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      role,
      permissionCode,
      before: {
        allowed: previous?.allowed ?? false,
      },
      after: null,
      reason: normalizedReason,
    },
  });

  res.status(200).json(result);
}

export async function userPermissions(req: Request, res: Response) {
  const businessId = requireBusinessId(req);
  const { userId } = userIdParamSchema.parse(req.params);

  res.status(200).json(
    await getUserPermissions(businessId, userId),
  );
}

export async function allowAllUserPermissionsController(
  req: Request,
  res: Response,
) {
  const { reason } = permissionReasonSchema.parse(req.body);
  const normalizedReason = requireReason(reason);
  const businessId = requireBusinessId(req);
  const { userId } = userIdParamSchema.parse(req.params);

  // Verify the actor possesses every permission before granting the full
  // catalogue, preventing a partial/unauthorized escalation.
  for (const permission of await listPermissions()) {
    await requirePermissionForGrant(
      req.user!.id,
      businessId,
      req.user!.securityRole,
      permission.code,
    );
  }

  const previousPermissions = await getUserPermissions(
    businessId,
    userId,
  );
  const previousAllowed = previousPermissions.permissions
    .filter((permission) => permission.allowed)
    .map((permission) => permission.code)
    .sort();

  const result = await allowAllUserPermissions(businessId, userId);

  await recordAuditEvent({
    action: "permission.user.allow_all",
    entityType: "UserPermissionOverride",
    entityId: userId,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      userId,
      count: result.count,
      before: {
        allowedPermissionCodes: previousAllowed,
      },
      after: {
        allowedPermissionCodes: (await listPermissions())
          .map((permission) => permission.code)
          .sort(),
      },
      reason: normalizedReason,
    },
  });

  res.status(200).json(result);
}

export async function disallowAllUserPermissionsController(
  req: Request,
  res: Response,
) {
  const { reason } = permissionReasonSchema.parse(req.body);
  const normalizedReason = requireReason(reason);
  const businessId = requireBusinessId(req);
  const { userId } = userIdParamSchema.parse(req.params);

  const previousPermissions = await getUserPermissions(
    businessId,
    userId,
  );
  const previousAllowed = previousPermissions.permissions
    .filter((permission) => permission.allowed)
    .map((permission) => permission.code)
    .sort();

  const result = await disallowAllUserPermissions(businessId, userId);

  await recordAuditEvent({
    action: "permission.user.disallow_all",
    entityType: "UserPermissionOverride",
    entityId: userId,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      userId,
      count: result.count,
      before: {
        allowedPermissionCodes: previousAllowed,
      },
      after: {
        allowedPermissionCodes: [],
      },
      reason: normalizedReason,
    },
  });

  res.status(200).json(result);
}

export async function updateUserPermission(
  req: Request,
  res: Response,
) {
  const businessId = requireBusinessId(req);
  const { userId, permissionCode } =
    userPermissionParamsSchema.parse(req.params);
  const { allowed, reason } = permissionValueSchema.parse(req.body);
  const normalizedReason = requireReason(reason);

  if (allowed) {
    await requirePermissionForGrant(
      req.user!.id,
      businessId,
      req.user!.securityRole,
      permissionCode,
    );
  }

  const previousPermissions = await getUserPermissions(
    businessId,
    userId,
  );
  const previous = previousPermissions.permissions.find(
    (permission) => permission.code === permissionCode,
  );

  const result = await upsertUserPermissionOverride(
    businessId,
    userId,
    permissionCode,
    allowed,
  );

  await recordAuditEvent({
    action: "permission.user.updated",
    entityType: "UserPermissionOverride",
    entityId: result.id,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      userId,
      permissionCode,
      before: {
        allowed: previous?.allowed ?? false,
      },
      after: {
        allowed,
      },
      reason: normalizedReason,
    },
  });

  res.status(200).json(result);
}

export async function removeUserPermission(
  req: Request,
  res: Response,
) {
  const businessId = requireBusinessId(req);
  const { userId, permissionCode } =
    userPermissionParamsSchema.parse(req.params);
  const { reason } = permissionReasonSchema.parse(req.body);
  const normalizedReason = requireReason(reason);

  const previousPermissions = await getUserPermissions(
    businessId,
    userId,
  );
  const previous = previousPermissions.permissions.find(
    (permission) => permission.code === permissionCode,
  );

  const result = await removeUserPermissionOverride(
    businessId,
    userId,
    permissionCode,
  );

  await recordAuditEvent({
    action: "permission.user.removed",
    entityType: "UserPermissionOverride",
    entityId: null,
    businessId,
    actorUserId: req.user!.id,
    correlationId: req.correlationId ?? null,
    metadata: {
      userId,
      permissionCode,
      before: {
        allowed: previous?.allowed ?? false,
      },
      after: null,
      reason: normalizedReason,
    },
  });

  res.status(200).json(result);
}

import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  list,
  rolePermissions,
  updateRolePermission,
  removeRolePermission,
  userPermissions,
  updateUserPermission,
  removeUserPermission,
  allowAllUserPermissionsController,
  disallowAllUserPermissionsController,
} from "./permissions.controller.js";

export const permissionsRouter = Router();

permissionsRouter.use(
  requireAuth,
  requireBusinessContext,
  requirePermission("users.manage_permissions"),
);

permissionsRouter.get("/", asyncHandler(list));

permissionsRouter.get(
  "/roles/:role",
  asyncHandler(rolePermissions),
);

permissionsRouter.put(
  "/roles/:role/:permissionCode",
  asyncHandler(updateRolePermission),
);

permissionsRouter.delete(
  "/roles/:role/:permissionCode",
  asyncHandler(removeRolePermission),
);

permissionsRouter.get(
  "/users/:userId",
  asyncHandler(userPermissions),
);

permissionsRouter.put(
  "/users/:userId/allow-all",
  asyncHandler(allowAllUserPermissionsController),
);

permissionsRouter.put(
  "/users/:userId/disallow-all",
  asyncHandler(disallowAllUserPermissionsController),
);

permissionsRouter.put(
  "/users/:userId/:permissionCode",
  asyncHandler(updateUserPermission),
);

permissionsRouter.delete(
  "/users/:userId/:permissionCode",
  asyncHandler(removeUserPermission),
);

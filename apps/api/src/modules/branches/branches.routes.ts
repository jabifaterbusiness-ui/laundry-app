import { Router } from "express";
import { requireAuth, requireBusinessContext } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAnyPermission, requirePermission } from "../../middleware/permissions.js";
import {
  list,
  get,
  create,
  update,
  activate,
  deactivate,
  users,
  assignUser,
  removeUser,
} from "./branches.controller.js";

export const branchesRouter = Router();

branchesRouter.use(requireAuth, requireBusinessContext);

branchesRouter.get(
  "/",
  requirePermission("branches.view"),
  asyncHandler(list),
);

branchesRouter.get(
  "/:branchId",
  requirePermission("branches.view"),
  asyncHandler(get),
);

branchesRouter.post(
  "/",
  requirePermission("branches.create"),
  asyncHandler(create),
);

branchesRouter.patch(
  "/:branchId",
  requirePermission("branches.update"),
  asyncHandler(update),
);

branchesRouter.patch(
  "/:branchId/activate",
  requirePermission("branches.activate"),
  asyncHandler(activate),
);

branchesRouter.patch(
  "/:branchId/deactivate",
  requirePermission("branches.deactivate"),
  asyncHandler(deactivate),
);

branchesRouter.get(
  "/:branchId/users",
  requireAnyPermission([
    "branches.view",
    "branches.manage_users",
    "compensation.view",
    "compensation.manage",
    "ious.manage",
    "loans.manage",
    "repayments.manage",
  ]),
  asyncHandler(users),
);

branchesRouter.post(
  "/:branchId/users/:userId",
  requirePermission("branches.manage_users"),
  asyncHandler(assignUser),
);

branchesRouter.delete(
  "/:branchId/users/:userId",
  requirePermission("branches.manage_users"),
  asyncHandler(removeUser),
);

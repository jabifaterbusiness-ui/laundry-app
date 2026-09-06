import { Router } from "express";
import { requireAuth, requireBusinessContext } from "../auth/auth.middleware.js";
import { requireRole } from "../../middleware/rbac.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/permissions.js";
import { list, get, create, update, activate, deactivate, users, assignUser, removeUser } from "./branches.controller.js";

const VIEW_ROLES = ["BUSINESS_OWNER", "BRANCH_MANAGER", "STAFF"] as const;
const OWNER_ONLY = ["BUSINESS_OWNER"] as const;

export const branchesRouter = Router();

branchesRouter.use(requireAuth, requireBusinessContext);

branchesRouter.get("/", requireRole(...VIEW_ROLES), requirePermission("branches.view"), asyncHandler(list));
branchesRouter.get("/:branchId", requireRole(...VIEW_ROLES), requirePermission("branches.view"), asyncHandler(get));
branchesRouter.post("/", requireRole(...OWNER_ONLY), requirePermission("branches.create"), asyncHandler(create));
branchesRouter.patch("/:branchId", requireRole(...OWNER_ONLY), requirePermission("branches.update"), asyncHandler(update));
branchesRouter.patch("/:branchId/activate", requireRole(...OWNER_ONLY), requirePermission("branches.activate"), asyncHandler(activate));
branchesRouter.patch("/:branchId/deactivate", requireRole(...OWNER_ONLY), requirePermission("branches.deactivate"), asyncHandler(deactivate));
branchesRouter.get("/:branchId/users", requireRole(...VIEW_ROLES), requirePermission("branches.view"), asyncHandler(users));
branchesRouter.post("/:branchId/users/:userId", requireRole(...OWNER_ONLY), requirePermission("branches.manage_users"), asyncHandler(assignUser));
branchesRouter.delete("/:branchId/users/:userId", requireRole(...OWNER_ONLY), requirePermission("branches.manage_users"), asyncHandler(removeUser));

import { Router } from "express";
import { requireAuth, requireBusinessContext } from "../auth/auth.middleware.js";
import { requireRole } from "../../middleware/rbac.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { list, get, create, update, activate, deactivate, users, assignUser, removeUser } from "./branches.controller.js";

const VIEW_ROLES = ["BUSINESS_OWNER", "BRANCH_MANAGER", "STAFF"] as const;
const OWNER_ONLY = ["BUSINESS_OWNER"] as const;

export const branchesRouter = Router();

branchesRouter.use(requireAuth, requireBusinessContext);

branchesRouter.get("/", requireRole(...VIEW_ROLES), asyncHandler(list));
branchesRouter.get("/:branchId", requireRole(...VIEW_ROLES), asyncHandler(get));
branchesRouter.post("/", requireRole(...OWNER_ONLY), asyncHandler(create));
branchesRouter.patch("/:branchId", requireRole(...OWNER_ONLY), asyncHandler(update));
branchesRouter.patch("/:branchId/activate", requireRole(...OWNER_ONLY), asyncHandler(activate));
branchesRouter.patch("/:branchId/deactivate", requireRole(...OWNER_ONLY), asyncHandler(deactivate));
branchesRouter.get("/:branchId/users", requireRole(...VIEW_ROLES), asyncHandler(users));
branchesRouter.post("/:branchId/users/:userId", requireRole(...OWNER_ONLY), asyncHandler(assignUser));
branchesRouter.delete("/:branchId/users/:userId", requireRole(...OWNER_ONLY), asyncHandler(removeUser));

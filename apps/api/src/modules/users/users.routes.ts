import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAuth, requireBusinessContext } from "../auth/auth.middleware.js";
import { requireRole } from "../../middleware/rbac.js";
import { requirePermission } from "../../middleware/permissions.js";
import {
  activate,
  create,
  deactivate,
  get,
  list,
  update,
} from "./users.controller.js";

const VIEW_ROLES = ["BUSINESS_OWNER", "BRANCH_MANAGER"] as const;
const OWNER_ONLY = ["BUSINESS_OWNER"] as const;

export const usersRouter = Router();

usersRouter.use(requireAuth, requireBusinessContext);

usersRouter.get(
  "/",
  requireRole(...VIEW_ROLES),
  requirePermission("users.view"),
  asyncHandler(list),
);

usersRouter.get(
  "/:userId",
  requireRole(...VIEW_ROLES),
  requirePermission("users.view"),
  asyncHandler(get),
);

usersRouter.post(
  "/",
  requireRole(...OWNER_ONLY),
  requirePermission("users.create"),
  asyncHandler(create),
);

usersRouter.patch(
  "/:userId",
  requireRole(...OWNER_ONLY),
  requirePermission("users.update"),
  asyncHandler(update),
);

usersRouter.patch(
  "/:userId/activate",
  requireRole(...OWNER_ONLY),
  requirePermission("users.update"),
  asyncHandler(activate),
);

usersRouter.patch(
  "/:userId/deactivate",
  requireRole(...OWNER_ONLY),
  requirePermission("users.update"),
  asyncHandler(deactivate),
);

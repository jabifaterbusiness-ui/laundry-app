import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { execute } from "./quick-operations.controller.js";

const QUICK_OPERATION_ROLES = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
  "STAFF",
] as const;

import { requireRole } from "../../middleware/rbac.js";

export const quickOperationsRouter = Router();

quickOperationsRouter.use(
  requireAuth,
  requireBusinessContext,
  asyncHandler(requireBranchContext),
);

quickOperationsRouter.post(
  "/execute",
  requireRole(...QUICK_OPERATION_ROLES),
  asyncHandler(execute),
);

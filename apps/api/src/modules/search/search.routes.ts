import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { requireRole } from "../../middleware/rbac.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { search } from "./search.controller.js";

const SEARCH_ROLES = [
  "BUSINESS_OWNER",
  "BRANCH_MANAGER",
  "STAFF",
] as const;

export const searchRouter = Router();

searchRouter.use(
  requireAuth,
  requireBusinessContext,
  asyncHandler(requireBranchContext),
);

searchRouter.get(
  "/",
  requireRole(...SEARCH_ROLES),
  asyncHandler(search),
);

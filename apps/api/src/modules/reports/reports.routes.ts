import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/permissions.js";
import { dashboard, financialStatement, collectionStatement, annualReport } from "./reports.controller.js";

export const reportsRouter = Router();

reportsRouter.use(
  requireAuth,
  requireBusinessContext,
);

reportsRouter.get(
  "/dashboard",
  requirePermission("reports.view"),
  asyncHandler(requireBranchContext),
  asyncHandler(dashboard),
);


reportsRouter.get(
  "/financial-statement",
  requirePermission("reports.view"),
  asyncHandler(requireBranchContext),
  asyncHandler(financialStatement),
);

reportsRouter.get(
  "/collection-statement",
  requirePermission("reports.view"),
  asyncHandler(requireBranchContext),
  asyncHandler(collectionStatement),
);


reportsRouter.get(
  "/annual",
  requirePermission("reports.view"),
  asyncHandler(requireBranchContext),
  asyncHandler(annualReport),
);

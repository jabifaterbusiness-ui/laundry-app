import { Router } from "express";
import { requireAuth, requireBusinessContext } from "../auth/auth.middleware.js";
import { requireRole } from "../../middleware/rbac.js";
import { activate, create, deactivate, getOne, list, update } from "./customers.controller.js";

// Authorization matrix (full rationale in docs/CUSTOMERS.md section C):
//   create            BUSINESS_OWNER, BRANCH_MANAGER, STAFF
//   view (list/get)   BUSINESS_OWNER, BRANCH_MANAGER, STAFF
//   update             BUSINESS_OWNER, BRANCH_MANAGER, STAFF
//   activate/deactivate BUSINESS_OWNER, BRANCH_MANAGER   (not STAFF)
// PLATFORM_ADMIN has no businessId, so requireBusinessContext already
// excludes it from every route here - there is no tenant-admin bypass.
const VIEW_ROLES = ["BUSINESS_OWNER", "BRANCH_MANAGER", "STAFF"] as const;
const WRITE_ROLES = ["BUSINESS_OWNER", "BRANCH_MANAGER", "STAFF"] as const;
const STATUS_ROLES = ["BUSINESS_OWNER", "BRANCH_MANAGER"] as const;

export const customersRouter = Router();

customersRouter.use(requireAuth, requireBusinessContext);

customersRouter.post("/", requireRole(...WRITE_ROLES), create);
customersRouter.get("/", requireRole(...VIEW_ROLES), list);
customersRouter.get("/:id", requireRole(...VIEW_ROLES), getOne);
customersRouter.patch("/:id", requireRole(...WRITE_ROLES), update);
customersRouter.post("/:id/activate", requireRole(...STATUS_ROLES), activate);
customersRouter.post("/:id/deactivate", requireRole(...STATUS_ROLES), deactivate);

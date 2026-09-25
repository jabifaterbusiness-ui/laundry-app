import { Router } from "express";
import { requireAuth, requireBusinessContext } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/permissions.js";
import { changeStatus, create, getOne, list, update } from "./customers.controller.js";

// Access is controlled by the individual permission assignments.
// Business owners retain the platform-defined full-access behavior.
// PLATFORM_ADMIN has no businessId, so requireBusinessContext excludes
// it from these tenant-scoped routes.
export const customersRouter = Router();

customersRouter.use(requireAuth, requireBusinessContext);

customersRouter.post("/", requirePermission("customers.create"), asyncHandler(create));
customersRouter.get("/", requirePermission("customers.view"), asyncHandler(list));
customersRouter.get("/:id", requirePermission("customers.view"), asyncHandler(getOne));
customersRouter.patch("/:id", requirePermission("customers.update"), asyncHandler(update));
customersRouter.post("/:id/status", requirePermission("customers.change_status"), asyncHandler(changeStatus));

customersRouter.post(
  "/:id/activate",
  requirePermission("customers.change_status"),
  asyncHandler((req, res) => {
    req.body = { status: "ACTIVE", reason: "Legacy activate endpoint" };
    return changeStatus(req, res);
  }),
);

customersRouter.post(
  "/:id/deactivate",
  requirePermission("customers.change_status"),
  asyncHandler((req, res) => {
    req.body = { status: "DORMANT", reason: "Legacy deactivate endpoint" };
    return changeStatus(req, res);
  }),
);
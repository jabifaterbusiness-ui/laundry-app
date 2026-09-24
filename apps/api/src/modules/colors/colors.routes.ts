import { Router } from "express";
import { requireAuth, requireBusinessContext } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/permissions.js";
import {
  activate,
  create,
  deactivate,
  list,
  update,
} from "./colors.controller.js";

export const colorsRouter = Router();

colorsRouter.use(requireAuth, requireBusinessContext);

colorsRouter.get(
  "/",
  requirePermission("colors.view"),
  asyncHandler(list),
);

colorsRouter.post(
  "/",
  requirePermission("colors.manage"),
  asyncHandler(create),
);

colorsRouter.patch(
  "/:id",
  requirePermission("colors.manage"),
  asyncHandler(update),
);

colorsRouter.post(
  "/:id/activate",
  requirePermission("colors.manage"),
  asyncHandler(activate),
);

colorsRouter.post(
  "/:id/deactivate",
  requirePermission("colors.manage"),
  asyncHandler(deactivate),
);

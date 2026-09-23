import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAuth, requireBusinessContext } from "../auth/auth.middleware.js";
import { requirePermission } from "../../middleware/permissions.js";
import {
  activate,
  create,
  deactivate,
  get,
  list,
  update,
} from "./users.controller.js";

export const usersRouter = Router();

usersRouter.use(requireAuth, requireBusinessContext);

usersRouter.get(
  "/",
  requirePermission("users.view"),
  asyncHandler(list),
);

usersRouter.get(
  "/:userId",
  requirePermission("users.view"),
  asyncHandler(get),
);

usersRouter.post(
  "/",
  requirePermission("users.create"),
  asyncHandler(create),
);

usersRouter.patch(
  "/:userId",
  requirePermission("users.update"),
  asyncHandler(update),
);

usersRouter.patch(
  "/:userId/activate",
  requirePermission("users.update"),
  asyncHandler(activate),
);

usersRouter.patch(
  "/:userId/deactivate",
  requirePermission("users.update"),
  asyncHandler(deactivate),
);

import { Router } from "express";
import {
  requireAuth,
  requireBusinessContext,
} from "../auth/auth.middleware.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/permissions.js";
import {
  createStatementRecipient,
  getStatementConfig,
  listStatementRecipients,
  removeStatementRecipient,
  updateStatementConfig,
  updateStatementRecipient,
} from "./financial-statement-delivery.controller.js";

export const financialStatementDeliveryRouter = Router();

financialStatementDeliveryRouter.use(
  requireAuth,
  requireBusinessContext,
);

financialStatementDeliveryRouter.get(
  "/config",
  requirePermission("reports.view"),
  asyncHandler(getStatementConfig),
);

financialStatementDeliveryRouter.put(
  "/config",
  requirePermission("reports.manage"),
  asyncHandler(updateStatementConfig),
);

financialStatementDeliveryRouter.get(
  "/recipients",
  requirePermission("reports.view"),
  asyncHandler(listStatementRecipients),
);

financialStatementDeliveryRouter.post(
  "/recipients",
  requirePermission("reports.manage"),
  asyncHandler(createStatementRecipient),
);

financialStatementDeliveryRouter.patch(
  "/recipients/:recipientId",
  requirePermission("reports.manage"),
  asyncHandler(updateStatementRecipient),
);

financialStatementDeliveryRouter.delete(
  "/recipients/:recipientId",
  requirePermission("reports.manage"),
  asyncHandler(removeStatementRecipient),
);

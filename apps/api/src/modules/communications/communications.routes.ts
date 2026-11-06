import { Router } from "express";
import { requireAuth, requireBusinessContext } from "../auth/auth.middleware.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import {
  createCustomerGroup, deleteStatusRule, getCustomerGroups, getDeliveries, getReminderConfig, getUnpickedOrders, listStatusRules, removeCustomerGroup, updateCustomerGroupMembers,
  saveReminderConfig, saveStatusRule, sendAnnouncement, sendReminders, retryWhatsAppDeliveryController,
} from "./communications.controller.js";

export const communicationsRouter = Router();
communicationsRouter.use(requireAuth, requireBusinessContext);

communicationsRouter.get("/customer-groups", requirePermission("customers.view"), asyncHandler(getCustomerGroups));
communicationsRouter.post("/customer-groups", requirePermission("customers.update"), asyncHandler(createCustomerGroup));
communicationsRouter.put("/customer-groups/:id", requirePermission("customers.update"), asyncHandler(updateCustomerGroupMembers));
communicationsRouter.delete("/customer-groups/:id", requirePermission("customers.update"), asyncHandler(removeCustomerGroup));
communicationsRouter.post("/announcements", requirePermission("customers.update"), asyncHandler(sendAnnouncement));
communicationsRouter.get("/deliveries", requirePermission("customers.view"), asyncHandler(requireBranchContext), asyncHandler(getDeliveries));
communicationsRouter.post("/deliveries/:id/retry", requirePermission("customers.update"), asyncHandler(requireBranchContext), asyncHandler(retryWhatsAppDeliveryController));
communicationsRouter.get("/status-rules", requirePermission("orders.view"), asyncHandler(listStatusRules));
communicationsRouter.put("/status-rules", requirePermission("orders.change_status"), asyncHandler(saveStatusRule));
communicationsRouter.delete("/status-rules/:id", requirePermission("orders.change_status"), asyncHandler(deleteStatusRule));
communicationsRouter.get("/unpicked-orders/config", requirePermission("orders.view"), asyncHandler(requireBranchContext), asyncHandler(getReminderConfig));
communicationsRouter.put("/unpicked-orders/config", requirePermission("orders.update"), asyncHandler(requireBranchContext), asyncHandler(saveReminderConfig));
communicationsRouter.get("/unpicked-orders", requirePermission("orders.view"), asyncHandler(requireBranchContext), asyncHandler(getUnpickedOrders));
communicationsRouter.post("/unpicked-orders/remind", requirePermission("orders.update"), asyncHandler(requireBranchContext), asyncHandler(sendReminders));

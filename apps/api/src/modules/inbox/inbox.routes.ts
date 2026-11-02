import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  dismissInboxMessage,
  inbox,
  markInboxMessageRead,
} from "./inbox.controller.js";

export const inboxRouter = Router();

inboxRouter.get("/", asyncHandler(inbox));
inboxRouter.patch("/:messageId/read", asyncHandler(markInboxMessageRead));
inboxRouter.patch("/:messageId/dismiss", asyncHandler(dismissInboxMessage));

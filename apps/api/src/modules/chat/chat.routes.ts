import express, { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { requirePermission } from "../../middleware/permissions.js";
import {
  addGroupMember, createDirectConversation, createGroupConversation, listConversations,
  listDirectory, listMessages, markConversationRead, removeGroupMember, sendMessage,
  toggleReaction, updateGroup, uploadAttachment, downloadAttachment,
} from "./chat.controller.js";

export const chatRouter = Router();
chatRouter.use(asyncHandler(requireBranchContext));
chatRouter.get("/directory", requirePermission("chat.view"), asyncHandler(listDirectory));
chatRouter.get("/conversations", requirePermission("chat.view"), asyncHandler(listConversations));
chatRouter.post("/direct/:userId", requirePermission("chat.create_direct"), asyncHandler(createDirectConversation));
chatRouter.post("/groups", requirePermission("chat.create_group"), asyncHandler(createGroupConversation));
chatRouter.get("/conversations/:id/messages", requirePermission("chat.view"), asyncHandler(listMessages));
chatRouter.post("/conversations/:id/messages", requirePermission("chat.view"), asyncHandler(sendMessage));
chatRouter.post("/conversations/:id/attachments", requirePermission("chat.upload_attachments"), express.raw({ type: "application/octet-stream", limit: "10mb" }), asyncHandler(uploadAttachment));
chatRouter.get("/attachments/:id", requirePermission("chat.view"), asyncHandler(downloadAttachment));
chatRouter.post("/conversations/:id/read", requirePermission("chat.view"), asyncHandler(markConversationRead));
chatRouter.patch("/groups/:id", requirePermission("chat.manage_group"), asyncHandler(updateGroup));
chatRouter.post("/groups/:id/members", requirePermission("chat.manage_group"), asyncHandler(addGroupMember));
chatRouter.delete("/groups/:id/members/:userId", requirePermission("chat.manage_group"), asyncHandler(removeGroupMember));
chatRouter.post("/conversations/:id/messages/:messageId/reactions", requirePermission("chat.view"), asyncHandler(toggleReaction));

import express, { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireBranchContext } from "../../middleware/branch-context.js";
import { requireAnyPermission, requirePermission } from "../../middleware/permissions.js";
import {
  addGroupMember, createDirectConversation, createGroupConversation, listConversations,
  listDirectory, listMessages, markConversationRead, removeGroupMember, sendMessage,
  toggleReaction, updateGroup, uploadAttachment, downloadAttachment, setGroupMemberRole,
} from "./chat.controller.js";

export const chatRouter = Router();
chatRouter.use(asyncHandler(requireBranchContext), requirePermission("chat.view"));
chatRouter.get("/directory", requirePermission("chat.view"), asyncHandler(listDirectory));
chatRouter.get("/conversations", requirePermission("chat.view"), asyncHandler(listConversations));
chatRouter.post("/direct/:userId", requirePermission("chat.create_direct"), asyncHandler(createDirectConversation));
chatRouter.post("/groups", requirePermission("chat.create_group"), asyncHandler(createGroupConversation));
chatRouter.get("/conversations/:id/messages", requirePermission("chat.view"), asyncHandler(listMessages));
chatRouter.post("/conversations/:id/messages", requirePermission("chat.send_message"), asyncHandler(sendMessage));
chatRouter.post("/conversations/:id/attachments", requirePermission("chat.upload_attachments"), express.raw({ type: "application/octet-stream", limit: "10mb" }), asyncHandler(uploadAttachment));
chatRouter.get("/attachments/:id", requirePermission("chat.view"), asyncHandler(downloadAttachment));
chatRouter.post("/conversations/:id/read", requirePermission("chat.view"), asyncHandler(markConversationRead));
chatRouter.patch("/groups/:id", requireAnyPermission(["chat.manage_group", "chat.manage_all_groups"]), asyncHandler(updateGroup));
chatRouter.post("/groups/:id/members", requireAnyPermission(["chat.manage_group", "chat.manage_all_groups"]), asyncHandler(addGroupMember));
chatRouter.delete("/groups/:id/members/:userId", requireAnyPermission(["chat.manage_group", "chat.manage_all_groups"]), asyncHandler(removeGroupMember));
chatRouter.patch("/groups/:id/members/:userId/role", requireAnyPermission(["chat.manage_group", "chat.manage_all_groups"]), asyncHandler(setGroupMemberRole));
chatRouter.post("/conversations/:id/messages/:messageId/reactions", requirePermission("chat.view"), asyncHandler(toggleReaction));

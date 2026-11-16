import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import { deleteChatFile, readChatFile, storeChatFile } from "./chat-storage.service.js";
import type { Role } from "@prisma/client";
import { hasPermission } from "../permissions/permissions.service.js";
import { publishChatEvent, subscribeChatEvents, type ChatRealtimeEvent } from "./chat-events.service.js";

const groupSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  participantIds: z.array(z.string().uuid()).max(200).default([]),
  includeAllEligible: z.boolean().default(false),
  confirmLargeGroup: z.boolean().default(false),
});
const messageSchema = z.object({
  body: z.string().trim().max(5000).optional().default(""),
  attachmentIds: z.array(z.string().uuid()).max(10).optional().default([]),
  clientMessageId: z.string().min(1).max(100).optional(),
  replyToMessageId: z.string().uuid().optional(),
});
const editMessageSchema = z.object({ body: z.string().trim().min(1).max(5000) }).strict();
const groupUpdateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});
const memberSchema = z.object({ userId: z.string().uuid() });
const memberRoleSchema = z.object({ role: z.enum(["ADMIN", "MEMBER"]) });
const reactionSchema = z.object({ emoji: z.string().trim().min(1).max(16) });

export async function listNotifications(req: Request, res: Response) {
  const { userId, businessId } = scope(req);
  const rawSince = typeof req.query.since === "string" ? req.query.since : undefined;
  const since = rawSince ? new Date(rawSince) : new Date(Date.now() - 30_000);
  if (Number.isNaN(since.getTime())) throw new AppError("Invalid notification cursor", 422);
  const rawAfterId = typeof req.query.afterId === "string" ? req.query.afterId : undefined;
  if (rawAfterId && !z.string().uuid().safeParse(rawAfterId).success) {
    throw new AppError("Invalid notification cursor", 422);
  }
  // Bound the cursor to avoid unbounded history scans from a stale or forged client value.
  const boundedSince = new Date(Math.max(since.getTime(), Date.now() - 24 * 60 * 60 * 1000));
  const cursorWasBounded = boundedSince.getTime() !== since.getTime();
  const messages = await prisma.chatMessage.findMany({
    where: {
      senderUserId: { not: userId },
      deletedAt: null,
      ...(rawAfterId && !cursorWasBounded
        ? { OR: [{ createdAt: { gt: boundedSince } }, { createdAt: boundedSince, id: { gt: rawAfterId } }] }
        : { createdAt: { gt: boundedSince } }),
      conversation: {
        businessId,
        participants: { some: { userId, leftAt: null } },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 30,
    include: {
      sender: { select: { id: true, fullName: true } },
      conversation: { select: { id: true, title: true, kind: true } },
    },
  });
  res.json({
    data: messages.map((message) => ({
      id: message.id,
      conversationId: message.conversation.id,
      conversationTitle: message.conversation.title,
      conversationKind: message.conversation.kind,
      senderId: message.sender.id,
      senderName: message.sender.fullName,
      createdAt: message.createdAt,
    })),
  });
}

export async function streamEvents(req: Request, res: Response) {
  const { userId, businessId } = scope(req);
  const securityRole = req.user!.securityRole;
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(": connected\n\n");

  // Recheck the current chat permission before each event so a revoked grant
  // cannot keep receiving metadata on an already-open stream.
  let deliveryQueue = Promise.resolve();
  const unsubscribe = subscribeChatEvents(businessId, userId, (event) => {
    deliveryQueue = deliveryQueue.then(async () => {
      if (res.writableEnded) return;
      const allowed = await hasPermission(userId, businessId, securityRole, "chat.view");
      if (!allowed) {
        res.end();
        return;
      }
      res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }).catch(() => {
      if (!res.writableEnded) res.end();
    });
  });
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": heartbeat\n\n");
  }, 25_000);
  const maxLifetime = setTimeout(() => res.end(), 5 * 60 * 1000);
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(maxLifetime);
    unsubscribe();
  };
  res.on("close", cleanup);
  req.on("aborted", cleanup);
}

async function publishConversationEvent(
  businessId: string,
  conversationId: string,
  event: Omit<ChatRealtimeEvent, "conversationId">,
) {
  const recipients = await prisma.chatParticipant.findMany({
    where: { conversationId, leftAt: null, conversation: { businessId } },
    select: { userId: true },
  }).catch(() => []);
  publishChatEvent(businessId, recipients.map((participant) => participant.userId), {
    ...event,
    conversationId,
  });
}

function scope(req: Request) {
  if (!req.user?.id || !req.user.businessId) throw new AppError("Business account required", 403);
  if (!req.branchId) throw new AppError("Choose an active branch to use chat", 400);
  return { userId: req.user.id, businessId: req.user.businessId, branchId: req.branchId };
}

async function requireMembership(conversationId: string, userId: string, businessId: string, branchId: string) {
  void branchId; // The request branch is validated by middleware; membership may span branches within this business.
  const participant = await prisma.chatParticipant.findFirst({
    where: { conversationId, userId, leftAt: null, conversation: { businessId } },
    include: { conversation: true },
  });
  if (!participant) throw new AppError("Conversation not found", 404);
  return participant;
}

async function eligibleColleagueIds(businessId: string, branchId: string, excludeUserId: string, includeCrossBranch = false) {
  const users = await prisma.user.findMany({
    where: {
      businessId, id: { not: excludeUserId }, isActive: true, deletedAt: null,
      branches: { some: includeCrossBranch
        ? { branch: { businessId, isActive: true } }
        : { branchId, branch: { isActive: true } } },
    },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

export async function listDirectory(req: Request, res: Response) {
  const { userId, businessId, branchId } = scope(req);
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 80) : "";
  const crossBranchAllowed = await hasPermission(userId, businessId, req.user!.securityRole, "chat.cross_branch");
  const users = await prisma.user.findMany({
    where: {
      businessId, id: { not: userId }, isActive: true, deletedAt: null,
      branches: { some: crossBranchAllowed
        ? { branch: { businessId, isActive: true } }
        : { branchId, branch: { isActive: true } } },
      ...(search ? { OR: [
        { fullName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ] } : {}),
    },
    select: {
      id: true, fullName: true, email: true, role: true,
      branches: { where: { branch: { businessId, isActive: true } }, select: { branch: { select: { id: true, name: true } } } },
    },
    orderBy: { fullName: "asc" },
    take: 50,
  });
  res.json({ data: users.map(({ branches, ...user }) => ({ ...user, branches: branches.map(({ branch }) => branch) })) });
}

export async function listConversations(req: Request, res: Response) {
  const { userId, businessId } = scope(req);
  const participants = await prisma.chatParticipant.findMany({
    where: { userId, leftAt: null, archivedAt: null, conversation: { businessId } },
    include: {
      conversation: {
        include: {
          participants: {
            where: { leftAt: null },
            include: { user: { select: { id: true, fullName: true, role: true } } },
          },
          messages: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1,
            include: { sender: { select: { id: true, fullName: true } } } },
        },
      },
    },
    orderBy: { conversation: { lastMessageAt: "desc" } },
    take: 100,
  });
  const data = await Promise.all(participants.map(async (participant) => {
    const readMarker = participant.lastReadMessageId
      ? await prisma.chatMessage.findUnique({ where: { id: participant.lastReadMessageId }, select: { id: true, createdAt: true } })
      : null;
    const unreadCount = await prisma.chatMessage.count({
      where: {
        conversationId: participant.conversationId,
        senderUserId: { not: userId },
        deletedAt: null,
        ...(readMarker
          ? { OR: [
              { createdAt: { gt: readMarker.createdAt } },
              { createdAt: readMarker.createdAt, id: { gt: readMarker.id } },
            ] }
          : participant.lastReadAt ? { createdAt: { gt: participant.lastReadAt } } : {}),
      },
    });
    return {
      ...participant.conversation,
      myRole: participant.role,
      lastReadAt: participant.lastReadAt,
      unreadCount,
      lastMessage: participant.conversation.messages[0] ?? null,
    };
  }));
  res.json({ data });
}

export async function createDirectConversation(req: Request, res: Response) {
  const { userId, businessId, branchId } = scope(req);
  const targetUserId = z.string().uuid().parse(req.params.userId);
  if (targetUserId === userId) throw new AppError("You cannot start a chat with yourself", 422);
  const target = await prisma.user.findFirst({
    where: { id: targetUserId, businessId, isActive: true, deletedAt: null, branches: { some: { branch: { businessId, isActive: true } } } },
    select: { id: true, branches: { where: { branch: { isActive: true, businessId } }, select: { branchId: true } } },
  });
  if (!target) throw new AppError("This colleague is not available in this business", 404);
  const sameBranch = target.branches.some((membership) => membership.branchId === branchId);
  if (!sameBranch && !(await hasPermission(userId, businessId, req.user!.securityRole, "chat.cross_branch"))) {
    throw new AppError("Cross-branch chat permission is required to contact this colleague", 403);
  }
  const directKey = [userId, targetUserId].sort().join(":");
  const existing = await prisma.chatConversation.findFirst({
    where: { businessId, directKey, AND: [
      { participants: { some: { userId, leftAt: null } } },
      { participants: { some: { userId: targetUserId, leftAt: null } } },
    ] },
    include: { participants: { include: { user: { select: { id: true, fullName: true } } } } },
  });
  if (existing) { res.status(200).json({ data: existing }); return; }
  const conversation = await prisma.chatConversation.upsert({
    where: { businessId_directKey: { businessId, directKey } },
    update: {},
    create: {
      businessId, branchId, kind: "DIRECT", directKey, createdByUserId: userId,
      participants: { create: [
        { userId, role: "OWNER" }, { userId: targetUserId, role: "MEMBER" },
      ] },
    },
    include: { participants: { include: { user: { select: { id: true, fullName: true } } } } },
  });
  res.status(200).json({ data: conversation });
}

export async function createGroupConversation(req: Request, res: Response) {
  const { userId, businessId, branchId } = scope(req);
  const input = groupSchema.parse(req.body);
  const crossBranchAllowed = await hasPermission(userId, businessId, req.user!.securityRole, "chat.cross_branch");
  const eligibleIds = await eligibleColleagueIds(businessId, branchId, userId, crossBranchAllowed);
  const branchEligibleIds = await eligibleColleagueIds(businessId, branchId, userId, false);
  const requested = input.includeAllEligible ? eligibleIds : [...new Set(input.participantIds)];
  if (!crossBranchAllowed && requested.some((id) => !branchEligibleIds.includes(id))) {
    throw new AppError("Cross-branch chat permission is required to add colleagues from another branch", 403);
  }
  if (requested.some((id) => !eligibleIds.includes(id))) {
    throw new AppError("One or more selected colleagues are not eligible for this business", 422);
  }
  if (requested.length < 2) throw new AppError("A group needs at least two other participants", 422);
  if (requested.length > 50 && !input.confirmLargeGroup) {
    throw new AppError("This group includes more than 50 colleagues. Confirm the large group before creating it.", 409);
  }
  const conversation = await prisma.chatConversation.create({
    data: {
      businessId, branchId, kind: "GROUP", title: input.title,
      ...(input.description !== undefined ? { description: input.description } : {}),
      createdByUserId: userId,
      participants: { create: [
        { userId, role: "OWNER" },
        ...requested.map((id) => ({ userId: id, role: "MEMBER" as const })),
      ] },
      messages: { create: { senderUserId: userId, kind: "SYSTEM", body: "Group created" } },
    },
    include: { participants: { include: { user: { select: { id: true, fullName: true } } } } },
  });
  await recordAuditEvent({
    action: "chat.group.created", entityType: "ChatConversation", entityId: conversation.id,
    businessId, actorUserId: userId, branchId, correlationId: req.correlationId ?? null,
    metadata: { participantCount: requested.length + 1 },
  });
  res.status(201).json({ data: conversation });
}

export async function listMessages(req: Request, res: Response) {
  const { userId, businessId, branchId } = scope(req);
  const conversationId = z.string().uuid().parse(req.params.id);
  await requireMembership(conversationId, userId, businessId, branchId);
  const before = typeof req.query.before === "string" ? req.query.before : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId, deletedAt: null, ...(search ? { body: { contains: search, mode: "insensitive" as const } } : {}) },
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    include: {
      sender: { select: { id: true, fullName: true } },
      attachments: { where: { deletedAt: null }, select: { id: true, originalName: true, safeMimeType: true, sizeBytes: true } },
      reactions: { include: { user: { select: { id: true, fullName: true } } } },
      replyTo: { select: { id: true, body: true, deletedAt: true, sender: { select: { fullName: true } } } },
    },
  });
  res.json({ data: messages.reverse().map((message) => ({
    ...message,
    replyTo: message.replyTo?.deletedAt ? null : message.replyTo,
  })) });
}

export async function sendMessage(req: Request, res: Response) {
  const { userId, businessId, branchId } = scope(req);
  const conversationId = z.string().uuid().parse(req.params.id);
  await requireMembership(conversationId, userId, businessId, branchId);
  const input = messageSchema.parse(req.body);
  if (!input.body && input.attachmentIds.length === 0) throw new AppError("Write a message or attach a file", 422);

  // Idempotency is checked before validating unattached uploads. A retry after
  // a successful send must return the original message even though its files
  // are now linked to that message rather than remaining unattached.
  const messageInclude = {
    sender: { select: { id: true, fullName: true } },
    attachments: { where: { deletedAt: null }, select: { id: true, originalName: true, safeMimeType: true, sizeBytes: true } },
  } as const;
  if (input.clientMessageId) {
    const existing = await prisma.chatMessage.findFirst({
      where: { conversationId, senderUserId: userId, clientMessageId: input.clientMessageId },
      include: messageInclude,
    });
    if (existing) { res.status(200).json({ data: existing }); return; }
  }

  if (input.attachmentIds.length) {
    const owned = await prisma.chatAttachment.findMany({
      where: { id: { in: input.attachmentIds }, businessId, conversationId, uploadedByUserId: userId, messageId: null, deletedAt: null },
      select: { id: true },
    });
    if (owned.length !== input.attachmentIds.length) throw new AppError("One or more attachments are unavailable", 404);
  }
  if (input.replyToMessageId) {
    const reply = await prisma.chatMessage.findFirst({ where: { id: input.replyToMessageId, conversationId, deletedAt: null } });
    if (!reply) throw new AppError("The message you are replying to is unavailable", 404);
  }
  let message: Awaited<ReturnType<typeof prisma.chatMessage.findFirst>>;
  let duplicateRequest = false;
  try {
    message = await prisma.$transaction(async (tx) => {
      if (input.clientMessageId) {
        const existing = await tx.chatMessage.findFirst({
          where: { conversationId, senderUserId: userId, clientMessageId: input.clientMessageId },
          include: messageInclude,
        });
        if (existing) { duplicateRequest = true; return existing; }
      }
      const created = await tx.chatMessage.create({
        data: {
          conversationId, senderUserId: userId, body: input.body,
          ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
          ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
          ...(input.attachmentIds.length ? { attachments: { connect: input.attachmentIds.map((id) => ({ id })) } } : {}),
        },
        include: messageInclude,
      });
      await tx.chatConversation.update({ where: { id: conversationId }, data: { lastMessageAt: created.createdAt } });
      return created;
    });
  } catch (error) {
    // Concurrent retries can both pass the preflight lookup. The database
    // unique key is the final arbiter; return the winning request's message.
    const isUniqueConflict = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    if (!isUniqueConflict || !input.clientMessageId) throw error;
    const existing = await prisma.chatMessage.findFirst({
      where: { conversationId, senderUserId: userId, clientMessageId: input.clientMessageId },
      include: messageInclude,
    });
    if (!existing) throw error;
    duplicateRequest = true;
    message = existing;
  }
  if (!duplicateRequest && message) {
    await publishConversationEvent(businessId, conversationId, {
      id: message.id,
      type: "message.created",
      messageId: message.id,
      createdAt: message.createdAt.toISOString(),
    });
  }
  res.status(duplicateRequest ? 200 : 201).json({ data: message });
}

export async function editMessage(req: Request, res: Response) {
  const { userId, businessId, branchId } = scope(req);
  const conversationId = z.string().uuid().parse(req.params.id);
  const messageId = z.string().uuid().parse(req.params.messageId);
  await requireMembership(conversationId, userId, businessId, branchId);
  const { body } = editMessageSchema.parse(req.body);
  const existing = await prisma.chatMessage.findFirst({
    where: { id: messageId, conversationId, senderUserId: userId, kind: "TEXT", deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new AppError("Message not found or cannot be edited", 404);
  const message = await prisma.chatMessage.update({
    where: { id: messageId },
    data: { body, editedAt: new Date() },
    include: { sender: { select: { id: true, fullName: true } } },
  });
  await recordAuditEvent({
    action: "chat.message.edited", entityType: "ChatMessage", entityId: messageId,
    businessId, branchId, actorUserId: userId, correlationId: req.correlationId ?? null,
    metadata: { conversationId },
  });
  await publishConversationEvent(businessId, conversationId, {
    id: messageId + ":updated:" + message.updatedAt.getTime(),
    type: "message.updated",
    messageId,
    actorUserId: userId,
    createdAt: new Date().toISOString(),
  });
  res.json({ data: message });
}

export async function deleteMessage(req: Request, res: Response) {
  const { userId, businessId, branchId } = scope(req);
  const conversationId = z.string().uuid().parse(req.params.id);
  const messageId = z.string().uuid().parse(req.params.messageId);
  await requireMembership(conversationId, userId, businessId, branchId);
  const existing = await prisma.chatMessage.findFirst({
    where: { id: messageId, conversationId, senderUserId: userId, kind: "TEXT", deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new AppError("Message not found or cannot be deleted", 404);
  await prisma.chatMessage.update({
    where: { id: messageId },
    data: { body: "This message was deleted", deletedAt: new Date(), editedAt: null },
  });
  await recordAuditEvent({
    action: "chat.message.deleted", entityType: "ChatMessage", entityId: messageId,
    businessId, branchId, actorUserId: userId, correlationId: req.correlationId ?? null,
    metadata: { conversationId },
  });
  await publishConversationEvent(businessId, conversationId, {
    id: messageId + ":deleted:" + Date.now(),
    type: "message.deleted",
    messageId,
    actorUserId: userId,
    createdAt: new Date().toISOString(),
  });
  res.status(204).end();
}

export async function markConversationRead(req: Request, res: Response) {
  const { userId, businessId, branchId } = scope(req);
  const conversationId = z.string().uuid().parse(req.params.id);
  await requireMembership(conversationId, userId, businessId, branchId);
  const latest = await prisma.chatMessage.findFirst({ where: { conversationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, createdAt: true } });
  await prisma.chatParticipant.updateMany({
    where: { conversationId, userId, leftAt: null },
    data: { lastReadMessageId: latest?.id ?? null, lastReadAt: latest?.createdAt ?? new Date() },
  });
  await publishConversationEvent(businessId, conversationId, {
    id: conversationId + ":read:" + Date.now(),
    type: "conversation.read",
    actorUserId: userId,
    createdAt: new Date().toISOString(),
  });
  res.status(204).end();
}

async function requireGroupAdmin(conversationId: string, userId: string, businessId: string, branchId: string, securityRole: Role) {
  const participant = await requireMembership(conversationId, userId, businessId, branchId);
  const isGroupAdmin = participant.conversation.kind === "GROUP" && ["OWNER", "ADMIN"].includes(participant.role);
  const canModerateAll = await hasPermission(userId, businessId, securityRole, "chat.manage_all_groups");
  if (!isGroupAdmin && !canModerateAll) throw new AppError("Only group owners, administrators, or explicitly authorised moderators can perform this action", 403);
  return participant;
}

export async function updateGroup(req: Request, res: Response) {
  const { userId, businessId, branchId } = scope(req);
  const id = z.string().uuid().parse(req.params.id);
  await requireGroupAdmin(id, userId, businessId, branchId, req.user!.securityRole);
  const input = groupUpdateSchema.parse(req.body);
  const conversation = await prisma.chatConversation.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
  });
  await recordAuditEvent({ action: "chat.group.updated", entityType: "ChatConversation", entityId: id, businessId, branchId, actorUserId: userId, correlationId: req.correlationId ?? null, metadata: { fields: Object.keys(input) } });
  await publishConversationEvent(businessId, id, {
    id: id + ":updated:" + Date.now(), type: "conversation.updated", actorUserId: userId, createdAt: new Date().toISOString(),
  });
  res.json({ data: conversation });
}

export async function addGroupMember(req: Request, res: Response) {
  const { userId, businessId, branchId } = scope(req);
  const id = z.string().uuid().parse(req.params.id);
  const actor = await requireGroupAdmin(id, userId, businessId, branchId, req.user!.securityRole);
  const { userId: newUserId } = memberSchema.parse(req.body);
  const crossBranchAllowed = await hasPermission(userId, businessId, req.user!.securityRole, "chat.cross_branch");
  // Eligibility is relative to the conversation's owning branch, not the
  // administrator's currently selected branch. Otherwise switching branches
  // could bypass chat.cross_branch when adding members to an existing group.
  const conversationBranchId = actor.conversation.branchId;
  const branchEligible = await eligibleColleagueIds(businessId, conversationBranchId, userId, false);
  if (!crossBranchAllowed && !branchEligible.includes(newUserId)) throw new AppError("Cross-branch chat permission is required to add this colleague", 403);
  const eligible = await eligibleColleagueIds(businessId, conversationBranchId, userId, crossBranchAllowed);
  if (!eligible.includes(newUserId)) throw new AppError("This colleague is not eligible for this business", 404);
  const existing = await prisma.chatParticipant.findFirst({ where: { conversationId: id, userId: newUserId } });
  if (existing && !existing.leftAt) throw new AppError("This colleague is already in the group", 409);
  await prisma.chatParticipant.upsert({
    where: { conversationId_userId: { conversationId: id, userId: newUserId } },
    update: { leftAt: null, joinedAt: new Date(), role: "MEMBER", archivedAt: null, lastReadMessageId: null, lastReadAt: null },
    create: { conversationId: id, userId: newUserId, role: "MEMBER" },
  });
  await prisma.chatMessage.create({ data: { conversationId: id, senderUserId: userId, kind: "SYSTEM", body: "A member was added to the group" } });
  await recordAuditEvent({ action: "chat.group.member_added", entityType: "ChatConversation", entityId: id, businessId, branchId, actorUserId: userId, correlationId: req.correlationId ?? null, metadata: { memberUserId: newUserId } });
  await publishConversationEvent(businessId, id, {
    id: id + ":member-added:" + Date.now(), type: "conversation.updated", actorUserId: userId, createdAt: new Date().toISOString(),
  });
  res.status(204).end();
}

export async function removeGroupMember(req: Request, res: Response) {
  const { userId, businessId, branchId } = scope(req);
  const id = z.string().uuid().parse(req.params.id);
  await requireGroupAdmin(id, userId, businessId, branchId, req.user!.securityRole);
  const targetUserId = z.string().uuid().parse(req.params.userId);
  const target = await prisma.chatParticipant.findFirst({ where: { conversationId: id, userId: targetUserId, leftAt: null } });
  if (!target) throw new AppError("Group member not found", 404);
  if (target.role === "OWNER") throw new AppError("The group owner cannot be removed", 409);
  await prisma.chatParticipant.update({ where: { id: target.id }, data: { leftAt: new Date() } });
  await prisma.chatMessage.create({ data: { conversationId: id, senderUserId: userId, kind: "SYSTEM", body: "A member left or was removed from the group" } });
  await recordAuditEvent({ action: "chat.group.member_removed", entityType: "ChatConversation", entityId: id, businessId, branchId, actorUserId: userId, correlationId: req.correlationId ?? null, metadata: { memberUserId: targetUserId } });
  await publishConversationEvent(businessId, id, {
    id: id + ":member-removed:" + Date.now(), type: "conversation.updated", actorUserId: userId, createdAt: new Date().toISOString(),
  });
  publishChatEvent(businessId, [targetUserId], {
    id: id + ":removed-user:" + Date.now(), type: "conversation.updated", conversationId: id, actorUserId: userId, createdAt: new Date().toISOString(),
  });
  res.status(204).end();
}

export async function uploadAttachment(req: Request, res: Response) {
  const { userId, businessId, branchId } = scope(req);
  const conversationId = z.string().uuid().parse(req.params.id);
  await requireMembership(conversationId, userId, businessId, branchId);
  if (!Buffer.isBuffer(req.body)) throw new AppError("Upload a file using application/octet-stream", 415);
  const encodedName = req.header("x-file-name") ?? "attachment";
  let originalName = encodedName;
  try { originalName = decodeURIComponent(encodedName); } catch { throw new AppError("Invalid file name", 422); }
  const mime = req.header("x-file-mime-type") ?? "application/octet-stream";
  const stored = await storeChatFile(businessId, req.body, mime, originalName);
  const attachment = await prisma.chatAttachment.create({
    data: {
      businessId, conversationId, uploadedByUserId: userId,
      storageKey: stored.storageKey, originalName: stored.originalName,
      safeMimeType: stored.safeMimeType, sizeBytes: stored.sizeBytes, checksum: stored.checksum,
    },
    select: { id: true, originalName: true, safeMimeType: true, sizeBytes: true },
  }).catch(async (error) => {
    await deleteChatFile(businessId, stored.storageKey);
    throw error;
  });
  await recordAuditEvent({
    action: "chat.attachment.uploaded", entityType: "ChatAttachment", entityId: attachment.id,
    businessId, actorUserId: userId, branchId, correlationId: req.correlationId ?? null,
    metadata: { mimeType: attachment.safeMimeType, sizeBytes: attachment.sizeBytes },
  });
  res.status(201).json({ data: attachment });
}

export async function downloadAttachment(req: Request, res: Response) {
  const { userId, businessId, branchId } = scope(req);
  const id = z.string().uuid().parse(req.params.id);
  const attachment = await prisma.chatAttachment.findFirst({
    where: {
      id, businessId, deletedAt: null,
      OR: [{ messageId: null }, { message: { is: { deletedAt: null } } }],
    },
    select: { id: true, conversationId: true, storageKey: true, originalName: true, safeMimeType: true },
  });
  if (!attachment) throw new AppError("Attachment not found", 404);
  await requireMembership(attachment.conversationId, userId, businessId, branchId);
  const file = await readChatFile(businessId, attachment.storageKey);
  const safeName = attachment.originalName.replace(/["\\r\\n]/g, "_");
  res.setHeader("Content-Type", attachment.safeMimeType);
  res.setHeader("Content-Length", String(file.length));
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).send(file);
}

export async function setGroupMemberRole(req: Request, res: Response) {
  const { userId, businessId, branchId } = scope(req);
  const id = z.string().uuid().parse(req.params.id);
  const actor = await requireGroupAdmin(id, userId, businessId, branchId, req.user!.securityRole);
  if (actor.role !== "OWNER" && !(await hasPermission(userId, businessId, req.user!.securityRole, "chat.manage_all_groups"))) {
    throw new AppError("Only the group owner can appoint or remove group administrators", 403);
  }
  const targetUserId = z.string().uuid().parse(req.params.userId);
  const { role } = memberRoleSchema.parse(req.body);
  const target = await prisma.chatParticipant.findFirst({ where: { conversationId: id, userId: targetUserId, leftAt: null } });
  if (!target || target.role === "OWNER") throw new AppError("Group member not found or cannot be changed", 404);
  await prisma.chatParticipant.update({ where: { id: target.id }, data: { role } });
  await prisma.chatMessage.create({ data: { conversationId: id, senderUserId: userId, kind: "SYSTEM", body: role === "ADMIN" ? "A group administrator was appointed" : "A group administrator role was removed" } });
  await recordAuditEvent({ action: "chat.group.member_role_updated", entityType: "ChatConversation", entityId: id, businessId, branchId, actorUserId: userId, correlationId: req.correlationId ?? null, metadata: { memberUserId: targetUserId, role } });
  await publishConversationEvent(businessId, id, {
    id: id + ":member-role:" + Date.now(), type: "conversation.updated", actorUserId: userId, createdAt: new Date().toISOString(),
  });
  res.status(204).end();
}

export async function toggleReaction(req: Request, res: Response) {
  const { userId, businessId, branchId } = scope(req);
  const conversationId = z.string().uuid().parse(req.params.id);
  const messageId = z.string().uuid().parse(req.params.messageId);
  await requireMembership(conversationId, userId, businessId, branchId);
  const { emoji } = reactionSchema.parse(req.body);
  const message = await prisma.chatMessage.findFirst({ where: { id: messageId, conversationId, deletedAt: null }, select: { id: true } });
  if (!message) throw new AppError("Message not found", 404);
  const existing = await prisma.chatReaction.findFirst({ where: { messageId, userId, emoji } });
  if (existing) await prisma.chatReaction.delete({ where: { id: existing.id } });
  else await prisma.chatReaction.create({ data: { messageId, userId, emoji } });
  await publishConversationEvent(businessId, conversationId, {
    id: messageId + ":reaction:" + Date.now(), type: "message.reaction", messageId, actorUserId: userId, createdAt: new Date().toISOString(),
  });
  res.status(204).end();
}

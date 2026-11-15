import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";

const groupSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  participantIds: z.array(z.string().uuid()).max(200).default([]),
  includeAllEligible: z.boolean().default(false),
  confirmLargeGroup: z.boolean().default(false),
});
const messageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  clientMessageId: z.string().min(1).max(100).optional(),
  replyToMessageId: z.string().uuid().optional(),
});
const groupUpdateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});
const memberSchema = z.object({ userId: z.string().uuid() });
const reactionSchema = z.object({ emoji: z.string().trim().min(1).max(16) });

function scope(req: Request) {
  if (!req.user?.id || !req.user.businessId) throw new AppError("Business account required", 403);
  if (!req.branchId) throw new AppError("Choose an active branch to use chat", 400);
  return { userId: req.user.id, businessId: req.user.businessId, branchId: req.branchId };
}

async function requireMembership(conversationId: string, userId: string, businessId: string) {
  const participant = await prisma.chatParticipant.findFirst({
    where: { conversationId, userId, leftAt: null, conversation: { businessId } },
    include: { conversation: true },
  });
  if (!participant) throw new AppError("Conversation not found", 404);
  return participant;
}

async function eligibleColleagueIds(businessId: string, branchId: string, excludeUserId: string) {
  const users = await prisma.user.findMany({
    where: {
      businessId, id: { not: excludeUserId }, isActive: true, deletedAt: null,
      branches: { some: { branchId, branch: { isActive: true } } },
    },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

export async function listDirectory(req: Request, res: Response) {
  const { userId, businessId, branchId } = scope(req);
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 80) : "";
  const users = await prisma.user.findMany({
    where: {
      businessId, id: { not: userId }, isActive: true, deletedAt: null,
      branches: { some: { branchId, branch: { isActive: true } } },
      ...(search ? { OR: [
        { fullName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ] } : {}),
    },
    select: { id: true, fullName: true, email: true, role: true },
    orderBy: { fullName: "asc" },
    take: 50,
  });
  res.json({ data: users });
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
    const unreadCount = await prisma.chatMessage.count({
      where: {
        conversationId: participant.conversationId,
        senderUserId: { not: userId },
        deletedAt: null,
        ...(participant.lastReadAt ? { createdAt: { gt: participant.lastReadAt } } : {}),
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
  const eligible = await eligibleColleagueIds(businessId, branchId, userId);
  if (!eligible.includes(targetUserId)) throw new AppError("This colleague is not available in your branch", 404);
  const directKey = [userId, targetUserId].sort().join(":");
  const conversation = await prisma.chatConversation.upsert({
    where: { businessId_directKey: { businessId, directKey } },
    update: {},
    create: {
      businessId, kind: "DIRECT", directKey, createdByUserId: userId,
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
  const eligibleIds = await eligibleColleagueIds(businessId, branchId, userId);
  const requested = input.includeAllEligible ? eligibleIds : [...new Set(input.participantIds)];
  if (requested.some((id) => !eligibleIds.includes(id))) {
    throw new AppError("One or more selected colleagues are not eligible for this branch", 422);
  }
  if (requested.length < 2) throw new AppError("A group needs at least two other participants", 422);
  if (requested.length > 50 && !input.confirmLargeGroup) {
    throw new AppError("This group includes more than 50 colleagues. Confirm the large group before creating it.", 409);
  }
  const conversation = await prisma.chatConversation.create({
    data: {
      businessId, kind: "GROUP", title: input.title,
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
    businessId, actorUserId: userId, branchId: null, correlationId: req.correlationId ?? null,
    metadata: { participantCount: requested.length + 1 },
  });
  res.status(201).json({ data: conversation });
}

export async function listMessages(req: Request, res: Response) {
  const { userId, businessId } = scope(req);
  const conversationId = z.string().uuid().parse(req.params.id);
  await requireMembership(conversationId, userId, businessId);
  const before = typeof req.query.before === "string" ? req.query.before : undefined;
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId },
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    include: {
      sender: { select: { id: true, fullName: true } },
      attachments: { where: { deletedAt: null }, select: { id: true, originalName: true, safeMimeType: true, sizeBytes: true } },
      reactions: { include: { user: { select: { id: true, fullName: true } } } },
      replyTo: { select: { id: true, body: true, sender: { select: { fullName: true } } } },
    },
  });
  res.json({ data: messages.reverse() });
}

export async function sendMessage(req: Request, res: Response) {
  const { userId, businessId } = scope(req);
  const conversationId = z.string().uuid().parse(req.params.id);
  await requireMembership(conversationId, userId, businessId);
  const input = messageSchema.parse(req.body);
  if (input.replyToMessageId) {
    const reply = await prisma.chatMessage.findFirst({ where: { id: input.replyToMessageId, conversationId } });
    if (!reply) throw new AppError("The message you are replying to is unavailable", 404);
  }
  const message = await prisma.$transaction(async (tx) => {
    if (input.clientMessageId) {
      const existing = await tx.chatMessage.findFirst({
        where: { conversationId, senderUserId: userId, clientMessageId: input.clientMessageId },
      });
      if (existing) return existing;
    }
    const created = await tx.chatMessage.create({
      data: {
        conversationId, senderUserId: userId, body: input.body,
        ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
        ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
      },
      include: { sender: { select: { id: true, fullName: true } } },
    });
    await tx.chatConversation.update({ where: { id: conversationId }, data: { lastMessageAt: created.createdAt } });
    return created;
  });
  res.status(201).json({ data: message });
}

export async function markConversationRead(req: Request, res: Response) {
  const { userId, businessId } = scope(req);
  const conversationId = z.string().uuid().parse(req.params.id);
  await requireMembership(conversationId, userId, businessId);
  const latest = await prisma.chatMessage.findFirst({ where: { conversationId }, orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true } });
  await prisma.chatParticipant.updateMany({
    where: { conversationId, userId, leftAt: null },
    data: { lastReadMessageId: latest?.id ?? null, lastReadAt: latest?.createdAt ?? new Date() },
  });
  res.status(204).end();
}

async function requireGroupAdmin(conversationId: string, userId: string, businessId: string) {
  const participant = await requireMembership(conversationId, userId, businessId);
  if (participant.conversation.kind !== "GROUP" || !["OWNER", "ADMIN"].includes(participant.role)) {
    throw new AppError("Only group owners and administrators can perform this action", 403);
  }
  return participant;
}

export async function updateGroup(req: Request, res: Response) {
  const { userId, businessId } = scope(req);
  const id = z.string().uuid().parse(req.params.id);
  await requireGroupAdmin(id, userId, businessId);
  const input = groupUpdateSchema.parse(req.body);
  const conversation = await prisma.chatConversation.update({
    where: { id }, data: input,
  });
  res.json({ data: conversation });
}

export async function addGroupMember(req: Request, res: Response) {
  const { userId, businessId, branchId } = scope(req);
  const id = z.string().uuid().parse(req.params.id);
  await requireGroupAdmin(id, userId, businessId);
  const { userId: newUserId } = memberSchema.parse(req.body);
  const eligible = await eligibleColleagueIds(businessId, branchId, userId);
  if (!eligible.includes(newUserId)) throw new AppError("This colleague is not eligible for this branch", 404);
  const existing = await prisma.chatParticipant.findFirst({ where: { conversationId: id, userId: newUserId } });
  if (existing && !existing.leftAt) throw new AppError("This colleague is already in the group", 409);
  await prisma.chatParticipant.upsert({
    where: { conversationId_userId: { conversationId: id, userId: newUserId } },
    update: { leftAt: null, joinedAt: new Date(), role: "MEMBER" },
    create: { conversationId: id, userId: newUserId, role: "MEMBER" },
  });
  await prisma.chatMessage.create({ data: { conversationId: id, senderUserId: userId, kind: "SYSTEM", body: "A member was added to the group" } });
  res.status(204).end();
}

export async function removeGroupMember(req: Request, res: Response) {
  const { userId, businessId } = scope(req);
  const id = z.string().uuid().parse(req.params.id);
  await requireGroupAdmin(id, userId, businessId);
  const targetUserId = z.string().uuid().parse(req.params.userId);
  const target = await prisma.chatParticipant.findFirst({ where: { conversationId: id, userId: targetUserId, leftAt: null } });
  if (!target) throw new AppError("Group member not found", 404);
  if (target.role === "OWNER") throw new AppError("The group owner cannot be removed", 409);
  await prisma.chatParticipant.update({ where: { id: target.id }, data: { leftAt: new Date() } });
  await prisma.chatMessage.create({ data: { conversationId: id, senderUserId: userId, kind: "SYSTEM", body: "A member left or was removed from the group" } });
  res.status(204).end();
}

export async function toggleReaction(req: Request, res: Response) {
  const { userId, businessId } = scope(req);
  const conversationId = z.string().uuid().parse(req.params.id);
  const messageId = z.string().uuid().parse(req.params.messageId);
  await requireMembership(conversationId, userId, businessId);
  const { emoji } = reactionSchema.parse(req.body);
  const message = await prisma.chatMessage.findFirst({ where: { id: messageId, conversationId }, select: { id: true } });
  if (!message) throw new AppError("Message not found", 404);
  const existing = await prisma.chatReaction.findFirst({ where: { messageId, userId, emoji } });
  if (existing) await prisma.chatReaction.delete({ where: { id: existing.id } });
  else await prisma.chatReaction.create({ data: { messageId, userId, emoji } });
  res.status(204).end();
}

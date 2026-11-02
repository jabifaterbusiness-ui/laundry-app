import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

export async function listBusinessInbox(userId: string, businessId: string) {
  const now = new Date();
  const [messages, unreadCount] = await Promise.all([
    prisma.businessInboxMessage.findMany({
      where: {
        userId,
        businessId,
        publishedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ readAt: "asc" }, { publishedAt: "desc" }],
      take: 100,
      select: {
        id: true,
        broadcastId: true,
        title: true,
        body: true,
        displayDurationMinutes: true,
        publishedAt: true,
        expiresAt: true,
        readAt: true,
        dismissedAt: true,
      },
    }),
    prisma.businessInboxMessage.count({
      where: {
        userId,
        businessId,
        readAt: null,
        publishedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    }),
  ]);
  return { messages, unreadCount };
}

export async function markBusinessInboxMessageRead(
  messageId: string,
  userId: string,
  businessId: string,
) {
  const result = await prisma.businessInboxMessage.updateMany({
    where: { id: messageId, userId, businessId, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    const existing = await prisma.businessInboxMessage.findFirst({
      where: { id: messageId, userId, businessId },
      select: { id: true, readAt: true },
    });
    if (!existing) throw new AppError("Inbox message not found", 404);
    return existing;
  }
  return prisma.businessInboxMessage.findFirst({
    where: { id: messageId, userId, businessId },
    select: { id: true, readAt: true },
  });
}

export async function dismissBusinessInboxPopup(
  messageId: string,
  userId: string,
  businessId: string,
) {
  const result = await prisma.businessInboxMessage.updateMany({
    where: { id: messageId, userId, businessId, dismissedAt: null },
    data: { dismissedAt: new Date() },
  });
  if (result.count === 0) {
    const existing = await prisma.businessInboxMessage.findFirst({
      where: { id: messageId, userId, businessId },
      select: { id: true, dismissedAt: true },
    });
    if (!existing) throw new AppError("Inbox message not found", 404);
    return existing;
  }
  return prisma.businessInboxMessage.findFirst({
    where: { id: messageId, userId, businessId },
    select: { id: true, dismissedAt: true },
  });
}

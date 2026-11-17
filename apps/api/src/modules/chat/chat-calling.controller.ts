import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

const inputSchema = z.object({ conversationId: z.string().uuid() });

export async function createCallingToken(req: Request, res: Response) {
  if (!req.user?.id || !req.user.businessId) throw new AppError("Business account required", 403);
  const { conversationId } = inputSchema.parse(req.body);
  const [platformConfig, access, participant, user] = await Promise.all([
    prisma.platformCallingConfig.findUnique({ where: { id: "00000000-0000-4000-8000-000000000002" } }),
    prisma.businessCallingAccess.findUnique({ where: { businessId: req.user.businessId }, select: { granted: true } }),
    prisma.chatParticipant.findFirst({
      where: { conversationId, userId: req.user.id, leftAt: null, conversation: { businessId: req.user.businessId } },
      select: { conversation: { select: { id: true, businessId: true } } },
    }),
    prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, fullName: true, isActive: true, businessId: true } }),
  ]);
  if (!platformConfig?.globallyEnabled || !access?.granted) throw new AppError("Audio and video calling is not enabled for this business.", 403);
  if (!participant || !user || !user.isActive || user.businessId !== req.user.businessId) throw new AppError("Conversation not found", 404);
  const liveKitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!liveKitUrl || !apiKey || !apiSecret) throw new AppError("The self-hosted calling service is not configured.", 503);
  const roomName = `la-${req.user.businessId}-${conversationId}`;
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 10 * 60;
  const token = jwt.sign({
    name: user.fullName,
    nbf: issuedAt,
    video: { roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true },
  }, apiSecret, { algorithm: "HS256", issuer: apiKey, subject: user.id, expiresIn: "10m" });
  res.status(200).json({ token, serverUrl: liveKitUrl, roomName, expiresAt: new Date(expiresAt * 1000).toISOString() });
}

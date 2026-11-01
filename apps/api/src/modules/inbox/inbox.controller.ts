import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import {
  dismissBusinessInboxPopup,
  listBusinessInbox,
  markBusinessInboxMessageRead,
} from "./inbox.service.js";

function getIdentity(req: Request) {
  if (!req.user?.id || !req.user.businessId) {
    throw new AppError("A business account is required to access the inbox", 403);
  }
  return { userId: req.user.id, businessId: req.user.businessId };
}

export async function inbox(req: Request, res: Response) {
  const identity = getIdentity(req);
  res.status(200).json(await listBusinessInbox(identity.userId, identity.businessId));
}

export async function markInboxMessageRead(req: Request, res: Response) {
  const identity = getIdentity(req);
  const messageId = req.params.messageId;
  if (!messageId) throw new AppError("Message ID is required", 400);
  res.status(200).json(await markBusinessInboxMessageRead(messageId, identity.userId, identity.businessId));
}

export async function dismissInboxMessage(req: Request, res: Response) {
  const identity = getIdentity(req);
  const messageId = req.params.messageId;
  if (!messageId) throw new AppError("Message ID is required", 400);
  res.status(200).json(await dismissBusinessInboxPopup(messageId, identity.userId, identity.businessId));
}

import type { Request, Response } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { recordAuditEvent } from "../../lib/audit.js";
import {
  createAnnouncementSchema, reminderConfigSchema, reminderSendSchema,
  statusRuleIdSchema, statusRuleSchema,
} from "./communications.validation.js";
import {
  createAnnouncement, getUnpickedOrderReminderConfig, listCommunicationDeliveries, listOrderStatusRules,
  listUnpickedOrders, removeOrderStatusRule, saveOrderStatusRule,
  saveUnpickedOrderReminderConfig, sendUnpickedReminders,
} from "./communications.service.js";
function requireBusinessId(req: Request): string {
  if (!req.user?.businessId) throw new AppError("This action requires an account scoped to a business", 403);
  return req.user.businessId;
}
export async function sendAnnouncement(req: Request, res: Response) {
  const id = requireBusinessId(req);
  const input = createAnnouncementSchema.parse(req.body);
  const result = await createAnnouncement({
    businessId: id, createdByUserId: req.user!.id,
    title: input.title, message: input.message, channels: input.channels, audience: input.audience,
    ...(input.customerIds !== undefined ? { customerIds: input.customerIds } : {}),
  });
  await recordAuditEvent({ action: "communications.announcement_sent", entityType: "AnnouncementCampaign", entityId: result.campaignId, businessId: id, actorUserId: req.user!.id, correlationId: req.correlationId ?? null, metadata: { recipientCount: result.recipientCount, channels: input.channels, audience: input.audience } });
  res.status(201).json(result);
}
export async function listStatusRules(req: Request, res: Response) {
  res.status(200).json({ data: await listOrderStatusRules(requireBusinessId(req)) });
}
export async function saveStatusRule(req: Request, res: Response) {
  const id = requireBusinessId(req);
  const input = statusRuleSchema.parse(req.body);
  const rule = await saveOrderStatusRule({
    businessId: id, status: input.status, enabled: input.enabled, channel: input.channel,
    ...(input.whatsappMessage !== undefined ? { whatsappMessage: input.whatsappMessage } : {}),
    ...(input.emailSubject !== undefined ? { emailSubject: input.emailSubject } : {}),
    ...(input.emailMessage !== undefined ? { emailMessage: input.emailMessage } : {}),
  });
  await recordAuditEvent({ action: "communications.status_rule_saved", entityType: "OrderStatusNotificationRule", entityId: rule.id, businessId: id, actorUserId: req.user!.id, correlationId: req.correlationId ?? null, metadata: { status: rule.status, enabled: rule.enabled, channel: rule.channel } });
  res.status(200).json(rule);
}
export async function deleteStatusRule(req: Request, res: Response) {
  const id = requireBusinessId(req);
  const { id: ruleId } = statusRuleIdSchema.parse(req.params);
  await removeOrderStatusRule(ruleId, id);
  res.status(204).send();
}
export async function getReminderConfig(req: Request, res: Response) {
  res.status(200).json(await getUnpickedOrderReminderConfig(requireBusinessId(req)));
}
export async function saveReminderConfig(req: Request, res: Response) {
  const id = requireBusinessId(req);
  const input = reminderConfigSchema.parse(req.body);
  const config = await saveUnpickedOrderReminderConfig(id, input);
  await recordAuditEvent({ action: "communications.unpicked_reminder_config_saved", entityType: "UnpickedOrderReminderConfig", entityId: config.id, businessId: id, actorUserId: req.user!.id, correlationId: req.correlationId ?? null, metadata: input });
  res.status(200).json(config);
}
export async function getUnpickedOrders(req: Request, res: Response) {
  res.status(200).json({ data: await listUnpickedOrders(requireBusinessId(req)) });
}
export async function sendReminders(req: Request, res: Response) {
  const id = requireBusinessId(req);
  const input = reminderSendSchema.parse(req.body);
  const result = await sendUnpickedReminders({ businessId: id, ...input });
  await recordAuditEvent({ action: "communications.unpicked_reminders_sent", entityType: "Order", entityId: "bulk", businessId: id, actorUserId: req.user!.id, correlationId: req.correlationId ?? null, metadata: { orderCount: result.orderCount, channels: input.channels } });
  res.status(200).json(result);
}


export async function getDeliveries(req: Request, res: Response) {
  res.status(200).json({ data: await listCommunicationDeliveries(requireBusinessId(req)) });
}

import { z } from "zod";
const channelSchema = z.enum(["WHATSAPP", "EMAIL"]);
export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(180),
  message: z.string().trim().min(1).max(4000),
  channels: z.array(channelSchema).min(1).max(2),
  audience: z.enum(["ALL_CUSTOMERS", "SELECTED_CUSTOMERS"]),
  customerIds: z.array(z.string().uuid()).max(2000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.audience === "SELECTED_CUSTOMERS" && (!value.customerIds || value.customerIds.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select at least one customer", path: ["customerIds"] });
  }
});
export const statusRuleSchema = z.object({
  status: z.enum(["RECEIVED", "IN_PROGRESS", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"]),
  enabled: z.boolean(),
  channel: z.enum(["WHATSAPP", "EMAIL", "BOTH"]),
  whatsappMessage: z.string().max(4000).nullable().optional(),
  emailSubject: z.string().max(180).nullable().optional(),
  emailMessage: z.string().max(4000).nullable().optional(),
}).strict();
export const statusRuleIdSchema = z.object({ id: z.string().uuid() });
export const reminderConfigSchema = z.object({
  enabled: z.boolean(),
  thresholdMonths: z.number().int().min(1).max(36),
}).strict();
export const reminderSendSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(500),
  channels: z.array(channelSchema).min(1).max(2),
  message: z.string().trim().min(1).max(4000),
}).strict();

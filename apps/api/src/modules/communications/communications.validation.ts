import { z } from "zod";
const channelSchema = z.enum(["WHATSAPP", "EMAIL"]);
export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(180),
  message: z.string().trim().min(1).max(4000),
  channels: z.array(channelSchema).min(1).max(2),
  whatsappTemplateName: z.string().trim().min(1).max(512).nullable().optional(),
  whatsappTemplateLanguage: z.string().trim().min(2).max(20).nullable().optional(),
  audience: z.enum(["ALL_CUSTOMERS", "SELECTED_CUSTOMERS", "CUSTOMER_GROUP"]),
  customerIds: z.array(z.string().uuid()).max(2000).optional(),
  groupId: z.string().uuid().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.audience === "SELECTED_CUSTOMERS" && (!value.customerIds || value.customerIds.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select at least one customer", path: ["customerIds"] });
  }
  if (value.audience === "CUSTOMER_GROUP" && !value.groupId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose a customer group", path: ["groupId"] });
  }
  if (value.channels.includes("WHATSAPP") && (!value.whatsappTemplateName || !value.whatsappTemplateLanguage)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose an approved WhatsApp MARKETING template for the announcement", path: ["whatsappTemplateName"] });
  }
  if (value.channels.includes("WHATSAPP") && value.message.length > 1024) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "WhatsApp announcement text must be 1,024 characters or fewer when used as a template variable", path: ["message"] });
  }
  if (Boolean(value.whatsappTemplateName) !== Boolean(value.whatsappTemplateLanguage)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose both a template and its language", path: ["whatsappTemplateLanguage"] });
  }
});
export const customerGroupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  customerIds: z.array(z.string().uuid()).max(2000),
}).strict();
export const customerGroupIdSchema = z.object({ id: z.string().uuid() });
export const statusRuleSchema = z.object({
  status: z.enum(["RECEIVED", "IN_PROGRESS", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"]),
  enabled: z.boolean(),
  channel: z.enum(["WHATSAPP", "EMAIL", "BOTH"]),
  whatsappMessage: z.string().max(4000).nullable().optional(),
  whatsappTemplateName: z.string().trim().min(1).max(512).nullable().optional(),
  whatsappTemplateLanguage: z.string().trim().min(2).max(20).nullable().optional(),
  emailSubject: z.string().max(180).nullable().optional(),
  emailMessage: z.string().max(4000).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (Boolean(value.whatsappTemplateName) !== Boolean(value.whatsappTemplateLanguage)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose both a template and its language", path: ["whatsappTemplateLanguage"] });
  }
  if (value.enabled && (value.channel === "WHATSAPP" || value.channel === "BOTH") &&
      (!value.whatsappTemplateName || !value.whatsappTemplateLanguage)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Choose an approved UTILITY template so notifications can still be sent after the 24-hour reply window closes",
      path: ["whatsappTemplateName"],
    });
  }
});
export const statusRuleIdSchema = z.object({ id: z.string().uuid() });
export const reminderConfigSchema = z.object({
  enabled: z.boolean(),
  thresholdMonths: z.number().int().min(1).max(36),
  whatsappTemplateName: z.string().trim().min(1).max(512).nullable().optional(),
  whatsappTemplateLanguage: z.string().trim().min(2).max(20).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (Boolean(value.whatsappTemplateName) !== Boolean(value.whatsappTemplateLanguage)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose both a template and its language", path: ["whatsappTemplateLanguage"] });
  }
});
export const reminderSendSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(500),
  channels: z.array(channelSchema).min(1).max(2),
  message: z.string().trim().min(1).max(4000),
}).strict();

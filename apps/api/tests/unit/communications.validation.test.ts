import { describe, expect, it } from "vitest";
import { createAnnouncementSchema, customerGroupSchema, reminderConfigSchema, statusRuleSchema } from "../../src/modules/communications/communications.validation.js";

const customerId = "d2719f8b-0c4d-4a9d-8f1e-3a8f3f8e7d10";
const groupId = "c9719f8b-0c4d-4a9d-8f1e-3a8f3f8e7d10";

describe("customer communication audience validation", () => {
  it("accepts announcements for all active customers", () => {
    expect(createAnnouncementSchema.safeParse({
      title: "Holiday hours",
      message: "We will close early on Friday.",
      channels: ["EMAIL"],
      audience: "ALL_CUSTOMERS",
    }).success).toBe(true);
  });

  it("requires an approved marketing template fallback for WhatsApp announcements", () => {
    expect(createAnnouncementSchema.safeParse({
      title: "Update", message: "Hello", channels: ["WHATSAPP"], audience: "ALL_CUSTOMERS",
    }).success).toBe(false);
    expect(createAnnouncementSchema.safeParse({
      title: "Update", message: "Hello", channels: ["WHATSAPP"], audience: "ALL_CUSTOMERS",
      whatsappTemplateName: "customer_announcement", whatsappTemplateLanguage: "en",
    }).success).toBe(true);
  });

  it("requires explicit customer IDs for selected-customer announcements", () => {
    expect(createAnnouncementSchema.safeParse({
      title: "Update",
      message: "Hello",
      channels: ["WHATSAPP"],
      whatsappTemplateName: "customer_announcement", whatsappTemplateLanguage: "en",
      audience: "SELECTED_CUSTOMERS",
    }).success).toBe(false);
    expect(createAnnouncementSchema.safeParse({
      title: "Update",
      message: "Hello",
      channels: ["WHATSAPP"],
      audience: "SELECTED_CUSTOMERS",
      customerIds: [customerId],
    }).success).toBe(true);
  });

  it("requires a customer group for group-targeted announcements", () => {
    const base = {
      title: "Group update",
      message: "Hello {{customerName}}",
      channels: ["WHATSAPP"],
      whatsappTemplateName: "group_announcement", whatsappTemplateLanguage: "en",
      audience: "CUSTOMER_GROUP",
    };
    expect(createAnnouncementSchema.safeParse(base).success).toBe(false);
    expect(createAnnouncementSchema.safeParse({ ...base, groupId }).success).toBe(true);
  });

  it("validates group names and UUID membership", () => {
    expect(customerGroupSchema.safeParse({
      name: "VIP customers",
      description: "Priority customers",
      customerIds: [customerId],
    }).success).toBe(true);
    expect(customerGroupSchema.safeParse({
      name: " ",
      customerIds: ["not-a-uuid"],
    }).success).toBe(false);
  });
});


describe("WhatsApp notification template route validation", () => {
  it("accepts a selected approved template and language for an order status", () => {
    expect(statusRuleSchema.safeParse({
      status: "READY_FOR_PICKUP", enabled: true, channel: "WHATSAPP",
      whatsappMessage: "Your order is ready",
      whatsappTemplateName: "order_ready", whatsappTemplateLanguage: "en",
    }).success).toBe(true);
  });

  it("accepts clearing a template fallback", () => {
    expect(statusRuleSchema.safeParse({
      status: "READY_FOR_PICKUP", enabled: true, channel: "WHATSAPP",
      whatsappTemplateName: null, whatsappTemplateLanguage: null,
    }).success).toBe(true);
  });

  it("rejects an invalid template name or language", () => {
    expect(statusRuleSchema.safeParse({
      status: "READY_FOR_PICKUP", enabled: true, channel: "WHATSAPP",
      whatsappTemplateName: "", whatsappTemplateLanguage: "en",
    }).success).toBe(false);
  });
});


describe("unpicked reminder template route validation", () => {
  it("accepts an approved template fallback", () => {
    expect(reminderConfigSchema.safeParse({
      enabled: true, thresholdMonths: 2,
      whatsappTemplateName: "unpicked_order", whatsappTemplateLanguage: "en",
    }).success).toBe(true);
  });

  it("accepts clearing an existing template fallback", () => {
    expect(reminderConfigSchema.safeParse({
      enabled: true, thresholdMonths: 2,
      whatsappTemplateName: null, whatsappTemplateLanguage: null,
    }).success).toBe(true);
  });
});

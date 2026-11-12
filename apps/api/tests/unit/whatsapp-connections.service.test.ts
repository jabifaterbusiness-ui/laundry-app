import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectionFindUnique: vi.fn(),
  connectionUpdate: vi.fn(),
  listApprovedWhatsAppTemplates: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    whatsAppBusinessConnection: {
      findUnique: mocks.connectionFindUnique,
      update: mocks.connectionUpdate,
    },
  },
}));

vi.mock("../../src/config/index.js", () => ({
  config: {
    receiptDelivery: {
      whatsappApiVersion: "v23.0",
      whatsappAppId: "123456",
      whatsappAppSecret: "secret",
      whatsappEmbeddedSignupConfigId: "config-1",
      whatsappTokenEncryptionKey: "a".repeat(64),
      whatsappVerifyToken: "verify-token",
    },
  },
}));

vi.mock("../../src/modules/whatsapp/whatsapp-templates.service.js", () => ({
  listApprovedWhatsAppTemplates: mocks.listApprovedWhatsAppTemplates,
}));

import { updateWhatsAppReceiptTemplate } from "../../src/modules/whatsapp/whatsapp-connections.service.js";

describe("WhatsApp receipt template settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectionFindUnique.mockResolvedValue({ status: "CONNECTED" });
    mocks.listApprovedWhatsAppTemplates.mockResolvedValue([{
      id: "template-1",
      name: "laundry_receipt",
      language: "en",
      category: "UTILITY",
      headerFormat: "IMAGE",
      bodyVariableCount: 4,
    }]);
    mocks.connectionUpdate.mockResolvedValue({
      receiptTemplateName: "laundry_receipt",
      receiptTemplateLanguage: "en",
    });
  });

  it("saves only an approved UTILITY image-header template with four receipt variables", async () => {
    await expect(updateWhatsAppReceiptTemplate("business-1", "laundry_receipt", "en")).resolves.toEqual({
      receiptTemplateName: "laundry_receipt",
      receiptTemplateLanguage: "en",
    });
    expect(mocks.connectionUpdate).toHaveBeenCalledWith({
      where: { businessId: "business-1" },
      data: { receiptTemplateName: "laundry_receipt", receiptTemplateLanguage: "en" },
      select: { receiptTemplateName: true, receiptTemplateLanguage: true },
    });
  });

  it("rejects templates that are not approved utility image templates with four variables", async () => {
    mocks.listApprovedWhatsAppTemplates.mockResolvedValue([{
      id: "template-2",
      name: "plain_text",
      language: "en",
      category: "UTILITY",
      headerFormat: null,
      bodyVariableCount: 4,
    }]);
    await expect(updateWhatsAppReceiptTemplate("business-1", "plain_text", "en"))
      .rejects.toThrow("IMAGE header and exactly four BODY variables");
    expect(mocks.connectionUpdate).not.toHaveBeenCalled();
  });

  it("requires a connected business WhatsApp account before saving a template", async () => {
    mocks.connectionFindUnique.mockResolvedValue(null);
    await expect(updateWhatsAppReceiptTemplate("business-1", "laundry_receipt", "en"))
      .rejects.toThrow("Connect this business's WhatsApp number");
    expect(mocks.listApprovedWhatsAppTemplates).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectionFindUnique: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    whatsAppBusinessConnection: { findUnique: mocks.connectionFindUnique },
  },
}));
vi.mock("../../src/config/index.js", () => ({
  config: { receiptDelivery: { whatsappApiVersion: "v23.0" } },
}));
vi.mock("../../src/modules/whatsapp/whatsapp-token-crypto.js", () => ({
  decryptWhatsAppAccessToken: vi.fn(() => "decrypted-test-token"),
}));
vi.mock("../../src/modules/invoices/providers/whatsapp.provider.js", () => ({
  normalizeWhatsAppRecipient: (value: string) => value.replace(/\\D/g, ""),
}));

import { listApprovedWhatsAppTemplates } from "../../src/modules/whatsapp/whatsapp-templates.service.js";

function page(data: unknown[], next?: string) {
  return new Response(JSON.stringify({ data, ...(next ? { paging: { next } } : {}) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("approved WhatsApp template pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.connectionFindUnique.mockResolvedValue({
      wabaId: "123456789",
      phoneNumberId: "987654321",
      encryptedAccessToken: "encrypted-token",
      status: "CONNECTED",
    });
  });

  it("loads templates from every Meta page and removes duplicate IDs", async () => {
    mocks.fetch
      .mockResolvedValueOnce(page([
        { id: "template-1", name: "order_ready", language: "en", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Hello {{1}}" }] },
      ], "https://graph.facebook.com/v23.0/123456789/message_templates?after=cursor-2"))
      .mockResolvedValueOnce(page([
        { id: "template-1", name: "order_ready", language: "en", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Hello {{1}}" }] },
        { id: "template-2", name: "plain_notice", language: "en", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Your order is ready" }] },
        { id: "template-3", name: "pending_notice", language: "en", status: "PENDING", category: "UTILITY", components: [] },
      ]));

    const result = await listApprovedWhatsAppTemplates("business-1");

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      { id: "template-1", name: "order_ready", language: "en", category: "UTILITY", bodyVariableCount: 1 },
      { id: "template-2", name: "plain_notice", language: "en", category: "UTILITY", bodyVariableCount: 0 },
    ]);
  });

  it("rejects pagination URLs outside the Meta Graph API host", async () => {
    mocks.fetch.mockResolvedValueOnce(page([], "https://attacker.example/collect"));
    await expect(listApprovedWhatsAppTemplates("business-1"))
      .rejects.toThrow("unexpected template pagination URL");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("fails instead of silently returning a partial catalogue after ten pages", async () => {
    for (let index = 0; index < 10; index += 1) {
      mocks.fetch.mockResolvedValueOnce(page([], `https://graph.facebook.com/v23.0/123456789/message_templates?after=cursor-${index + 1}`));
    }
    await expect(listApprovedWhatsAppTemplates("business-1"))
      .rejects.toThrow("more than 1,000 templates");
    expect(mocks.fetch).toHaveBeenCalledTimes(10);
  });
});

import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateMany } = vi.hoisted(() => ({ updateMany: vi.fn() }));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { communicationDelivery: { updateMany } },
}));

import { processWhatsAppWebhook } from "../../src/modules/whatsapp/whatsapp-webhook.service.js";

const appSecret = "test_whatsapp_app_secret_for_webhook_tests";

function makeSignature(body: Buffer) {
  return `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;
}

describe("processWhatsAppWebhook", () => {
  beforeEach(() => updateMany.mockReset().mockResolvedValue({ count: 1 }));

  it("records delivered, read, and failed statuses against provider message IDs", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            statuses: [
              { id: "wamid-delivered", status: "delivered" },
              { id: "wamid-read", status: "read" },
              { id: "wamid-failed", status: "failed", errors: [{ code: 131026, title: "Message undeliverable", message: "Recipient unavailable" }] },
            ],
          },
        }],
      }],
    };
    const body = Buffer.from(JSON.stringify(payload));
    const result = await processWhatsAppWebhook(body, makeSignature(body));

    expect(result).toEqual({ processedStatuses: 3 });
    expect(updateMany).toHaveBeenCalledTimes(3);
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { channel: "WHATSAPP", providerMessageId: "wamid-delivered", status: { in: ["PENDING", "SENT", "DELIVERED"] } },
      data: { status: "DELIVERED", errorMessage: null },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { channel: "WHATSAPP", providerMessageId: "wamid-read", status: { in: ["PENDING", "SENT", "DELIVERED", "READ"] } },
      data: { status: "READ", errorMessage: null },
    });
    expect(updateMany).toHaveBeenNthCalledWith(3, {
      where: { channel: "WHATSAPP", providerMessageId: "wamid-failed", status: { in: ["PENDING", "SENT", "DELIVERED"] } },
      data: { status: "FAILED", errorMessage: "code 131026: Message undeliverable: Recipient unavailable" },
    });
  });

  it("rejects invalid signatures before processing callback data", async () => {
    const body = Buffer.from(JSON.stringify({ object: "whatsapp_business_account", entry: [] }));
    await expect(processWhatsAppWebhook(body, "sha256=bad")).rejects.toThrow("Invalid WhatsApp webhook signature");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("ignores unknown provider statuses", async () => {
    const body = Buffer.from(JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { statuses: [{ id: "wamid-unknown", status: "queued" }] } }] }],
    }));
    const result = await processWhatsAppWebhook(body, makeSignature(body));
    expect(result).toEqual({ processedStatuses: 0 });
    expect(updateMany).not.toHaveBeenCalled();
  });
});

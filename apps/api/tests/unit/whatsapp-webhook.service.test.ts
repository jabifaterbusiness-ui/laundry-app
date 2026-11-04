import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  upsert: vi.fn(),
  updateEvent: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    communicationDelivery: { updateMany: mocks.updateMany },
    whatsAppBusinessConnection: { findUnique: mocks.findUnique },
    whatsAppWebhookEvent: {
      upsert: mocks.upsert,
      update: mocks.updateEvent,
      findMany: mocks.findMany,
    },
  },
}));

import {
  processWhatsAppWebhook,
  replayPendingWhatsAppStatusEvents,
} from "../../src/modules/whatsapp/whatsapp-webhook.service.js";

const appSecret = "test_whatsapp_app_secret_for_webhook_tests";
function makeSignature(body: Buffer) {
  return `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;
}

describe("processWhatsAppWebhook", () => {
  beforeEach(() => {
    mocks.updateMany.mockReset().mockResolvedValue({ count: 1 });
    mocks.upsert.mockReset().mockResolvedValue({ id: "event-1", processedAt: null });
    mocks.updateEvent.mockReset().mockResolvedValue({});
    mocks.findUnique.mockReset().mockResolvedValue(null);
    mocks.findMany.mockReset().mockResolvedValue([]);
  });

  it("records delivered, read, and failed statuses against provider message IDs", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        id: "waba-12345",
        changes: [{
          value: {
            metadata: { phone_number_id: "phone-12345" },
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

    expect(result).toEqual({ processedStatuses: 3, receivedMessages: 0 });
    expect(mocks.upsert).toHaveBeenCalledTimes(3);
    expect(mocks.updateMany).toHaveBeenCalledTimes(3);
    expect(mocks.updateMany).toHaveBeenNthCalledWith(1, {
      where: { channel: "WHATSAPP", providerMessageId: "wamid-delivered", status: { in: ["PENDING", "SENT", "DELIVERED"] } },
      data: { status: "DELIVERED", errorMessage: null },
    });
    expect(mocks.updateMany).toHaveBeenNthCalledWith(2, {
      where: { channel: "WHATSAPP", providerMessageId: "wamid-read", status: { in: ["PENDING", "SENT", "DELIVERED", "READ"] } },
      data: { status: "READ", errorMessage: null },
    });
    expect(mocks.updateMany).toHaveBeenNthCalledWith(3, {
      where: { channel: "WHATSAPP", providerMessageId: "wamid-failed", status: { in: ["PENDING", "SENT"] } },
      data: { status: "FAILED", errorMessage: "code 131026: Message undeliverable: Recipient unavailable" },
    });
    expect(mocks.updateEvent).toHaveBeenCalledTimes(3);
  });

  it("does not let a late failure callback downgrade a delivered message", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id: "wamid-already-delivered",
              status: "failed",
              errors: [{ code: 131026, title: "Message undeliverable" }],
            }],
          },
        }],
      }],
    };
    const body = Buffer.from(JSON.stringify(payload));
    await processWhatsAppWebhook(body, makeSignature(body));
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { channel: "WHATSAPP", providerMessageId: "wamid-already-delivered", status: { in: ["PENDING", "SENT"] } },
      data: { status: "FAILED", errorMessage: "code 131026: Message undeliverable" },
    });
  });

  it("retains a status callback when the send record has not been linked yet", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const payload = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { statuses: [{ id: "wamid-race", status: "delivered" }] } }] }],
    };
    const body = Buffer.from(JSON.stringify(payload));
    const result = await processWhatsAppWebhook(body, makeSignature(body));
    expect(result.processedStatuses).toBe(0);
    expect(mocks.upsert).toHaveBeenCalled();
    expect(mocks.updateEvent).not.toHaveBeenCalled();
  });

  it("replays retained status callbacks after a send record is linked", async () => {
    mocks.findMany.mockResolvedValue([{
      id: "event-pending", wabaId: "waba-12345", phoneNumberId: "phone-12345",
      payload: { id: "wamid-race", status: "delivered" },
    }]);
    await replayPendingWhatsAppStatusEvents("wamid-race");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { channel: "WHATSAPP", providerMessageId: "wamid-race", status: { in: ["PENDING", "SENT", "DELIVERED"] } },
      data: { status: "DELIVERED", errorMessage: null },
    });
    expect(mocks.updateEvent).toHaveBeenCalledWith({
      where: { id: "event-1" }, data: { processedAt: expect.any(Date), processingError: null },
    });
  });

  it("stores inbound messages durably for inbox processing", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{ id: "waba-12345", changes: [{ value: {
        metadata: { phone_number_id: "phone-12345" },
        messages: [{ id: "wamid-inbound", from: "2348000000000", type: "text", text: { body: "Hello" } }],
      } }] }],
    };
    const body = Buffer.from(JSON.stringify(payload));
    const result = await processWhatsAppWebhook(body, makeSignature(body));
    expect(result).toEqual({ processedStatuses: 0, receivedMessages: 1 });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ eventType: "MESSAGE_RECEIVED", providerMessageId: "wamid-inbound" }),
    }));
  });

  it("rejects invalid signatures before processing callback data", async () => {
    const body = Buffer.from(JSON.stringify({ object: "whatsapp_business_account", entry: [] }));
    await expect(processWhatsAppWebhook(body, "sha256=bad")).rejects.toThrow("Invalid WhatsApp webhook signature");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("ignores unknown provider statuses", async () => {
    const body = Buffer.from(JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { statuses: [{ id: "wamid-unknown", status: "queued" }] } }] }],
    }));
    const result = await processWhatsAppWebhook(body, makeSignature(body));
    expect(result).toEqual({ processedStatuses: 0, receivedMessages: 0 });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});

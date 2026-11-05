import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventFindMany: vi.fn(),
  connectionFindUnique: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    whatsAppWebhookEvent: { findMany: mocks.eventFindMany },
    whatsAppBusinessConnection: { findUnique: mocks.connectionFindUnique },
  },
}));
vi.mock("../../src/config/index.js", () => ({
  config: { receiptDelivery: { whatsappApiVersion: "v23.0" } },
}));
vi.mock("../../src/modules/whatsapp/whatsapp-token-crypto.js", () => ({
  decryptWhatsAppAccessToken: vi.fn(() => "decrypted-test-token"),
}));

import { getWhatsAppMediaPreview } from "../../src/modules/whatsapp/whatsapp-media.service.js";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("tenant-scoped WhatsApp media previews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.eventFindMany.mockResolvedValue([{
      payload: { type: "image", image: { id: "media-12345", mime_type: "image/jpeg" } },
    }]);
    mocks.connectionFindUnique.mockResolvedValue({
      status: "CONNECTED",
      encryptedAccessToken: "encrypted-token",
    });
  });

  it("downloads a supported image only after confirming tenant ownership", async () => {
    mocks.fetch
      .mockResolvedValueOnce(jsonResponse({
        url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=media-12345",
        mime_type: "image/jpeg",
        file_size: "11",
      }))
      .mockResolvedValueOnce(new Response(Buffer.from("image-bytes"), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }));

    const result = await getWhatsAppMediaPreview("business-1", "media-12345");

    expect(result.contentType).toBe("image/jpeg");
    expect(result.bytes.toString()).toBe("image-bytes");
    expect(mocks.eventFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId: "business-1", eventType: "MESSAGE_RECEIVED" },
    }));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, expect.any(URL), {
      headers: { Authorization: "Bearer decrypted-test-token" },
    });
  });

  it("does not fetch a media ID that is not present in this tenant's inbound messages", async () => {
    mocks.eventFindMany.mockResolvedValue([]);
    await expect(getWhatsAppMediaPreview("business-1", "media-12345"))
      .rejects.toThrow("not found for this business");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects metadata URLs outside Meta's media CDN", async () => {
    mocks.fetch.mockResolvedValueOnce(jsonResponse({
      url: "https://attacker.example/collect",
      mime_type: "image/jpeg",
      file_size: "11",
    }));
    await expect(getWhatsAppMediaPreview("business-1", "media-12345"))
      .rejects.toThrow("unexpected media download URL");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized attachments before downloading the file", async () => {
    mocks.fetch.mockResolvedValueOnce(jsonResponse({
      url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=media-12345",
      mime_type: "image/jpeg",
      file_size: String(11 * 1024 * 1024),
    }));
    await expect(getWhatsAppMediaPreview("business-1", "media-12345"))
      .rejects.toThrow("10 MB maximum");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported content types", async () => {
    mocks.fetch
      .mockResolvedValueOnce(jsonResponse({
        url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=media-12345",
        mime_type: "text/html",
        file_size: "11",
      }))
      .mockResolvedValueOnce(new Response("not an image", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(getWhatsAppMediaPreview("business-1", "media-12345"))
      .rejects.toThrow("cannot be previewed safely");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  inboundFindFirst: vi.fn(),
  customerFindFirst: vi.fn(),
  connectionFindUnique: vi.fn(),
}));

vi.stubGlobal("fetch", mocks.fetchMock);

vi.mock("../../src/config/index.js", () => ({
  config: {
    log: { level: "silent" },
    isProduction: true,
    receiptDelivery: {
      whatsappApiVersion: "v23.0",
      whatsappPhoneNumberId: "phone-number-id-123",
      whatsappAccessToken: "wa_test_token",
    },
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    whatsAppWebhookEvent: { findFirst: mocks.inboundFindFirst },
    customer: { findFirst: mocks.customerFindFirst },
    whatsAppBusinessConnection: { findUnique: mocks.connectionFindUnique },
  },
}));
vi.mock("../../src/modules/whatsapp/whatsapp-token-crypto.js", () => ({
  decryptWhatsAppAccessToken: () => "decrypted-test-token",
}));

import { sendWhatsAppReceipt, sendWhatsAppText } from "../../src/modules/invoices/providers/whatsapp.provider.js";

const IMAGE = Buffer.from("fake-png");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.customerFindFirst.mockResolvedValue({ phone: "2348012345678", whatsappOptIn: true });
  mocks.connectionFindUnique.mockResolvedValue({ phoneNumberId: "phone-number-id-123", status: "CONNECTED" });

  mocks.fetchMock
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: "media-id-123",
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        messages: [{ id: "wamid.test-123" }],
      }),
    });
});

describe("whatsapp.provider", () => {
  it("uploads the receipt image and sends it through Meta WhatsApp Cloud API", async () => {
    await expect(
      sendWhatsAppReceipt({
        to: "2348012345678",
        image: IMAGE,
      }),
    ).resolves.toEqual({
      id: "wamid.test-123",
    });

    expect(mocks.fetchMock).toHaveBeenCalledTimes(2);

    const [mediaUrl, mediaOptions] = mocks.fetchMock.mock.calls[0] ?? [];

    expect(mediaUrl).toBe(
      "https://graph.facebook.com/v23.0/phone-number-id-123/media",
    );

    expect(mediaOptions.method).toBe("POST");
    expect(mediaOptions.headers).toEqual({
      Authorization: "Bearer wa_test_token",
    });
    expect(mediaOptions.body).toBeInstanceOf(FormData);

    const mediaForm = mediaOptions.body as FormData;

    expect(mediaForm.get("messaging_product")).toBe("whatsapp");
    expect(mediaForm.get("type")).toBe("image/png");

    const uploadedFile = mediaForm.get("file");

    expect(uploadedFile).toBeInstanceOf(Blob);
    expect((uploadedFile as Blob).type).toBe("image/png");

    const [messageUrl, messageOptions] = mocks.fetchMock.mock.calls[1] ?? [];

    expect(messageUrl).toBe(
      "https://graph.facebook.com/v23.0/phone-number-id-123/messages",
    );

    expect(messageOptions).toEqual({
      method: "POST",
      headers: {
        Authorization: "Bearer wa_test_token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: "2348012345678",
        type: "image",
        image: {
          id: "media-id-123",
        },
      }),
    });
  });

  it("blocks tenant free-form text outside the 24-hour customer-service window", async () => {
    mocks.inboundFindFirst.mockResolvedValue({
      payload: { timestamp: String(Math.floor(Date.now() / 1000) - 25 * 60 * 60) },
      receivedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
    await expect(sendWhatsAppText({
      businessId: "business-1", to: "2348012345678", body: "Your order is ready",
    })).rejects.toThrow("24-hour WhatsApp customer-service window is closed");
    expect(mocks.connectionFindUnique).toHaveBeenCalledWith({
      where: { businessId: "business-1" },
      select: { phoneNumberId: true, status: true },
    });
    expect(mocks.inboundFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        businessId: "business-1",
        phoneNumberId: "phone-number-id-123",
        contactPhone: "2348012345678",
        eventType: "MESSAGE_RECEIVED",
      },
    }));
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it("blocks business-initiated WhatsApp receipts when the customer has not opted in", async () => {
    mocks.customerFindFirst.mockResolvedValue({ whatsappOptIn: false });
    await expect(sendWhatsAppReceipt({
      businessId: "business-1", customerId: "customer-1", to: "2348012345678", image: IMAGE,
    })).rejects.toThrow("has not explicitly opted in");
    expect(mocks.customerFindFirst).toHaveBeenCalledWith({
      where: { id: "customer-1", businessId: "business-1" },
      select: { phone: true, whatsappOptIn: true },
    });
    expect(mocks.fetchMock).not.toHaveBeenCalled();
    expect(mocks.inboundFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a receipt destination that does not belong to the consented customer", async () => {
    mocks.customerFindFirst.mockResolvedValue({
      phone: "2348099999999",
      whatsappOptIn: true,
    });
    await expect(sendWhatsAppReceipt({
      businessId: "business-1",
      customerId: "customer-1",
      to: "2348012345678",
      image: IMAGE,
    })).rejects.toThrow("does not match the selected customer");
    expect(mocks.fetchMock).not.toHaveBeenCalled();
    expect(mocks.inboundFindFirst).not.toHaveBeenCalled();
  });

  it("blocks tenant receipt images outside the 24-hour customer-service window", async () => {
    mocks.inboundFindFirst.mockResolvedValue(null);
    await expect(sendWhatsAppReceipt({
      businessId: "business-1", customerId: "customer-1", to: "2348012345678", image: IMAGE,
    })).rejects.toThrow("24-hour WhatsApp customer-service window is closed");
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it("rejects Meta media upload failures", async () => {
    mocks.fetchMock.mockReset();

    mocks.fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({
        error: {
          message: "Invalid OAuth access token",
        },
      }),
    });

    await expect(
      sendWhatsAppReceipt({
        to: "2348012345678",
        image: IMAGE,
      }),
    ).rejects.toThrow(
      "WhatsApp media upload failed: Invalid OAuth access token",
    );

    expect(mocks.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a successful media upload without a media ID", async () => {
    mocks.fetchMock.mockReset();

    mocks.fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: undefined,
        media: [],
      }),
    });

    await expect(
      sendWhatsAppReceipt({
        to: "2348012345678",
        image: IMAGE,
      }),
    ).rejects.toThrow(
      "WhatsApp media upload returned no media ID",
    );

    expect(mocks.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects Meta WhatsApp message failures", async () => {
    mocks.fetchMock.mockReset();

    mocks.fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "media-id-123",
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({
          error: {
            message: "Invalid parameter",
          },
        }),
      });

    await expect(
      sendWhatsAppReceipt({
        to: "2348012345678",
        image: IMAGE,
      }),
    ).rejects.toThrow(
      "WhatsApp delivery failed: Invalid parameter",
    );

    expect(mocks.fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a successful WhatsApp response without a message ID", async () => {
    mocks.fetchMock.mockReset();

    mocks.fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "media-id-123",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          messages: [],
        }),
      });

    await expect(
      sendWhatsAppReceipt({
        to: "2348012345678",
        image: IMAGE,
      }),
    ).rejects.toThrow(
      "WhatsApp delivery returned no message ID",
    );

    expect(mocks.fetchMock).toHaveBeenCalledTimes(2);
  });
});

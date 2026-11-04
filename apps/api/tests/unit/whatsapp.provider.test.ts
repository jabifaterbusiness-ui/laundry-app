import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

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

import { sendWhatsAppReceipt } from "../../src/modules/invoices/providers/whatsapp.provider.js";

const IMAGE = Buffer.from("fake-png");

beforeEach(() => {
  vi.clearAllMocks();

  fetchMock
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

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [mediaUrl, mediaOptions] = fetchMock.mock.calls[0] ?? [];

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

    const [messageUrl, messageOptions] = fetchMock.mock.calls[1] ?? [];

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

  it("rejects Meta media upload failures", async () => {
    fetchMock.mockReset();

    fetchMock.mockResolvedValueOnce({
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

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a successful media upload without a media ID", async () => {
    fetchMock.mockReset();

    fetchMock.mockResolvedValueOnce({
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

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects Meta WhatsApp message failures", async () => {
    fetchMock.mockReset();

    fetchMock
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

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a successful WhatsApp response without a message ID", async () => {
    fetchMock.mockReset();

    fetchMock
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

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

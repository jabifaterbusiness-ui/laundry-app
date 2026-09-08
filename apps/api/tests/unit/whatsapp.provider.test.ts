import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

vi.mock("../../src/config/index.js", () => ({
  config: {
    receiptDelivery: {
      whatsappApiVersion: "v23.0",
      whatsappPhoneNumberId: "phone-number-id-123",
      whatsappAccessToken: "wa_test_token",
    },
  },
}));

import { sendWhatsAppReceipt } from "../../src/modules/invoices/providers/whatsapp.provider.js";

beforeEach(() => {
  vi.clearAllMocks();

  fetchMock.mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({
      messages: [{ id: "wamid.test-123" }],
    }),
  });
});

describe("whatsapp.provider", () => {
  it("sends a receipt message through Meta WhatsApp Cloud API", async () => {
    await expect(
      sendWhatsAppReceipt({
        to: "2348012345678",
        message: "Your laundry receipt is ready.",
      }),
    ).resolves.toEqual({
      id: "wamid.test-123",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v23.0/phone-number-id-123/messages",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer wa_test_token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: "2348012345678",
          type: "text",
          text: {
            body: "Your laundry receipt is ready.",
          },
        }),
      },
    );
  });

  it("rejects Meta API failures", async () => {
    fetchMock.mockResolvedValue({
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
        message: "Your laundry receipt is ready.",
      }),
    ).rejects.toThrow(
      "WhatsApp delivery failed: Invalid OAuth access token",
    );
  });

  it("rejects a successful response without a message ID", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        messages: [],
      }),
    });

    await expect(
      sendWhatsAppReceipt({
        to: "2348012345678",
        message: "Your laundry receipt is ready.",
      }),
    ).rejects.toThrow(
      "WhatsApp delivery returned no message ID",
    );
  });
});

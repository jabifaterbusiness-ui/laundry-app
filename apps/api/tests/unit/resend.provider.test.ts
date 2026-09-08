import { beforeEach, describe, expect, it, vi } from "vitest";

const { resendSendMock, resendConstructorMock } = vi.hoisted(() => ({
  resendSendMock: vi.fn(),
  resendConstructorMock: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: resendConstructorMock,
}));

vi.mock("../../src/config/index.js", () => ({
  config: {
    receiptDelivery: {
      resendApiKey: "re_test_key",
      emailFrom: "receipts@testlaundry.com",
    },
  },
}));

import { sendReceiptEmail } from "../../src/modules/invoices/providers/resend.provider.js";

beforeEach(() => {
  vi.clearAllMocks();

  resendSendMock.mockResolvedValue({
    data: { id: "resend-message-123" },
    error: null,
  });

  resendConstructorMock.mockImplementation(() => ({
    emails: {
      send: resendSendMock,
    },
  }));
});

describe("resend.provider", () => {
  it("sends a receipt email through Resend", async () => {
    await expect(
      sendReceiptEmail({
        to: "customer@example.com",
        subject: "Your laundry receipt",
        html: "<p>Receipt</p>",
      }),
    ).resolves.toEqual({
      id: "resend-message-123",
    });

    expect(resendConstructorMock).toHaveBeenCalledWith("re_test_key");
    expect(resendSendMock).toHaveBeenCalledWith({
      from: "receipts@testlaundry.com",
      to: "customer@example.com",
      subject: "Your laundry receipt",
      html: "<p>Receipt</p>",
    });
  });

  it("rejects when Resend returns an error", async () => {
    resendSendMock.mockResolvedValue({
      data: null,
      error: { message: "Invalid API key" },
    });

    await expect(
      sendReceiptEmail({
        to: "customer@example.com",
        subject: "Your laundry receipt",
        html: "<p>Receipt</p>",
      }),
    ).rejects.toThrow("Resend email delivery failed: Invalid API key");
  });

  it("rejects when Resend returns no message ID", async () => {
    resendSendMock.mockResolvedValue({
      data: {},
      error: null,
    });

    await expect(
      sendReceiptEmail({
        to: "customer@example.com",
        subject: "Your laundry receipt",
        html: "<p>Receipt</p>",
      }),
    ).rejects.toThrow("Resend email delivery returned no message ID");
  });
});

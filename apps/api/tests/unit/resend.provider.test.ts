import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock, constructorMock, warnMock, emailConfig } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  constructorMock: vi.fn(),
  warnMock: vi.fn(),
  emailConfig: {
    apiKey: "re_test_key" as string | undefined,
    from: "LaundryAngel <receipts@testlaundry.com>" as string | undefined,
    requestTimeoutMs: 15000,
    maxAttempts: 3,
    retryDelayMs: 0,
  },
}));

vi.mock("resend", () => ({ Resend: constructorMock }));
vi.mock("../../src/config/index.js", () => ({ config: { email: emailConfig } }));
vi.mock("../../src/lib/logger.js", () => ({ logger: { warn: warnMock } }));

import { EmailDeliveryError, sendEmail } from "../../src/modules/email/email.service.js";

beforeEach(() => {
  vi.clearAllMocks();
  emailConfig.apiKey = "re_test_key";
  emailConfig.from = "LaundryAngel <receipts@testlaundry.com>";
  sendMock.mockResolvedValue({ data: { id: "resend-message-123" }, error: null });
  constructorMock.mockImplementation(() => ({ emails: { send: sendMock } }));
});

const input = {
  to: "customer@example.com",
  subject: "Your laundry receipt",
  html: "<p>Receipt</p>",
  feature: "receipt" as const,
  idempotencyKey: "receipt-event-123",
};

describe("central email delivery", () => {
  it("returns provider-submitted status only with a message ID and passes timeout/idempotency options", async () => {
    await expect(sendEmail(input)).resolves.toEqual({ status: "SUBMITTED", id: "resend-message-123" });
    expect(constructorMock).toHaveBeenCalledWith("re_test_key");
    expect(sendMock).toHaveBeenCalledWith(
      { from: "LaundryAngel <receipts@testlaundry.com>", to: input.to, subject: input.subject, html: input.html },
      expect.objectContaining({ idempotencyKey: input.idempotencyKey, signal: expect.any(AbortSignal) }),
    );
  });

  it("uses the business name on the verified platform sender and business email only as Reply-To", async () => {
    await sendEmail({ ...input, fromName: "10 Star Laundry", replyTo: "contact@10star.example" });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "10 Star Laundry <receipts@testlaundry.com>",
        replyTo: "contact@10star.example",
      }),
      expect.anything(),
    );
  });

  it("sanitizes line breaks in business display names", async () => {
    await sendEmail({ ...input, fromName: "Business\r\nBcc: attacker@example.com" });
    expect(sendMock.mock.calls[0]?.[0].from).toBe("Business Bcc: attacker@example.com <receipts@testlaundry.com>");
  });

  it.each([
    [undefined, "LaundryAngel <receipts@testlaundry.com>"],
    ["re_test_key", undefined],
    ["re_test_key", "not-an-email"],
  ])("rejects missing or invalid provider configuration", async (apiKey, from) => {
    emailConfig.apiKey = apiKey;
    emailConfig.from = from;
    await expect(sendEmail(input)).rejects.toMatchObject({ statusCode: 503, retryable: false });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects malformed recipient addresses without calling the provider", async () => {
    await expect(sendEmail({ ...input, to: "not-an-email\r\nBcc: victim@example.com" }))
      .rejects.toMatchObject({ retryable: false, message: "Email recipient address is invalid." });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("classifies rate limits as retryable without exposing provider diagnostics", async () => {
    sendMock.mockResolvedValue({ data: null, error: { statusCode: 429, message: "private provider response" } });
    await expect(sendEmail(input)).rejects.toMatchObject({
      name: "EmailDeliveryError", retryable: true,
      message: "Email provider is temporarily unavailable.",
    });
    expect(warnMock).toHaveBeenNthCalledWith(
      1,
      { feature: "receipt", attempt: 1, retryable: true, providerStatusCode: 429 },
      "Email submission failed.",
    );
    expect(warnMock).toHaveBeenCalledTimes(emailConfig.maxAttempts);
    expect(JSON.stringify(warnMock.mock.calls)).not.toContain("private provider response");
    expect(JSON.stringify(warnMock.mock.calls)).not.toContain(input.to);
    expect(JSON.stringify(warnMock.mock.calls)).not.toContain(input.html);
  });

  it("classifies permanent provider rejections and never reports a missing ID as submitted", async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { statusCode: 401, message: "Invalid API key" } });
    await expect(sendEmail(input)).rejects.toMatchObject({ retryable: false });
    sendMock.mockResolvedValueOnce({ data: {}, error: null });
    await expect(sendEmail(input)).rejects.toBeInstanceOf(EmailDeliveryError);
  });

  it("retries transient failures with the same idempotency key", async () => {
    sendMock
      .mockResolvedValueOnce({ data: null, error: { statusCode: 503, message: "transient provider detail" } })
      .mockResolvedValueOnce({ data: { id: "resend-message-123" }, error: null });
    await expect(sendEmail(input)).resolves.toEqual({ status: "SUBMITTED", id: "resend-message-123" });
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock.mock.calls[0]?.[1]).toMatchObject({ idempotencyKey: input.idempotencyKey });
    expect(sendMock.mock.calls[1]?.[1]).toMatchObject({ idempotencyKey: input.idempotencyKey });
  });

  it("turns network timeouts into bounded retryable failures without logging raw errors", async () => {
    sendMock.mockRejectedValue(new Error("timeout for reset token raw-secret"));
    await expect(sendEmail(input)).rejects.toMatchObject({
      statusCode: 502, retryable: true,
      message: "Email submission could not be confirmed.",
    });
    expect(sendMock).toHaveBeenCalledTimes(emailConfig.maxAttempts);
    expect(JSON.stringify(warnMock.mock.calls)).not.toContain("raw-secret");
  });
});

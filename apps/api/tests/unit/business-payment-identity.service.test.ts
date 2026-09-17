import { describe, expect, it, vi } from "vitest";
import { createBusinessPaymentIdentity } from "../../src/modules/payments/business-payment-identity.service.js";

describe("business payment identity service", () => {
  it("creates a permanent LA payment identity for a business", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "identity-1",
      businessId: "business-1",
      paymentCode: "LA-7F82K4M9",
    });

    const result = await createBusinessPaymentIdentity(
      { businessPaymentIdentity: { create } } as never,
      "business-1",
    );

    expect(result).toEqual({
      id: "identity-1",
      businessId: "business-1",
      paymentCode: "LA-7F82K4M9",
    });

    expect(create).toHaveBeenCalledTimes(1);
    const call = create.mock.calls[0]?.[0];
    expect(call.data.businessId).toBe("business-1");
    expect(call.data.businessCode).toMatch(/^LA-BIZ-[A-Z0-9]{8}$/);
    expect(call.data.paymentCode).toMatch(/^LA-[A-Z0-9]{8}$/);
  });

  it("retries when the generated payment code collides", async () => {
    const uniqueViolation = Object.assign(new Error("Unique constraint"), {
      code: "P2002",
    });

    const create = vi
      .fn()
      .mockRejectedValueOnce(uniqueViolation)
      .mockResolvedValueOnce({
        id: "identity-1",
        businessId: "business-1",
        paymentCode: "LA-SECOND01",
      });

    const result = await createBusinessPaymentIdentity(
      { businessPaymentIdentity: { create } } as never,
      "business-1",
    );

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.paymentCode).toMatch(/^LA-[A-Z0-9]{8}$/);
  });
});

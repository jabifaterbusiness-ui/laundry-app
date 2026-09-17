import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    business: {
      findMany: vi.fn(),
    },
    businessPaymentIdentity: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import {
  backfillBusinessPaymentIdentities,
  ensureBusinessPaymentIdentity,
} from "../../src/modules/payments/business-payment-identity.service.js";

describe("business payment identity backfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates identities for businesses that do not have one", async () => {
    prismaMock.business.findMany.mockResolvedValue([
      { id: "business-1" },
      { id: "business-2" },
    ]);

    prismaMock.businessPaymentIdentity.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    prismaMock.businessPaymentIdentity.create
      .mockResolvedValueOnce({
        id: "identity-1",
        businessId: "business-1",
        businessCode: "LA-BIZ-AAAA1111",
        paymentCode: "LA-AAAA1111",
      })
      .mockResolvedValueOnce({
        id: "identity-2",
        businessId: "business-2",
        businessCode: "LA-BIZ-BBBB2222",
        paymentCode: "LA-BBBB2222",
      });

    await expect(backfillBusinessPaymentIdentities()).resolves.toEqual({
      scanned: 2,
      created: 2,
    });

    expect(prismaMock.businessPaymentIdentity.create).toHaveBeenCalledTimes(2);
  });

  it("does not create a duplicate identity when one already exists", async () => {
    prismaMock.businessPaymentIdentity.findUnique.mockResolvedValue({
      id: "identity-1",
      businessId: "business-1",
      businessCode: "LA-BIZ-AAAA1111",
      paymentCode: "LA-AAAA1111",
    });

    await expect(
      ensureBusinessPaymentIdentity("business-1"),
    ).resolves.toEqual({
      id: "identity-1",
      businessId: "business-1",
      businessCode: "LA-BIZ-AAAA1111",
      paymentCode: "LA-AAAA1111",
    });

    expect(prismaMock.businessPaymentIdentity.create).not.toHaveBeenCalled();
  });
});

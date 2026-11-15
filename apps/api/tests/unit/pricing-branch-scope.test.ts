import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    branchResourceShare: { findMany: vi.fn().mockResolvedValue([]) },
    priceAdjustment: { findMany: vi.fn().mockResolvedValue([]) },
    taxRule: { findMany: vi.fn().mockResolvedValue([]) },
    customer: { findFirst: vi.fn().mockResolvedValue({ id: "customer-a", ownerBranchId: "branch-a" }) },
    customerServicePrice: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { prisma } from "../../src/lib/prisma.js";
import { listPricingRules } from "../../src/modules/services/pricing-rules.service.js";
import { listCustomerServicePrices } from "../../src/modules/services/customer-pricing.service.js";

describe("pricing branch isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not expose unassigned legacy discounts or taxes to a branch order", async () => {
    await listPricingRules("business-a", "branch-a", "user-a", undefined, "order");

    expect(prisma.priceAdjustment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "business-a",
        OR: [
          { branchId: { in: ["branch-a"] } },
          { id: { in: [] } },
        ],
      }),
    }));
    expect(prisma.taxRule.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "business-a",
        OR: [
          { branchId: { in: ["branch-a"] } },
          { id: { in: [] } },
        ],
      }),
    }));
  });

  it("does not expose unassigned legacy customer prices or services to a branch", async () => {
    await listCustomerServicePrices("business-a", "branch-a", "user-a", "customer-a");

    expect(prisma.customerServicePrice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "business-a",
        OR: [
          { branchId: { in: ["branch-a"] } },
          { id: { in: [] } },
        ],
        service: {
          is: expect.objectContaining({
            OR: [
              { ownerBranchId: { in: ["branch-a"] } },
              { id: { in: [] } },
            ],
          }),
        },
      }),
    }));
  });
});

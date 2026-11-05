import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    branchResourceShare: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    priceAdjustment: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
    customer: { findFirst: vi.fn() },
    customerGroup: { findFirst: vi.fn() },
    service: { findMany: vi.fn() },
    taxRule: { findMany: vi.fn() },
  },
}));

import { prisma } from "../../src/lib/prisma.js";
import {
  createPriceAdjustment,
  setPriceAdjustmentActive,
} from "../../src/modules/services/pricing-rules.service.js";

const create = vi.mocked(prisma.priceAdjustment.create);
const findCustomer = vi.mocked(prisma.customer.findFirst);
const findGroup = vi.mocked(prisma.customerGroup.findFirst);
const findServices = vi.mocked(prisma.service.findMany);
const updateMany = vi.mocked(prisma.priceAdjustment.updateMany);
const findAdjustment = vi.mocked(prisma.priceAdjustment.findFirst);

beforeEach(() => {
  vi.clearAllMocks();
  findCustomer.mockResolvedValue({ id: "customer-1" } as never);
  findGroup.mockResolvedValue({ id: "group-1" } as never);
  findServices.mockResolvedValue([{ id: "service-1" }] as never);
  create.mockResolvedValue({ id: "discount-1" } as never);
  updateMany.mockResolvedValue({ count: 1 } as never);
  findAdjustment.mockResolvedValue({ id: "discount-1", branchId: "branch-A", isActive: false } as never);
});

describe("automatic price adjustments", () => {
  it("creates a customer-specific discount scoped to the same business", async () => {
    await createPriceAdjustment({
      businessId: "business-1",
      branchId: "branch-A",
      userId: "user-A",
      name: "Personal 10%",
      percentage: -10,
      targetScope: "CUSTOMER",
      customerId: "customer-1",
    });

    expect(findCustomer).toHaveBeenCalledWith({
      where: {
        id: "customer-1",
        businessId: "business-1",
        OR: [
          { ownerBranchId: null },
          { ownerBranchId: { in: ["branch-A"] } },
          { id: { in: [] } },
        ],
      },
      select: { id: true },
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        businessId: "business-1",
        name: "Personal 10%",
        percentage: -10,
        targetScope: "CUSTOMER",
        customerId: "customer-1",
        groupId: null,
        allowStacking: false,
        excludedServiceIds: [],
      }),
    }));
  });

  it("creates a customer-group discount after verifying the group belongs to the business", async () => {
    await createPriceAdjustment({
      businessId: "business-1",
      branchId: "branch-A",
      userId: "user-A",
      name: "VIP 15%",
      percentage: -15,
      targetScope: "GROUP",
      groupId: "group-1",
      allowStacking: true,
      excludedServiceIds: ["service-1"],
    });

    expect(findGroup).toHaveBeenCalledWith({
      where: { id: "group-1", businessId: "business-1" },
      select: { id: true },
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        targetScope: "GROUP",
        groupId: "group-1",
        allowStacking: true,
        excludedServiceIds: ["service-1"],
      }),
    }));
  });

  it("requires a start and end date for all-customer promotions", async () => {
    await expect(createPriceAdjustment({
      businessId: "business-1",
      branchId: "branch-A",
      userId: "user-A",
      name: "Holiday 10%",
      percentage: -10,
      targetScope: "ALL_CUSTOMERS",
    })).rejects.toThrow("require a start and end date");

    expect(create).not.toHaveBeenCalled();
  });

  it("rejects positive automatic adjustments so they cannot become accidental surcharges", async () => {
    await expect(createPriceAdjustment({
      businessId: "business-1",
      branchId: "branch-A",
      userId: "user-A",
      name: "Invalid promotion",
      percentage: 5,
      targetScope: "ALL_CUSTOMERS",
      startsAt: "2026-12-01T00:00:00.000Z",
      endsAt: "2026-12-31T23:59:00.000Z",
    })).rejects.toThrow("negative percentage");

    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an end date that is not after the start date", async () => {
    await expect(createPriceAdjustment({
      businessId: "business-1",
      branchId: "branch-A",
      userId: "user-A",
      name: "Invalid period",
      percentage: -5,
      targetScope: "ALL_CUSTOMERS",
      startsAt: "2026-12-31T23:59:00.000Z",
      endsAt: "2026-12-01T00:00:00.000Z",
    })).rejects.toThrow("end date must be after");

    expect(create).not.toHaveBeenCalled();
  });

  it("supports pausing and resuming an existing discount within the business", async () => {
    await setPriceAdjustmentActive("discount-1", "business-1", "branch-A", "user-A", false);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "discount-1", businessId: "business-1", branchId: "branch-A" },
      data: { isActive: false },
    });
    expect(findAdjustment).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "discount-1",
        businessId: "business-1",
        OR: [
          { ownerBranchId: null },
          { ownerBranchId: { in: ["branch-A"] } },
          { id: { in: [] } },
        ],
      },
    }));
  });
});

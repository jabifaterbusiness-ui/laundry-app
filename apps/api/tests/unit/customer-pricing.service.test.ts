import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  branchResourceShare: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  customer: { findFirst: vi.fn() },
  service: { findFirst: vi.fn() },
  customerServicePrice: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({ prisma: prismaMock }));

import {
  listCustomerServicePrices,
  setCustomerServicePrice,
  removeCustomerServicePrice,
} from "../../src/modules/services/customer-pricing.service.js";
import { AppError } from "../../src/middleware/error-handler.js";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.branchResourceShare.findMany.mockResolvedValue([]);
  prismaMock.branchResourceShare.findFirst.mockResolvedValue(null);
});

describe("customer-specific service pricing branch scope", () => {
  it("lists prices only when the customer is visible to the active branch", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({
      id: "customer-1",
      ownerBranchId: "branch-A",
    });
    prismaMock.customerServicePrice.findMany.mockResolvedValue([]);

    await listCustomerServicePrices("biz-A", "branch-A", "user-A", "customer-1");

    expect(prismaMock.customer.findFirst).toHaveBeenCalledWith({
      where: {
        id: "customer-1",
        businessId: "biz-A",
        OR: [
          { ownerBranchId: null },
          { ownerBranchId: { in: ["branch-A"] } },
          { id: { in: [] } },
        ],
      },
      select: { id: true, ownerBranchId: true },
    });
    expect(prismaMock.customerServicePrice.findMany).toHaveBeenCalled();
  });

  it("does not reveal customer pricing when the customer is not visible to the branch", async () => {
    prismaMock.customer.findFirst.mockResolvedValue(null);

    await expect(
      listCustomerServicePrices("biz-A", "branch-A", "user-A", "customer-foreign"),
    ).rejects.toBeInstanceOf(AppError);

    expect(prismaMock.customerServicePrice.findMany).not.toHaveBeenCalled();
  });

  it("creates a branch-specific price only when customer and service are editable in that branch", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({
      id: "customer-1",
      ownerBranchId: "branch-A",
    });
    prismaMock.service.findFirst.mockResolvedValue({
      id: "service-1",
      ownerBranchId: "branch-A",
    });
    prismaMock.customerServicePrice.upsert.mockResolvedValue({
      id: "price-1",
      branchId: "branch-A",
    });

    await setCustomerServicePrice({
      businessId: "biz-A",
      branchId: "branch-A",
      userId: "user-A",
      customerId: "customer-1",
      serviceId: "service-1",
      unitPrice: 1200,
    });

    expect(prismaMock.customerServicePrice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          customerId_serviceId_branchId: {
            customerId: "customer-1",
            serviceId: "service-1",
            branchId: "branch-A",
          },
        },
        create: expect.objectContaining({
          businessId: "biz-A",
          branchId: "branch-A",
          customerId: "customer-1",
          serviceId: "service-1",
          unitPrice: 1200,
        }),
      }),
    );
  });

  it("rejects writing a customer-specific price through a read-only customer share", async () => {
    prismaMock.branchResourceShare.findMany.mockImplementation(async ({ where }: any) =>
      where.resourceType === "CUSTOMERS"
        ? [{ ownerBranchId: "branch-B", resourceId: null, accessLevel: "READ" }]
        : [],
    );
    prismaMock.customer.findFirst.mockResolvedValue({
      id: "customer-1",
      ownerBranchId: "branch-B",
    });
    prismaMock.service.findFirst.mockResolvedValue({
      id: "service-1",
      ownerBranchId: "branch-A",
    });
    prismaMock.branchResourceShare.findFirst.mockResolvedValue(null);

    await expect(
      setCustomerServicePrice({
        businessId: "biz-A",
        branchId: "branch-A",
        userId: "user-A",
        customerId: "customer-1",
        serviceId: "service-1",
        unitPrice: 1200,
      }),
    ).rejects.toBeInstanceOf(AppError);

    expect(prismaMock.customerServicePrice.upsert).not.toHaveBeenCalled();
  });
});

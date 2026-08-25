import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    garment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "../../src/lib/prisma.js";
import {
  getGarmentForBusiness,
  listGarments,
  updateGarmentStatus,
} from "../../src/modules/garments/garments.service.js";
import { AppError } from "../../src/middleware/error-handler.js";

const findMany = vi.mocked(prisma.garment.findMany);
const findFirst = vi.mocked(prisma.garment.findFirst);
const count = vi.mocked(prisma.garment.count);
const update = vi.mocked(prisma.garment.update);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listGarments", () => {
  it("always scopes garments by business and branch", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await listGarments({
      businessId: "biz-1",
      branchId: "branch-1",
      page: 1,
      pageSize: 25,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-1",
          branchId: "branch-1",
        }),
      }),
    );
  });

  it("applies pagination", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await listGarments({
      businessId: "biz-1",
      branchId: "branch-1",
      page: 3,
      pageSize: 10,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
      }),
    );
  });
});

describe("getGarmentForBusiness", () => {
  it("uses id, businessId and branchId together", async () => {
    findFirst.mockResolvedValue(null);

    await getGarmentForBusiness(
      "garment-1",
      "biz-1",
      "branch-1",
    );

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "garment-1",
          businessId: "biz-1",
          branchId: "branch-1",
        },
      }),
    );
  });
});

describe("updateGarmentStatus", () => {
  it("rejects a garment outside the current business/branch", async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      updateGarmentStatus(
        "garment-1",
        "biz-B",
        "branch-B",
        "READY",
      ),
    ).rejects.toThrow(AppError);
  });

  it("sets readyAt when a garment becomes READY", async () => {
    findFirst.mockResolvedValue({
      id: "garment-1",
      businessId: "biz-1",
      branchId: "branch-1",
    } as never);

    update.mockResolvedValue({
      id: "garment-1",
      status: "READY",
    } as never);

    await updateGarmentStatus(
      "garment-1",
      "biz-1",
      "branch-1",
      "READY",
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "garment-1" },
        data: expect.objectContaining({
          status: "READY",
          readyAt: expect.any(Date),
        }),
      }),
    );
  });
});

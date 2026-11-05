import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    branchResourceShare: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    service: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from "../../src/lib/prisma.js";
import {
  createService,
  getServiceForBusiness,
  listServices,
  setServiceActiveStatus,
  updateService,
} from "../../src/modules/services/services.service.js";
import { AppError } from "../../src/middleware/error-handler.js";

const findMany = vi.mocked(prisma.service.findMany);
const findFirst = vi.mocked(prisma.service.findFirst);
const create = vi.mocked(prisma.service.create);
const updateMany = vi.mocked(prisma.service.updateMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listServices", () => {
  it("scopes active services by businessId", async () => {
    findMany.mockResolvedValue([]);

    await listServices({
      businessId: "biz-1",
      branchId: "branch-A",
      userId: "user-A",
      status: "active",
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-1",
        OR: [{ ownerBranchId: null }, { ownerBranchId: { in: ["branch-A"] } }, { id: { in: [] } }],
        isActive: true,
      },
      orderBy: { name: "asc" },
    });
  });

  it("lists inactive services", async () => {
    findMany.mockResolvedValue([]);

    await listServices({
      businessId: "biz-1",
      branchId: "branch-A",
      userId: "user-A",
      status: "inactive",
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-1",
        OR: [{ ownerBranchId: null }, { ownerBranchId: { in: ["branch-A"] } }, { id: { in: [] } }],
        isActive: false,
      },
      orderBy: { name: "asc" },
    });
  });

  it("lists all services without an active filter", async () => {
    findMany.mockResolvedValue([]);

    await listServices({
      businessId: "biz-1",
      branchId: "branch-A",
      userId: "user-A",
      status: "all",
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-1",
        OR: [{ ownerBranchId: null }, { ownerBranchId: { in: ["branch-A"] } }, { id: { in: [] } }],
      },
      orderBy: { name: "asc" },
    });
  });

  it("searches by service name", async () => {
    findMany.mockResolvedValue([]);

    await listServices({
      businessId: "biz-1",
      branchId: "branch-A",
      userId: "user-A",
      status: "active",
      search: "shirt",
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-1",
        OR: [{ ownerBranchId: null }, { ownerBranchId: { in: ["branch-A"] } }, { id: { in: [] } }],
        isActive: true,
        name: {
          contains: "shirt",
          mode: "insensitive",
        },
      },
      orderBy: { name: "asc" },
    });
  });
});

describe("getServiceForBusiness", () => {
  it("scopes lookup by id and businessId", async () => {
    findFirst.mockResolvedValue(null);

    await getServiceForBusiness("service-1", "biz-1", "branch-A", "user-A");

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "service-1",
        businessId: "biz-1",
        OR: [{ ownerBranchId: null }, { ownerBranchId: { in: ["branch-A"] } }, { id: { in: [] } }],
      },
    });
  });

  it("returns null when the service is outside the business", async () => {
    findFirst.mockResolvedValue(null);

    const result = await getServiceForBusiness(
      "service-1",
      "biz-B",
      "branch-A",
      "user-A",
    );

    expect(result).toBeNull();
  });
});

describe("createService", () => {
  it("creates the service using the supplied businessId", async () => {
    create.mockResolvedValue({
      id: "service-1",
      businessId: "biz-1",
      branchId: "branch-A",
      name: "Shirt",
      pieces: 1,
      unitPrice: 500,
    } as never);

    await createService({
      businessId: "biz-1",
      branchId: "branch-A",
      name: "Shirt",
      pieces: 1,
      unitPrice: 500,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        businessId: "biz-1",
        ownerBranchId: "branch-A",
        name: "Shirt",
        pieces: 1,
        unitPrice: 500,
      },
    });
  });
});

describe("updateService", () => {
  it("scopes update by id and businessId", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({
      id: "service-1",
      businessId: "biz-1",
      ownerBranchId: "branch-A",
    } as never);

    await updateService(
      "service-1",
      "biz-1",
      "branch-A",
      "user-A",
      { name: "Premium Shirt" },
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "service-1",
        businessId: "biz-1",
        ownerBranchId: "branch-A",
      },
      data: {
        name: "Premium Shirt",
      },
    });
  });

  it("throws 404 when the service is not found", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      updateService(
        "service-1",
        "biz-B",
        "branch-A",
        "user-A",
        { name: "Updated" },
      ),
    ).rejects.toThrow(AppError);
  });

  it("updates pieces and unitPrice", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({
      id: "service-1",
      businessId: "biz-1",
      ownerBranchId: "branch-A",
    } as never);

    await updateService(
      "service-1",
      "biz-1",
      "branch-A",
      "user-A",
      {
        pieces: 3,
        unitPrice: 1500,
      },
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "service-1",
        businessId: "biz-1",
        ownerBranchId: "branch-A",
      },
      data: {
        pieces: 3,
        unitPrice: 1500,
      },
    });
  });
});

describe("setServiceActiveStatus", () => {
  it("deactivates a service", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({
      id: "service-1",
      ownerBranchId: "branch-A",
      isActive: false,
    } as never);

    const result = await setServiceActiveStatus(
      "service-1",
      "biz-1",
      "branch-A",
      "user-A",
      false,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "service-1",
        businessId: "biz-1",
        ownerBranchId: "branch-A",
      },
      data: {
        isActive: false,
      },
    });

    expect(result?.isActive).toBe(false);
  });

  it("activates a service", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({
      id: "service-1",
      ownerBranchId: "branch-A",
      isActive: true,
    } as never);

    const result = await setServiceActiveStatus(
      "service-1",
      "biz-1",
      "branch-A",
      "user-A",
      true,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "service-1",
        businessId: "biz-1",
        ownerBranchId: "branch-A",
      },
      data: {
        isActive: true,
      },
    });

    expect(result?.isActive).toBe(true);
  });

  it("throws 404 when the service belongs to another business", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      setServiceActiveStatus(
        "service-1",
        "biz-B",
        "branch-A",
        "user-A",
        false,
      ),
    ).rejects.toThrow(AppError);
  });
});

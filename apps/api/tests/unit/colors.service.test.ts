import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    color: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from "../../src/lib/prisma.js";
import {
  DEFAULT_COLORS,
  createColor,
  ensureDefaultColors,
  listColors,
  setColorActiveStatus,
  updateColor,
} from "../../src/modules/colors/colors.service.js";
import { AppError } from "../../src/middleware/error-handler.js";

const createMany = vi.mocked(prisma.color.createMany);
const findMany = vi.mocked(prisma.color.findMany);
const findFirst = vi.mocked(prisma.color.findFirst);
const create = vi.mocked(prisma.color.create);
const updateMany = vi.mocked(prisma.color.updateMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureDefaultColors", () => {
  it("creates the complete starter colour catalogue for the business", async () => {
    createMany.mockResolvedValue({ count: DEFAULT_COLORS.length });

    await ensureDefaultColors("biz-1");

    expect(createMany).toHaveBeenCalledWith({
      data: DEFAULT_COLORS.map((name) => ({
        businessId: "biz-1",
        name,
        isActive: true,
      })),
      skipDuplicates: true,
    });

    expect(DEFAULT_COLORS).toHaveLength(26);
  });

  it("can seed defaults through a transaction client", async () => {
    const transactionColor = {
      createMany: vi.fn().mockResolvedValue({ count: DEFAULT_COLORS.length }),
    };

    await ensureDefaultColors(
      "biz-1",
      { color: transactionColor } as never,
    );

    expect(transactionColor.createMany).toHaveBeenCalledWith({
      data: DEFAULT_COLORS.map((name) => ({
        businessId: "biz-1",
        name,
        isActive: true,
      })),
      skipDuplicates: true,
    });
  });
});

describe("listColors", () => {
  it("seeds defaults and scopes active colours by businessId", async () => {
    createMany.mockResolvedValue({ count: 26 });
    findMany.mockResolvedValue([]);

    await listColors({
      businessId: "biz-1",
      status: "active",
    });

    expect(createMany).toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-1",
        isActive: true,
      },
      orderBy: { name: "asc" },
    });
  });

  it("lists inactive colours", async () => {
    createMany.mockResolvedValue({ count: 0 });
    findMany.mockResolvedValue([]);

    await listColors({
      businessId: "biz-1",
      status: "inactive",
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-1",
        isActive: false,
      },
      orderBy: { name: "asc" },
    });
  });

  it("lists all colours without an active filter", async () => {
    createMany.mockResolvedValue({ count: 0 });
    findMany.mockResolvedValue([]);

    await listColors({
      businessId: "biz-1",
      status: "all",
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-1",
      },
      orderBy: { name: "asc" },
    });
  });

  it("searches colours case-insensitively by name", async () => {
    createMany.mockResolvedValue({ count: 0 });
    findMany.mockResolvedValue([]);

    await listColors({
      businessId: "biz-1",
      status: "active",
      search: "blue",
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-1",
        isActive: true,
        name: {
          contains: "blue",
          mode: "insensitive",
        },
      },
      orderBy: { name: "asc" },
    });
  });
});

describe("createColor", () => {
  it("rejects a duplicate colour case-insensitively within the same business", async () => {
    findFirst.mockResolvedValue({
      id: "color-1",
      businessId: "biz-1",
      name: "Blue",
    } as never);

    await expect(
      createColor("biz-1", "blue"),
    ).rejects.toMatchObject({
      message: "Colour already exists",
      statusCode: 409,
    });

    expect(create).not.toHaveBeenCalled();
  });

  it("allows the same colour name in a different business", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({
      id: "color-2",
      businessId: "biz-2",
      name: "Blue",
    } as never);

    await createColor("biz-2", "Blue");

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        businessId: "biz-2",
        name: {
          equals: "Blue",
          mode: "insensitive",
        },
      },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        businessId: "biz-2",
        name: "Blue",
      },
    });
  });
});

describe("updateColor", () => {
  it("rejects renaming to a duplicate colour within the same business", async () => {
    findFirst.mockResolvedValue({
      id: "color-2",
      businessId: "biz-1",
      name: "Blue",
    } as never);

    await expect(
      updateColor("color-1", "biz-1", "blue"),
    ).rejects.toMatchObject({
      message: "Colour already exists",
      statusCode: 409,
    });

    expect(updateMany).not.toHaveBeenCalled();
  });

  it("updates only the colour belonging to the supplied business", async () => {
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "color-1",
        businessId: "biz-1",
        name: "Royal Blue",
      } as never);

    updateMany.mockResolvedValue({ count: 1 });

    await updateColor("color-1", "biz-1", "Royal Blue");

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "color-1",
        businessId: "biz-1",
      },
      data: {
        name: "Royal Blue",
      },
    });
  });

  it("throws 404 when the colour belongs to another business", async () => {
    findFirst.mockResolvedValue(null);
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      updateColor("color-1", "biz-B", "Updated"),
    ).rejects.toThrow(AppError);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "color-1",
        businessId: "biz-B",
      },
      data: {
        name: "Updated",
      },
    });
  });
});

describe("setColorActiveStatus", () => {
  it("deactivates a colour", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({
      id: "color-1",
      businessId: "biz-1",
      isActive: false,
    } as never);

    const result = await setColorActiveStatus(
      "color-1",
      "biz-1",
      false,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "color-1",
        businessId: "biz-1",
      },
      data: {
        isActive: false,
      },
    });

    expect(result?.isActive).toBe(false);
  });

  it("activates a colour", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({
      id: "color-1",
      businessId: "biz-1",
      isActive: true,
    } as never);

    const result = await setColorActiveStatus(
      "color-1",
      "biz-1",
      true,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "color-1",
        businessId: "biz-1",
      },
      data: {
        isActive: true,
      },
    });

    expect(result?.isActive).toBe(true);
  });

  it("throws 404 when the colour belongs to another business", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      setColorActiveStatus(
        "color-1",
        "biz-B",
        false,
      ),
    ).rejects.toThrow(AppError);
  });
});

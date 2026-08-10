import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    customer: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from "../../src/lib/prisma.js";
import {
  createCustomer,
  findPossibleDuplicates,
  getCustomerForBusiness,
  listCustomers,
  setCustomerActiveStatus,
  updateCustomer,
} from "../../src/modules/customers/customers.service.js";
import { AppError } from "../../src/middleware/error-handler.js";

const findMany = vi.mocked(prisma.customer.findMany);
const count = vi.mocked(prisma.customer.count);
const findFirst = vi.mocked(prisma.customer.findFirst);
const create = vi.mocked(prisma.customer.create);
const updateMany = vi.mocked(prisma.customer.updateMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listCustomers", () => {
  it("scopes the query by businessId", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await listCustomers({ businessId: "biz-1", page: 1, pageSize: 25, status: "active" });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: "biz-1", isActive: true }) }),
    );
  });

  it("applies pagination skip/take", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await listCustomers({ businessId: "biz-1", page: 3, pageSize: 10, status: "all" });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
  });

  it("returns pagination metadata computed from the total count", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(47);

    const result = await listCustomers({ businessId: "biz-1", page: 1, pageSize: 20, status: "active" });

    expect(result.pagination).toEqual({ page: 1, pageSize: 20, total: 47, totalPages: 3 });
  });

  it("searches by name and normalized phone", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await listCustomers({ businessId: "biz-1", page: 1, pageSize: 25, status: "active", search: "555-1234" });

    const call = findMany.mock.calls[0][0];
    expect(call.where.OR).toEqual([
      { name: { contains: "555-1234", mode: "insensitive" } },
      { phone: { contains: "5551234" } },
    ]);
  });

  it("does not add a phone search clause for a purely alphabetic search", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await listCustomers({ businessId: "biz-1", page: 1, pageSize: 25, status: "active", search: "Jane" });

    const call = findMany.mock.calls[0][0];
    expect(call.where.OR).toEqual([{ name: { contains: "Jane", mode: "insensitive" } }]);
  });
});

describe("getCustomerForBusiness - tenant isolation", () => {
  it("looks up by id AND businessId in a single query", async () => {
    findFirst.mockResolvedValue(null);

    await getCustomerForBusiness("cust-1", "biz-1");

    expect(findFirst).toHaveBeenCalledWith({ where: { id: "cust-1", businessId: "biz-1" } });
  });

  it("business A can retrieve its own customer", async () => {
    findFirst.mockResolvedValue({ id: "cust-1", businessId: "biz-A" } as never);
    const result = await getCustomerForBusiness("cust-1", "biz-A");
    expect(result).not.toBeNull();
  });

  it("business B cannot retrieve business A's customer (query scoped, returns null)", async () => {
    // Simulates the DB correctly finding nothing because the businessId
    // in the where clause doesn't match - this is the actual isolation
    // boundary, not a check performed after the fact.
    findFirst.mockResolvedValue(null);
    const result = await getCustomerForBusiness("cust-1", "biz-B");
    expect(result).toBeNull();
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "cust-1", businessId: "biz-B" } });
  });
});

describe("findPossibleDuplicates", () => {
  it("only matches active customers with the same normalized phone in the same business", async () => {
    findMany.mockResolvedValue([]);

    await findPossibleDuplicates("biz-1", "5551234567");

    expect(findMany).toHaveBeenCalledWith({
      where: { businessId: "biz-1", phone: "5551234567", isActive: true },
      select: { id: true, name: true, phone: true },
    });
  });

  it("excludes the given id from the match set when excludeId is provided (update flow)", async () => {
    findMany.mockResolvedValue([]);

    await findPossibleDuplicates("biz-1", "5551234567", "cust-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { businessId: "biz-1", phone: "5551234567", isActive: true, id: { not: "cust-1" } },
      select: { id: true, name: true, phone: true },
    });
  });
});

describe("createCustomer", () => {
  it("writes the given businessId (never a client-controlled one) onto the record", async () => {
    create.mockResolvedValue({ id: "cust-1" } as never);

    await createCustomer({ businessId: "biz-1", name: "Jane", phone: "5551234567" });

    expect(create).toHaveBeenCalledWith({
      data: { businessId: "biz-1", name: "Jane", phone: "5551234567", email: null, address: null, notes: null },
    });
  });
});

describe("updateCustomer - tenant isolation", () => {
  it("scopes the update by id AND businessId together", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: "cust-1" } as never);

    await updateCustomer("cust-1", "biz-1", { name: "New Name" });

    expect(updateMany).toHaveBeenCalledWith({ where: { id: "cust-1", businessId: "biz-1" }, data: { name: "New Name" } });
  });

  it("throws 404 (not a silent no-op) when nothing matched, e.g. cross-business", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(updateCustomer("cust-1", "biz-B", { name: "New Name" })).rejects.toThrow(AppError);
  });
});

describe("setCustomerActiveStatus", () => {
  it("throws 404 when the customer isn't in the caller's business", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(setCustomerActiveStatus("cust-1", "biz-B", false)).rejects.toThrow(AppError);
  });

  it("deactivates a customer that is in the caller's business", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: "cust-1", isActive: false } as never);

    const result = await setCustomerActiveStatus("cust-1", "biz-1", false);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "cust-1", businessId: "biz-1" }, data: { isActive: false } });
    expect(result?.isActive).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  customer: {
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  customerStatusHistory: {
    create: vi.fn(),
  },
  order: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  customerAccount: {
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  customerAccountTransaction: {
    updateMany: vi.fn(),
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import { prisma } from "../../src/lib/prisma.js";
import {
  createCustomer,
  findPossibleDuplicates,
  getCustomerForBusiness,
  listCustomers,
  mergeCustomer,
  setCustomerLifecycleStatus,
  transferCustomer,
  updateCustomer,
} from "../../src/modules/customers/customers.service.js";
import { AppError } from "../../src/middleware/error-handler.js";

const findMany = vi.mocked(prisma.customer.findMany);
const count = vi.mocked(prisma.customer.count);
const findFirst = vi.mocked(prisma.customer.findFirst);
const create = vi.mocked(prisma.customer.create);
const updateMany = vi.mocked(prisma.customer.updateMany);
const transaction = vi.mocked(prisma.$transaction);
const orderFindMany = vi.mocked(prisma.order.findMany);
const orderUpdateMany = vi.mocked(prisma.order.updateMany);
const customerAccountFindFirst = vi.mocked(prisma.customerAccount.findFirst);
const customerAccountUpdate = vi.mocked(prisma.customerAccount.update);
const customerAccountDelete = vi.mocked(prisma.customerAccount.delete);
const customerAccountTransactionUpdateMany = vi.mocked(
  prisma.customerAccountTransaction.updateMany,
);

beforeEach(() => {
  vi.clearAllMocks();

  transaction.mockImplementation(
    async (callback) => callback(prismaMock as never),
  );
});

describe("listCustomers", () => {
  it("scopes the query by businessId", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await listCustomers({ businessId: "biz-1", page: 1, pageSize: 25, status: "active" });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: "biz-1", lifecycleStatus: "ACTIVE" }) }),
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

    const call = findMany.mock.calls[0]![0];
    expect(call!.where!.OR).toEqual([
      { name: { contains: "555-1234", mode: "insensitive" } },
      { phone: { contains: "5551234" } },
    ]);
  });

  it("does not add a phone search clause for a purely alphabetic search", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await listCustomers({ businessId: "biz-1", page: 1, pageSize: 25, status: "active", search: "Jane" });

    const call = findMany.mock.calls[0]![0];
   expect(call!.where!.OR).toEqual([{ name: { contains: "Jane", mode: "insensitive" } }]);
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

describe("setCustomerLifecycleStatus", () => {
  it("throws 404 when the customer isn't in the caller's business", async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      setCustomerLifecycleStatus(
        "cust-1",
        "biz-B",
        "BLOCKED",
        "Repeated failed collection attempts",
        "user-1",
      ),
    ).rejects.toThrow(AppError);
  });

  it("changes status and records the complete status history", async () => {
    findFirst.mockResolvedValue({
      id: "cust-1",
      lifecycleStatus: "ACTIVE",
    } as never);

    prismaMock.customer.update.mockResolvedValue({
      id: "cust-1",
      lifecycleStatus: "BLOCKED",
      isActive: false,
      statusReason: "Repeated failed collection attempts",
    } as never);

    prismaMock.customerStatusHistory.create.mockResolvedValue({
      id: "history-1",
    } as never);

    const result = await setCustomerLifecycleStatus(
      "cust-1",
      "biz-1",
      "BLOCKED",
      "Repeated failed collection attempts",
      "user-1",
    );

    expect(prismaMock.customer.update).toHaveBeenCalledWith({
      where: { id: "cust-1" },
      data: {
        lifecycleStatus: "BLOCKED",
        isActive: false,
        statusReason: "Repeated failed collection attempts",
        statusChangedAt: expect.any(Date),
        statusChangedById: "user-1",
      },
    });

    expect(prismaMock.customerStatusHistory.create).toHaveBeenCalledWith({
      data: {
        customerId: "cust-1",
        businessId: "biz-1",
        previousStatus: "ACTIVE",
        newStatus: "BLOCKED",
        reason: "Repeated failed collection attempts",
        changedById: "user-1",
      },
    });

    expect(result.previousStatus).toBe("ACTIVE");
    expect(result.customer.lifecycleStatus).toBe("BLOCKED");
  });
});



describe("mergeCustomer - duplicate account merge", () => {
  const sourceCustomer = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Customer A",
    businessId: "biz-A",
    isActive: true,
  };

  const targetCustomer = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    name: "Customer B",
    businessId: "biz-A",
    isActive: true,
  };

  const orders = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      orderNumber: "00042",
      branchId: "branch-A",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      orderNumber: "00043",
      branchId: "branch-B",
    },
  ];

  it("merges every source order into the target and deactivates the source in one transaction", async () => {
    findFirst
      .mockResolvedValueOnce(sourceCustomer as never)
      .mockResolvedValueOnce(targetCustomer as never);

    orderFindMany.mockResolvedValue(orders as never);
    orderUpdateMany.mockResolvedValue({ count: orders.length });
    updateMany.mockResolvedValue({ count: 1 });

    const result = await mergeCustomer(
      sourceCustomer.id,
      "biz-A",
      targetCustomer.id,
    );

    expect(transaction).toHaveBeenCalledTimes(1);

    expect(orderFindMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        customerId: sourceCustomer.id,
      },
      select: {
        id: true,
        orderNumber: true,
        branchId: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        customerId: sourceCustomer.id,
      },
      data: {
        customerId: targetCustomer.id,
      },
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: sourceCustomer.id,
        businessId: "biz-A",
      },
      data: {
        isActive: false,
      },
    });

    expect(result).toEqual({
      customer: sourceCustomer,
      targetCustomer,
      mergedOrderCount: 2,
      mergedOrders: orders,
      sourceDeactivated: true,
    });
  });

  it("merges an account with no orders and still deactivates the source", async () => {
    findFirst
      .mockResolvedValueOnce(sourceCustomer as never)
      .mockResolvedValueOnce(targetCustomer as never);

    orderFindMany.mockResolvedValue([]);
    updateMany.mockResolvedValue({ count: 1 });

    const result = await mergeCustomer(
      sourceCustomer.id,
      "biz-A",
      targetCustomer.id,
    );

    expect(orderFindMany).toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: sourceCustomer.id,
        businessId: "biz-A",
      },
      data: {
        isActive: false,
      },
    });

    expect(result.mergedOrderCount).toBe(0);
    expect(result.mergedOrders).toEqual([]);
    expect(result.sourceDeactivated).toBe(true);
  });

  it("rejects merging a customer into itself", async () => {
    findFirst.mockResolvedValueOnce(sourceCustomer as never);

    await expect(
      mergeCustomer(sourceCustomer.id, "biz-A", sourceCustomer.id),
    ).rejects.toThrow("Customer cannot be merged into the same customer");

    expect(orderFindMany).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("rejects a target customer outside the authenticated business", async () => {
    findFirst
      .mockResolvedValueOnce(sourceCustomer as never)
      .mockResolvedValueOnce(null);

    await expect(
      mergeCustomer(
        sourceCustomer.id,
        "biz-A",
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      ),
    ).rejects.toThrow("Target customer not found");

    expect(orderFindMany).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("rejects a source customer outside the authenticated business", async () => {
    findFirst.mockResolvedValueOnce(null);

    await expect(
      mergeCustomer(
        sourceCustomer.id,
        "biz-B",
        targetCustomer.id,
      ),
    ).rejects.toThrow("Customer not found");

    expect(orderFindMany).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("moves source account transactions onto an existing target account and removes only the empty source account", async () => {
    findFirst
      .mockResolvedValueOnce(sourceCustomer as never)
      .mockResolvedValueOnce(targetCustomer as never);

    orderFindMany.mockResolvedValue([]);
    customerAccountFindFirst
      .mockResolvedValueOnce({ id: "source-account" } as never)
      .mockResolvedValueOnce({ id: "target-account" } as never);
    customerAccountTransactionUpdateMany.mockResolvedValue({ count: 2 });
    customerAccountDelete.mockResolvedValue({ id: "source-account" } as never);
    updateMany.mockResolvedValue({ count: 1 });

    await mergeCustomer(
      sourceCustomer.id,
      "biz-A",
      targetCustomer.id,
    );

    expect(customerAccountTransactionUpdateMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        customerAccountId: "source-account",
      },
      data: {
        customerAccountId: "target-account",
      },
    });

    expect(customerAccountDelete).toHaveBeenCalledWith({
      where: {
        id: "source-account",
      },
    });

    expect(customerAccountUpdate).not.toHaveBeenCalled();
  });

  it("moves the source account itself when the target has no account", async () => {
    findFirst
      .mockResolvedValueOnce(sourceCustomer as never)
      .mockResolvedValueOnce(targetCustomer as never);

    orderFindMany.mockResolvedValue([]);
    customerAccountFindFirst
      .mockResolvedValueOnce({ id: "source-account" } as never)
      .mockResolvedValueOnce(null);
    customerAccountUpdate.mockResolvedValue({
      id: "source-account",
      customerId: targetCustomer.id,
    } as never);
    updateMany.mockResolvedValue({ count: 1 });

    await mergeCustomer(
      sourceCustomer.id,
      "biz-A",
      targetCustomer.id,
    );

    expect(customerAccountUpdate).toHaveBeenCalledWith({
      where: {
        id: "source-account",
      },
      data: {
        customerId: targetCustomer.id,
      },
    });

    expect(customerAccountTransactionUpdateMany).not.toHaveBeenCalled();
    expect(customerAccountDelete).not.toHaveBeenCalled();
  });

  it("deactivates the source instead of deleting or rewriting the target account", async () => {
    findFirst
      .mockResolvedValueOnce(sourceCustomer as never)
      .mockResolvedValueOnce(targetCustomer as never);

    orderFindMany.mockResolvedValue(orders as never);
    orderUpdateMany.mockResolvedValue({ count: orders.length });
    updateMany.mockResolvedValue({ count: 1 });

    await mergeCustomer(
      sourceCustomer.id,
      "biz-A",
      targetCustomer.id,
    );

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.customer.create).not.toHaveBeenCalled();

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: sourceCustomer.id,
        businessId: "biz-A",
      },
      data: {
        isActive: false,
      },
    });
  });
});

describe("transferCustomer - full account transfer", () => {
  const sourceCustomer = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Customer A",
    businessId: "biz-A",
  };

  const targetCustomer = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    name: "Customer B",
    businessId: "biz-A",
  };

  const orders = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      orderNumber: "00042",
      branchId: "branch-A",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      orderNumber: "00043",
      branchId: "branch-B",
    },
  ];

  it("moves every order belonging to Customer A to Customer B in one transaction", async () => {
    findFirst
      .mockResolvedValueOnce(sourceCustomer as never)
      .mockResolvedValueOnce(targetCustomer as never);

    orderFindMany.mockResolvedValue(orders as never);
    orderUpdateMany.mockResolvedValue({ count: orders.length });

    const result = await transferCustomer(
      sourceCustomer.id,
      "biz-A",
      targetCustomer.id,
    );

    expect(transaction).toHaveBeenCalledTimes(1);

    expect(orderFindMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        customerId: sourceCustomer.id,
      },
      select: {
        id: true,
        orderNumber: true,
        branchId: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        customerId: sourceCustomer.id,
      },
      data: {
        customerId: targetCustomer.id,
      },
    });

    expect(result).toEqual({
      customer: sourceCustomer,
      targetCustomer,
      transferredOrderCount: 2,
      transferredOrders: orders,
    });
  });

  it("transfers an account with no orders without performing an order update", async () => {
    findFirst
      .mockResolvedValueOnce(sourceCustomer as never)
      .mockResolvedValueOnce(targetCustomer as never);

    orderFindMany.mockResolvedValue([]);

    const result = await transferCustomer(
      sourceCustomer.id,
      "biz-A",
      targetCustomer.id,
    );

    expect(orderFindMany).toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(result.transferredOrderCount).toBe(0);
    expect(result.transferredOrders).toEqual([]);
  });

  it("rejects transferring a customer to itself", async () => {
    findFirst.mockResolvedValueOnce(sourceCustomer as never);

    await expect(
      transferCustomer(sourceCustomer.id, "biz-A", sourceCustomer.id),
    ).rejects.toThrow("Customer cannot be transferred to the same customer");

    expect(orderFindMany).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a target customer outside the authenticated business", async () => {
    findFirst
      .mockResolvedValueOnce(sourceCustomer as never)
      .mockResolvedValueOnce(null);

    await expect(
      transferCustomer(
        sourceCustomer.id,
        "biz-A",
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      ),
    ).rejects.toThrow("Target customer not found");

    expect(orderFindMany).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a source customer outside the authenticated business", async () => {
    findFirst.mockResolvedValueOnce(null);

    await expect(
      transferCustomer(
        sourceCustomer.id,
        "biz-B",
        targetCustomer.id,
      ),
    ).rejects.toThrow("Customer not found");

    expect(orderFindMany).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it("moves source account transactions onto an existing target account", async () => {
    findFirst
      .mockResolvedValueOnce(sourceCustomer as never)
      .mockResolvedValueOnce(targetCustomer as never);

    orderFindMany.mockResolvedValue([]);
    customerAccountFindFirst
      .mockResolvedValueOnce({ id: "source-account" } as never)
      .mockResolvedValueOnce({ id: "target-account" } as never);
    customerAccountTransactionUpdateMany.mockResolvedValue({ count: 3 });
    customerAccountDelete.mockResolvedValue({ id: "source-account" } as never);

    await transferCustomer(
      sourceCustomer.id,
      "biz-A",
      targetCustomer.id,
    );

    expect(customerAccountTransactionUpdateMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        customerAccountId: "source-account",
      },
      data: {
        customerAccountId: "target-account",
      },
    });

    expect(customerAccountDelete).toHaveBeenCalledWith({
      where: {
        id: "source-account",
      },
    });

    expect(customerAccountUpdate).not.toHaveBeenCalled();
  });

  it("moves the source account itself when the target has no account", async () => {
    findFirst
      .mockResolvedValueOnce(sourceCustomer as never)
      .mockResolvedValueOnce(targetCustomer as never);

    orderFindMany.mockResolvedValue([]);
    customerAccountFindFirst
      .mockResolvedValueOnce({ id: "source-account" } as never)
      .mockResolvedValueOnce(null);
    customerAccountUpdate.mockResolvedValue({
      id: "source-account",
      customerId: targetCustomer.id,
    } as never);

    await transferCustomer(
      sourceCustomer.id,
      "biz-A",
      targetCustomer.id,
    );

    expect(customerAccountUpdate).toHaveBeenCalledWith({
      where: {
        id: "source-account",
      },
      data: {
        customerId: targetCustomer.id,
      },
    });

    expect(customerAccountTransactionUpdateMany).not.toHaveBeenCalled();
    expect(customerAccountDelete).not.toHaveBeenCalled();
  });

  it("keeps the source customer record intact", async () => {
    findFirst
      .mockResolvedValueOnce(sourceCustomer as never)
      .mockResolvedValueOnce(targetCustomer as never);

    orderFindMany.mockResolvedValue(orders as never);
    orderUpdateMany.mockResolvedValue({ count: orders.length });

    await transferCustomer(
      sourceCustomer.id,
      "biz-A",
      targetCustomer.id,
    );

    expect(prisma.customer.updateMany).not.toHaveBeenCalled();
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });
});

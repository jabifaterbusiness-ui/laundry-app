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
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  branchResourceShare: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
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
  prismaMock.branchResourceShare.findMany.mockReset().mockResolvedValue([]);
  prismaMock.branchResourceShare.findFirst.mockReset().mockResolvedValue(null);
  findFirst.mockResolvedValue({ ownerBranchId: "branch-A" } as never);

  transaction.mockImplementation(
    async (callback) => callback(prismaMock as never),
  );
  prismaMock.order.findFirst.mockReset();
});

describe("listCustomers", () => {
  it("scopes the query by businessId", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await listCustomers({ businessId: "biz-1", branchId: "branch-A", userId: "user-A", page: 1, pageSize: 25, status: "active" });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: "biz-1", lifecycleStatus: "ACTIVE" }) }),
    );
  });

  it("does not return unassigned legacy customers to a branch list", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    const result = await listCustomers({
      businessId: "biz-1",
      branchId: "branch-A",
      userId: "user-A",
      page: 1,
      pageSize: 25,
      status: "all",
    });

    expect(result.data).toEqual([]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { ownerBranch: { select: { id: true, name: true } } },
      }),
    );
  });

  it("applies pagination skip/take", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await listCustomers({ businessId: "biz-1", branchId: "branch-A", userId: "user-A", page: 3, pageSize: 10, status: "all" });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
  });

  it("returns pagination metadata computed from the total count", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(47);

    const result = await listCustomers({ businessId: "biz-1", branchId: "branch-A", userId: "user-A", page: 1, pageSize: 20, status: "active" });

    expect(result.pagination).toEqual({ page: 1, pageSize: 20, total: 47, totalPages: 3 });
  });

  it("searches by name, email, order, invoice, and normalized phone", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await listCustomers({ businessId: "biz-1", branchId: "branch-A", userId: "user-A", page: 1, pageSize: 25, status: "active", search: "555-1234" });

    const call = findMany.mock.calls[0]![0];
    expect(call!.where!.AND).toEqual([{ OR: [
      { name: { contains: "555-1234", mode: "insensitive" } },
      { email: { contains: "555-1234", mode: "insensitive" } },
      {
        orders: {
          some: {
            branchId: "branch-A",
            orderNumber: { contains: "555-1234", mode: "insensitive" },
          },
        },
      },
      {
        orders: {
          some: {
            branchId: "branch-A",
            invoice: {
              is: {
                invoiceNumber: { contains: "555-1234", mode: "insensitive" },
              },
            },
          },
        },
      },
      { phone: { contains: "5551234" } },
    ] }]);
  });

  it("does not add a phone search clause for a purely alphabetic search", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await listCustomers({ businessId: "biz-1", branchId: "branch-A", userId: "user-A", page: 1, pageSize: 25, status: "active", search: "Jane" });

    const call = findMany.mock.calls[0]![0];
    expect(call!.where!.AND).toEqual([{ OR: [
      { name: { contains: "Jane", mode: "insensitive" } },
      { email: { contains: "Jane", mode: "insensitive" } },
      {
        orders: {
          some: {
            branchId: "branch-A",
            orderNumber: { contains: "Jane", mode: "insensitive" },
          },
        },
      },
      {
        orders: {
          some: {
            branchId: "branch-A",
            invoice: {
              is: {
                invoiceNumber: { contains: "Jane", mode: "insensitive" },
              },
            },
          },
        },
      },
    ] }]);
  });
});

describe("getCustomerForBusiness - tenant isolation", () => {
  it("looks up by id AND businessId in a single query", async () => {
    findFirst.mockResolvedValue(null);

    await getCustomerForBusiness("cust-1", "biz-1", "branch-A", "user-A");

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "cust-1",
        businessId: "biz-1",
        OR: [
          { ownerBranchId: { in: ["branch-A"] } },
          { id: { in: [] } },
        ],
      },
      include: { ownerBranch: { select: { id: true, name: true } } },
    });
  });

  it("business A can retrieve its own customer", async () => {
    findFirst.mockResolvedValue({ id: "cust-1", businessId: "biz-A" } as never);
    const result = await getCustomerForBusiness("cust-1", "biz-A", "branch-A", "user-A");
    expect(result).not.toBeNull();
  });

  it("business B cannot retrieve business A's customer (query scoped, returns null)", async () => {
    // Simulates the DB correctly finding nothing because the businessId
    // in the where clause doesn't match - this is the actual isolation
    // boundary, not a check performed after the fact.
    findFirst.mockResolvedValue(null);
    const result = await getCustomerForBusiness("cust-1", "biz-B", "branch-A", "user-A");
    expect(result).toBeNull();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "cust-1", businessId: "biz-B" }),
    }));
  });
});

describe("findPossibleDuplicates", () => {
  it("only matches active customers with the same normalized phone in the same business", async () => {
    findMany.mockResolvedValue([]);

    await findPossibleDuplicates("biz-1", "branch-A", "user-A", "5551234567");

    expect(findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-1",
        OR: [
          { ownerBranchId: { in: ["branch-A"] } },
          { id: { in: [] } },
        ],
        phone: "5551234567",
        isActive: true,
      },
      select: { id: true, name: true, phone: true },
    });
  });

  it("excludes the given id from the match set when excludeId is provided (update flow)", async () => {
    findMany.mockResolvedValue([]);

    await findPossibleDuplicates("biz-1", "branch-A", "user-A", "5551234567", "cust-1");

    expect(findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-1",
        OR: [
          { ownerBranchId: { in: ["branch-A"] } },
          { id: { in: [] } },
        ],
        phone: "5551234567",
        isActive: true,
        id: { not: "cust-1" },
      },
      select: { id: true, name: true, phone: true },
    });
  });
});

describe("createCustomer", () => {
  it("writes the given businessId (never a client-controlled one) onto the record", async () => {
    create.mockResolvedValue({ id: "cust-1" } as never);

    await createCustomer({ businessId: "biz-1", branchId: "branch-A", name: "Jane", phone: "5551234567" });

    expect(create).toHaveBeenCalledWith({
      data: { businessId: "biz-1", ownerBranchId: "branch-A", name: "Jane", phone: "5551234567", email: null, address: null, notes: null, whatsappOptIn: false, whatsappOptInAt: null, whatsappOptInSource: null },
    });
  });

  it("records explicit consent source and timestamp only when the customer opts in", async () => {
    create.mockResolvedValue({ id: "cust-2" } as never);
    await createCustomer({
      businessId: "biz-1", branchId: "branch-A", name: "Ada", phone: "2348012345678",
      whatsappOptIn: true, whatsappOptInSource: "CUSTOMER_WRITTEN",
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: "biz-1", whatsappOptIn: true,
        whatsappOptInAt: expect.any(Date), whatsappOptInSource: "CUSTOMER_WRITTEN",
      }),
    });
  });
});

describe("updateCustomer - tenant isolation", () => {
  it("scopes the update by id AND businessId together", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: "cust-1", ownerBranchId: "branch-A" } as never);

    await updateCustomer("cust-1", "biz-1", "branch-A", "user-A", { name: "New Name" });

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "cust-1", businessId: "biz-1" }, data: { name: "New Name" } });
  });

  it("repairs a legacy opt-in that has no recorded source or timestamp", async () => {
    findFirst
      .mockResolvedValueOnce({
        id: "cust-legacy",
        businessId: "biz-1",
        ownerBranchId: "branch-A",
        phone: "2348012345678",
        whatsappOptIn: true,
        whatsappOptInAt: null,
        whatsappOptInSource: null,
      } as never)
      .mockResolvedValueOnce({
        id: "cust-legacy",
        ownerBranchId: "branch-A",
        whatsappOptIn: true,
        whatsappOptInAt: new Date(),
        whatsappOptInSource: "CUSTOMER_WRITTEN",
      } as never);
    updateMany.mockResolvedValue({ count: 1 });

    await updateCustomer("cust-legacy", "biz-1", "branch-A", "user-A", {
      whatsappOptIn: true,
      whatsappOptInSource: "CUSTOMER_WRITTEN",
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "cust-legacy", businessId: "biz-1" },
      data: expect.objectContaining({
        whatsappOptIn: true,
        whatsappOptInAt: expect.any(Date),
        whatsappOptInSource: "CUSTOMER_WRITTEN",
        whatsappOptOutAt: null,
      }),
    });
  });

  it("records opt-out only when a previously opted-in customer withdraws consent", async () => {
    findFirst.mockResolvedValue({ whatsappOptIn: true } as never);
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValueOnce({ ownerBranchId: "branch-A", whatsappOptIn: true } as never).mockResolvedValueOnce({ id: "cust-1", ownerBranchId: "branch-A" } as never);
    await updateCustomer("cust-1", "biz-1", "branch-A", "user-A", { whatsappOptIn: false });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "cust-1", businessId: "biz-1" },
      data: { whatsappOptIn: false, whatsappOptOutAt: expect.any(Date) },
    });
  });

  it("invalidates old WhatsApp consent when the customer's phone number changes", async () => {
    findFirst
      .mockResolvedValueOnce({
        id: "cust-1",
        businessId: "biz-1",
        ownerBranchId: "branch-A",
        phone: "2348011111111",
        whatsappOptIn: true,
        whatsappOptInAt: new Date("2026-09-01T00:00:00.000Z"),
        whatsappOptInSource: "CUSTOMER_WRITTEN",
        whatsappOptOutAt: null,
      } as never)
      .mockResolvedValueOnce({ id: "cust-1", phone: "2348022222222", whatsappOptIn: false } as never);
    updateMany.mockResolvedValue({ count: 1 });

    await updateCustomer("cust-1", "biz-1", "branch-A", "user-A", {
      phone: "2348022222222",
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "cust-1", businessId: "biz-1" },
      data: {
        phone: "2348022222222",
        whatsappOptIn: false,
      },
    });
  });

  it("preserves existing WhatsApp consent when only phone formatting changes", async () => {
    const consentAt = new Date("2026-09-01T00:00:00.000Z");
    findFirst
      .mockResolvedValueOnce({
        id: "cust-1",
        businessId: "biz-1",
        ownerBranchId: "branch-A",
        phone: "2348011111111",
        whatsappOptIn: true,
        whatsappOptInAt: consentAt,
        whatsappOptInSource: "CUSTOMER_WRITTEN",
        whatsappOptOutAt: null,
      } as never)
      .mockResolvedValueOnce({ id: "cust-1", phone: "+234 801 111 1111", whatsappOptIn: true } as never);
    updateMany.mockResolvedValue({ count: 1 });

    await updateCustomer("cust-1", "biz-1", "branch-A", "user-A", {
      phone: "+234 801 111 1111",
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "cust-1", businessId: "biz-1" },
      data: { phone: "+234 801 111 1111" },
    });
  });

  it("records fresh WhatsApp consent when the new phone opts in during the same update", async () => {
    findFirst
      .mockResolvedValueOnce({
        id: "cust-1",
        businessId: "biz-1",
        ownerBranchId: "branch-A",
        phone: "2348011111111",
        whatsappOptIn: true,
      } as never)
      .mockResolvedValueOnce({ id: "cust-1", phone: "2348022222222", whatsappOptIn: true } as never);
    updateMany.mockResolvedValue({ count: 1 });

    await updateCustomer("cust-1", "biz-1", "branch-A", "user-A", {
      phone: "2348022222222",
      whatsappOptIn: true,
      whatsappOptInSource: "CUSTOMER_WRITTEN",
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "cust-1", businessId: "biz-1" },
      data: expect.objectContaining({
        phone: "2348022222222",
        whatsappOptIn: true,
        whatsappOptInAt: expect.any(Date),
        whatsappOptInSource: "CUSTOMER_WRITTEN",
        whatsappOptOutAt: null,
      }),
    });
  });

  it("throws 404 (not a silent no-op) when nothing matched, e.g. cross-business", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(updateCustomer("cust-1", "biz-B", "branch-A", "user-A", { name: "New Name" })).rejects.toThrow(AppError);
  });
});


  it("rejects customer edits through a read-only branch share", async () => {
    prismaMock.branchResourceShare.findMany.mockResolvedValue([
      { ownerBranchId: "branch-B", resourceId: null, accessLevel: "READ" },
    ] as never);
    findFirst.mockResolvedValue({
      id: "customer-1",
      businessId: "biz-A",
      ownerBranchId: "branch-B",
      whatsappOptIn: false,
    } as never);

    await expect(
      updateCustomer("customer-1", "biz-A", "branch-A", "user-A", {
        name: "Unauthorized edit",
      }),
    ).rejects.toThrow(AppError);

    expect(prismaMock.branchResourceShare.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz-A",
          ownerBranchId: "branch-B",
          targetBranchId: "branch-A",
          resourceType: "CUSTOMERS",
          accessLevel: "EDIT",
        }),
      }),
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

describe("setCustomerLifecycleStatus", () => {
  it("throws 404 when the customer isn't in the caller's business", async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      setCustomerLifecycleStatus(
        "cust-1",
        "biz-B",
        "branch-A",
        "user-A",
        "BLOCKED",
        "Repeated failed collection attempts",
        "user-1",
      ),
    ).rejects.toThrow(AppError);
  });

  it("changes status and records the complete status history", async () => {
    findFirst.mockResolvedValue({
      id: "cust-1",
      ownerBranchId: "branch-A",
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
      "branch-A",
      "user-A",
      "BLOCKED",
      "Repeated failed collection attempts",
      "user-1",
    );

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
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
    ownerBranchId: "branch-A",
    isActive: true,
    lifecycleStatus: "ACTIVE",
  };

  const targetCustomer = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    name: "Customer B",
    businessId: "biz-A",
    ownerBranchId: "branch-A",
    isActive: true,
  };

  const orders = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      orderNumber: "00042",
      branchId: "branch-A",
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
      "branch-A",
      "user-A",
      targetCustomer.id,
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });

    expect(orderFindMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        branchId: "branch-A",
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
        branchId: "branch-A",
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
        ownerBranchId: "branch-A",
      },
      data: {
        isActive: false,
        lifecycleStatus: "DORMANT",
        statusReason: "Merged into another customer",
        statusChangedAt: expect.any(Date),
        statusChangedById: "user-A",
      },
    });
    expect(prismaMock.customerStatusHistory.create).toHaveBeenCalledWith({
      data: {
        customerId: sourceCustomer.id,
        businessId: "biz-A",
        previousStatus: "ACTIVE",
        newStatus: "DORMANT",
        reason: "Merged into another customer",
        changedById: "user-A",
      },
    });

    expect(result).toEqual({
      customer: sourceCustomer,
      targetCustomer,
      mergedOrderCount: 1,
      mergedOrders: orders,
      sourceDeactivated: true,
    });
  });

  it("keeps the source active when another branch still has its orders", async () => {
    findFirst
      .mockResolvedValueOnce(sourceCustomer as never)
      .mockResolvedValueOnce(targetCustomer as never);
    orderFindMany.mockResolvedValue(orders as never);
    prismaMock.order.findFirst.mockResolvedValue({ id: "foreign-order" } as never);

    const result = await mergeCustomer(
      sourceCustomer.id,
      "biz-A",
      "branch-A",
      "user-A",
      targetCustomer.id,
    );

    expect(result.sourceDeactivated).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
    expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        customerId: sourceCustomer.id,
        branchId: { not: "branch-A" },
      },
      select: { id: true },
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
      "branch-A",
      "user-A",
      targetCustomer.id,
    );

    expect(orderFindMany).toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: sourceCustomer.id,
        businessId: "biz-A",
        ownerBranchId: "branch-A",
      },
      data: {
        isActive: false,
        lifecycleStatus: "DORMANT",
        statusReason: "Merged into another customer",
        statusChangedAt: expect.any(Date),
        statusChangedById: "user-A",
      },
    });

    expect(result.mergedOrderCount).toBe(0);
    expect(result.mergedOrders).toEqual([]);
    expect(result.sourceDeactivated).toBe(true);
  });

  it("rejects merging a customer into itself", async () => {
    findFirst.mockResolvedValueOnce(sourceCustomer as never);

    await expect(
      mergeCustomer(sourceCustomer.id, "biz-A", "branch-A", "user-A", sourceCustomer.id),
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
        "branch-A",
        "user-A",
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
        "branch-A",
        "user-A",
        targetCustomer.id,
      ),
    ).rejects.toThrow("Customer not found");

    expect(orderFindMany).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("rejects merging ledgers when the target customer's account mode differs", async () => {
    findFirst
      .mockResolvedValueOnce({ ...sourceCustomer, ownerBranchId: "branch-B" } as never)
      .mockResolvedValueOnce({ ...targetCustomer, ownerBranchId: "branch-A" } as never);
    prismaMock.branchResourceShare.findFirst.mockImplementation((args) => Promise.resolve(
      args?.select?.customerAccountMode
        ? { customerAccountMode: "SEPARATE" }
        : { id: "edit-share", accessLevel: "EDIT" },
    ) as never);
    orderFindMany.mockResolvedValue([]);
    customerAccountFindFirst
      .mockResolvedValueOnce({ id: "source-account", branchId: "branch-A" } as never)
      .mockResolvedValueOnce(null);

    await expect(
      mergeCustomer(sourceCustomer.id, "biz-A", "branch-A", "user-A", targetCustomer.id),
    ).rejects.toMatchObject({
      message: "Customer accounts belong to different branches and cannot be merged together",
      statusCode: 409,
    });

    expect(customerAccountUpdate).not.toHaveBeenCalled();
    expect(customerAccountTransactionUpdateMany).not.toHaveBeenCalled();
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
      "branch-A",
      "user-A",
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
      "branch-A",
      "user-A",
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
      "branch-A",
      "user-A",
      targetCustomer.id,
    );

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.customer.create).not.toHaveBeenCalled();

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: sourceCustomer.id,
        businessId: "biz-A",
        ownerBranchId: "branch-A",
      },
      data: {
        isActive: false,
        lifecycleStatus: "DORMANT",
        statusReason: "Merged into another customer",
        statusChangedAt: expect.any(Date),
        statusChangedById: "user-A",
      },
    });
  });
});

describe("transferCustomer - full account transfer", () => {
  const sourceCustomer = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Customer A",
    businessId: "biz-A",
    ownerBranchId: "branch-A",
  };

  const targetCustomer = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    name: "Customer B",
    businessId: "biz-A",
    ownerBranchId: "branch-A",
  };

  const orders = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      orderNumber: "00042",
      branchId: "branch-A",
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
      "branch-A",
      "user-A",
      targetCustomer.id,
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });

    expect(orderFindMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz-A",
        branchId: "branch-A",
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
        branchId: "branch-A",
        customerId: sourceCustomer.id,
      },
      data: {
        customerId: targetCustomer.id,
      },
    });

    expect(result).toEqual({
      customer: sourceCustomer,
      targetCustomer,
      transferredOrderCount: 1,
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
      "branch-A",
      "user-A",
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
      transferCustomer(sourceCustomer.id, "biz-A", "branch-A", "user-A", sourceCustomer.id),
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
        "branch-A",
        "user-A",
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
        "branch-A",
        "user-A",
        targetCustomer.id,
      ),
    ).rejects.toThrow("Customer not found");

    expect(orderFindMany).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it("uses only the selected branch's separate customer ledgers during transfer", async () => {
    findFirst
      .mockReset()
      .mockResolvedValueOnce({ ...sourceCustomer, ownerBranchId: "branch-B" } as never)
      .mockResolvedValueOnce({ ...targetCustomer, ownerBranchId: "branch-B" } as never);
    prismaMock.branchResourceShare.findFirst
      .mockReset()
      .mockImplementation((args) => Promise.resolve(
        args?.select?.customerAccountMode
          ? { customerAccountMode: "SEPARATE" }
          : { id: "edit-share" },
      ) as never);
    orderFindMany.mockResolvedValue([]);
    customerAccountFindFirst
      .mockReset()
      .mockResolvedValueOnce({ id: "source-branch-account", branchId: "branch-A" } as never)
      .mockResolvedValueOnce({ id: "target-branch-account", branchId: "branch-A" } as never);
    customerAccountTransactionUpdateMany.mockResolvedValue({ count: 2 });
    customerAccountDelete.mockResolvedValue({ id: "source-branch-account" } as never);

    await transferCustomer(sourceCustomer.id, "biz-A", "branch-A", "user-A", targetCustomer.id);

    expect(customerAccountFindFirst).toHaveBeenNthCalledWith(1, {
      where: { customerId: sourceCustomer.id, businessId: "biz-A", branchId: "branch-A" },
      select: { id: true, branchId: true },
    });
    expect(customerAccountFindFirst).toHaveBeenNthCalledWith(2, {
      where: { customerId: targetCustomer.id, businessId: "biz-A", branchId: "branch-A" },
      select: { id: true, branchId: true },
    });
    expect(customerAccountTransactionUpdateMany).toHaveBeenCalledWith({
      where: { businessId: "biz-A", customerAccountId: "source-branch-account" },
      data: { customerAccountId: "target-branch-account" },
    });
  });

  it("rejects transferring a source ledger into a target with a different account mode", async () => {
    findFirst
      .mockResolvedValueOnce({ ...sourceCustomer, ownerBranchId: "branch-B" } as never)
      .mockResolvedValueOnce({ ...targetCustomer, ownerBranchId: "branch-A" } as never);
    prismaMock.branchResourceShare.findFirst.mockImplementation((args) => Promise.resolve(
      args?.select?.customerAccountMode
        ? { customerAccountMode: "SEPARATE" }
        : { id: "edit-share", accessLevel: "EDIT" },
    ) as never);
    orderFindMany.mockResolvedValue([]);
    customerAccountFindFirst
      .mockResolvedValueOnce({ id: "source-account", branchId: "branch-A" } as never)
      .mockResolvedValueOnce(null);

    await expect(
      transferCustomer(sourceCustomer.id, "biz-A", "branch-A", "user-A", targetCustomer.id),
    ).rejects.toMatchObject({
      message: "Customer accounts belong to different branches and cannot be transferred together",
      statusCode: 409,
    });

    expect(customerAccountUpdate).not.toHaveBeenCalled();
    expect(customerAccountTransactionUpdateMany).not.toHaveBeenCalled();
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
      "branch-A",
      "user-A",
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
      "branch-A",
      "user-A",
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
      "branch-A",
      "user-A",
      targetCustomer.id,
    );

    expect(prisma.customer.updateMany).not.toHaveBeenCalled();
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });
});

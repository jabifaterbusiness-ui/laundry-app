import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { hasPermission } from "../../src/modules/permissions/permissions.service.js";
import { globalSearch } from "../../src/modules/search/search.service.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    customer: {
      findMany: vi.fn(),
    },
    branchResourceShare: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    order: {
      findMany: vi.fn(),
    },
    invoice: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../../src/modules/permissions/permissions.service.js", () => ({
  hasPermission: vi.fn(),
}));

const customerFindMany = vi.mocked(prisma.customer.findMany);
const orderFindMany = vi.mocked(prisma.order.findMany);
const invoiceFindMany = vi.mocked(prisma.invoice.findMany);
const paymentFindMany = vi.mocked(prisma.payment.findMany);
const permissionCheck = vi.mocked(hasPermission);

const BUSINESS_A = "11111111-1111-4111-8111-111111111111";
const BRANCH_A = "22222222-2222-4222-8222-222222222222";
const USER_A = "33333333-3333-4333-8333-333333333333";

describe("globalSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    permissionCheck.mockResolvedValue(true);

    customerFindMany.mockResolvedValue([]);
    orderFindMany.mockResolvedValue([]);
    invoiceFindMany.mockResolvedValue([]);
    paymentFindMany.mockResolvedValue([]);
  });

  it("returns payment matches within the active branch and customer visibility scope", async () => {
    paymentFindMany.mockResolvedValue([
      {
        id: "payment-1",
        amount: 12500,
        method: "TRANSFER",
        status: "POSTED",
        type: "PAYMENT",
        reference: "BANK-REF-42",
        invoice: {
          invoiceNumber: "00042",
          customerName: "Ada Laundry",
        },
      },
    ] as never);

    const results = await globalSearch(
      USER_A,
      "STAFF",
      BUSINESS_A,
      BRANCH_A,
      { q: "BANK-REF-42", limit: 10 },
    );

    expect(paymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: BUSINESS_A,
          branchId: BRANCH_A,
          invoice: expect.objectContaining({
            is: expect.objectContaining({
              branchId: BRANCH_A,
            }),
          }),
          OR: expect.arrayContaining([
            expect.objectContaining({
              reference: { contains: "BANK-REF-42", mode: "insensitive" },
            }),
          ]),
        }),
      }),
    );
    expect(results).toContainEqual({
      type: "PAYMENT",
      id: "payment-1",
      title: "Payment · BANK-REF-42",
      subtitle: "Ada Laundry · Invoice #00042 · POSTED",
      href: "/payments?paymentId=payment-1",
    });
  });

  it("returns customer, matching order, and matching invoice results together", async () => {
    customerFindMany.mockResolvedValue([
      {
        id: "customer-1",
        name: "John Doe",
        phone: "08012345678",
      },
    ] as never);

    orderFindMany.mockResolvedValue([
      {
        id: "order-1",
        customerId: "customer-1",
        orderNumber: "00001",
        status: "RECEIVED",
        customer: {
          name: "John Doe",
        },
      },
    ] as never);

    invoiceFindMany.mockResolvedValue([
      {
        id: "invoice-1",
        invoiceNumber: "INV-00001",
        status: "ISSUED",
        customerName: "John Doe",
      },
    ] as never);

    const results = await globalSearch(
      USER_A,
      "STAFF",
      BUSINESS_A,
      BRANCH_A,
      {
        q: "John",
        limit: 10,
      },
    );

    expect(results).toEqual([
      {
        type: "CUSTOMER",
        id: "customer-1",
        title: "John Doe",
        subtitle: "08012345678",
        href: "/orders?customerId=customer-1&openAccount=1",
      },
      {
        type: "ORDER",
        id: "order-1",
        title: "Order #00001",
        subtitle: "John Doe · RECEIVED",
        href: "/orders?orderId=order-1",
      },
      {
        type: "INVOICE",
        id: "invoice-1",
        title: "Invoice #INV-00001",
        subtitle: "John Doe · ISSUED",
        href: "/invoices?invoiceId=invoice-1",
      },
    ]);

    expect(permissionCheck).toHaveBeenCalledTimes(4);
  });

  it("returns the customer account and matching order for customer email searches", async () => {
    customerFindMany.mockResolvedValue([
      {
        id: "customer-2",
        name: "Aaron Daniel",
        phone: "08059489393",
        email: "aaron@example.com",
        orders: [
          {
            id: "latest-order",
            orderNumber: "00005",
            status: "RECEIVED",
          },
        ],
      },
    ] as never);

    orderFindMany.mockResolvedValue([
      {
        id: "latest-order",
        customerId: "customer-2",
        orderNumber: "00005",
        status: "RECEIVED",
        customer: { name: "Aaron Daniel" },
      },
    ] as never);

    const results = await globalSearch(
      USER_A,
      "STAFF",
      BUSINESS_A,
      BRANCH_A,
      { q: "aaron@example.com", limit: 10 },
    );

    expect(customerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({ ownerBranchId: expect.anything() }),
              ]),
            }),
          ]),
          OR: expect.arrayContaining([
            expect.objectContaining({
              email: expect.objectContaining({
                contains: "aaron@example.com",
                mode: "insensitive",
              }),
            }),
          ]),
        }),
        select: expect.objectContaining({ email: true }),
      }),
    );
    expect(results).toEqual([
      {
        type: "CUSTOMER",
        id: "customer-2",
        title: "Aaron Daniel",
        subtitle: "08059489393 · aaron@example.com",
        href: "/orders?customerId=customer-2&openAccount=1",
      },
      {
        type: "ORDER",
        id: "latest-order",
        title: "Order #00005",
        subtitle: "Aaron Daniel · RECEIVED",
        href: "/orders?orderId=latest-order",
      },
    ]);
    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({
                  customer: expect.objectContaining({
                    email: expect.objectContaining({
                      contains: "aaron@example.com",
                      mode: "insensitive",
                    }),
                  }),
                }),
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it("only returns categories the user can view", async () => {
    permissionCheck.mockImplementation(
      async (_userId, _businessId, _role, permissionCode) =>
        permissionCode !== "invoices.view",
    );

    customerFindMany.mockResolvedValue([
      {
        id: "customer-1",
        name: "John Doe",
        phone: "08012345678",
      },
    ] as never);

    orderFindMany.mockResolvedValue([
      {
        id: "order-1",
        customerId: "customer-1",
        orderNumber: "00001",
        status: "RECEIVED",
        customer: {
          name: "John Doe",
        },
      },
    ] as never);

    const results = await globalSearch(
      USER_A,
      "STAFF",
      BUSINESS_A,
      BRANCH_A,
      {
        q: "John",
        limit: 10,
      },
    );

    expect(results.map((result) => result.type)).toEqual(["CUSTOMER", "ORDER"]);

    expect(invoiceFindMany).not.toHaveBeenCalled();
    expect(paymentFindMany).not.toHaveBeenCalled();
  });

  it("returns no results when the user cannot view any searchable module", async () => {
    permissionCheck.mockResolvedValue(false);

    const results = await globalSearch(
      USER_A,
      "STAFF",
      BUSINESS_A,
      BRANCH_A,
      {
        q: "John",
        limit: 10,
      },
    );

    expect(results).toEqual([]);
    expect(customerFindMany).not.toHaveBeenCalled();
    expect(orderFindMany).not.toHaveBeenCalled();
    expect(invoiceFindMany).not.toHaveBeenCalled();
    expect(paymentFindMany).not.toHaveBeenCalled();
  });

  it("searches orders and invoices within the authenticated business and branch", async () => {
    await globalSearch(
      USER_A,
      "STAFF",
      BUSINESS_A,
      BRANCH_A,
      {
        q: "00001",
        limit: 10,
      },
    );

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: BUSINESS_A,
          branchId: BRANCH_A,
        }),
      }),
    );

    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: BUSINESS_A,
          branchId: BRANCH_A,
        }),
      }),
    );

    expect(paymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: BUSINESS_A,
          branchId: BRANCH_A,
        }),
      }),
    );

    expect(customerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: BUSINESS_A,
        }),
      }),
    );
  });

  it("uses the requested result limit", async () => {
    await globalSearch(
      USER_A,
      "STAFF",
      BUSINESS_A,
      BRANCH_A,
      {
        q: "John",
        limit: 5,
      },
    );

    expect(customerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
      }),
    );

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
      }),
    );

    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
      }),
    );

    expect(paymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });

  it("trims the search query before querying", async () => {
    await globalSearch(
      USER_A,
      "STAFF",
      BUSINESS_A,
      BRANCH_A,
      {
        q: "  John  ",
        limit: 10,
      },
    );

    expect(customerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              name: expect.objectContaining({
                contains: "John",
              }),
            }),
          ]),
        }),
      }),
    );
  });
});


describe("globalSearch customer fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionCheck.mockResolvedValue(true);
    customerFindMany.mockResolvedValue([
      { id: "customer-without-orders", name: "Grace", phone: "08011111111", email: null },
    ] as never);
    orderFindMany.mockResolvedValue([]);
    invoiceFindMany.mockResolvedValue([]);
  });

  it("keeps a customer shortcut when the search has no matching existing orders", async () => {
    const results = await globalSearch(
      USER_A,
      "STAFF",
      BUSINESS_A,
      BRANCH_A,
      { q: "Grace", limit: 10 },
    );

    expect(results).toEqual([
      {
        type: "CUSTOMER",
        id: "customer-without-orders",
        title: "Grace",
        subtitle: "08011111111",
        href: "/orders?customerId=customer-without-orders&openAccount=1",
      },
    ]);
  });
});

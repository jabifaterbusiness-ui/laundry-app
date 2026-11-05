import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import { prisma } from "../../src/lib/prisma.js";
import { AppError } from "../../src/middleware/error-handler.js";
import { editOrderWithCorrection } from "../../src/modules/orders/order-corrections.service.js";

const transaction = vi.mocked(prisma.$transaction);

const BUSINESS_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BUSINESS_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const BRANCH_A = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const BRANCH_B = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const CUSTOMER_A = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const ORDER_A = "11111111-1111-4111-8111-111111111111";
const INVOICE_A = "22222222-2222-4222-8222-222222222222";
const ITEM_SHIRT = "33333333-3333-4333-8333-333333333333";
const ITEM_TROUSER = "44444444-4444-4444-8444-444444444444";
const GARMENT_1 = "55555555-5555-4555-8555-555555555555";
const GARMENT_2 = "66666666-6666-4666-8666-666666666666";
const SERVICE_SHIRT = "77777777-7777-4777-8777-777777777777";
const SERVICE_TROUSER = "88888888-8888-4888-8888-888888888888";

const NOW = new Date("2026-10-08T10:00:00.000Z");

function serviceFixture(
  id: string,
  name: string,
  pieces: number,
  unitPrice: number,
) {
  return {
    id,
    name,
    pieces,
    unitPrice,
    isActive: true,
  };
}

function garmentFixture(
  id: string,
  orderItemId: string,
  garmentNumber: number,
  status = "RECEIVED",
) {
  return {
    id,
    businessId: BUSINESS_A,
    branchId: BRANCH_A,
    orderId: ORDER_A,
    orderItemId,
    garmentNumber,
    status,
    note: null,
    receivedAt: NOW,
    readyAt: null,
    pickedUpAt: null,
    damagedAt: null,
    lostAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function invoiceItemFixture() {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    invoiceId: INVOICE_A,
    itemName: "Shirt",
    colors: ["White"],
    piecesPerUnit: 1,
    quantity: 1,
    totalPieces: 1,
    unitPrice: 3000,
    totalPrice: 3000,
    createdAt: NOW,
  };
}

function createTx() {
  return {
    branchResourceShare: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    order: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    service: {
      findMany: vi.fn(),
    },
    customerServicePrice: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    garment: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    orderItem: {
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    invoiceItem: {
      deleteMany: vi.fn(),
    },
    invoice: {
      update: vi.fn(),
    },
    invoiceHistory: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };
}

function orderFixture() {
  const item = {
    id: ITEM_SHIRT,
    orderId: ORDER_A,
    serviceId: SERVICE_SHIRT,
    serviceName: "Shirt",
    colors: ["White"],
    piecesPerUnit: 1,
    quantity: 1,
    totalPieces: 1,
    unitPrice: 3000,
    lineTotal: 3000,
    createdAt: NOW,
    updatedAt: NOW,
  };

  const invoice = {
    id: INVOICE_A,
    businessId: BUSINESS_A,
    branchId: BRANCH_A,
    orderId: ORDER_A,
    invoiceNumber: "00042",
    status: "ISSUED",
    customerName: "Jane Doe",
    companyName: "Test Laundry",
    companyPhone: null,
    companyEmail: null,
    companyWebsite: null,
    companyAddress: null,
    logoUrl: null,
    receiptPrimaryColor: null,
    receiptAccentColor: null,
    receiptBackgroundColor: null,
    receiptTextColor: null,
    receiptHeaderStyle: null,
    totalAmount: 3000,
    garmentNote: null,
    internalNote: null,
    customerAgreement: "Existing agreement",
    createdAt: NOW,
    updatedAt: NOW,
    items: [invoiceItemFixture()],
  };

  return {
    id: ORDER_A,
    businessId: BUSINESS_A,
    branchId: BRANCH_A,
    customerId: CUSTOMER_A,
    orderNumber: "82726",
    status: "RECEIVED",
    orderTotal: 3000,
    expectedReadyAt: null,
    readyAt: null,
    completedAt: null,
    cancelledAt: null,
    garmentNote: null,
    internalNote: null,
    createdAt: NOW,
    updatedAt: NOW,
    customer: {
      id: CUSTOMER_A,
      businessId: BUSINESS_A,
      name: "Jane Doe",
    },
    branch: {
      id: BRANCH_A,
      businessId: BUSINESS_A,
      name: "Main Branch",
    },
    items: [item],
    garments: [garmentFixture(GARMENT_1, ITEM_SHIRT, 1)],
    invoice,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("editOrderWithCorrection", () => {
  it("edits the existing order and synchronizes its invoice", async () => {
    const tx = createTx();
    const current = orderFixture();

    const refreshed = {
      ...current,
      orderTotal: 6000,
      items: [
        {
          ...current.items[0],
          quantity: 2,
          totalPieces: 2,
          lineTotal: 6000,
        },
      ],
      garments: [
        current.garments[0],
        garmentFixture(
          GARMENT_2,
          ITEM_SHIRT,
          2,
        ),
      ],
      invoice: {
        ...current.invoice,
        totalAmount: 6000,
        items: [
          {
            ...current.invoice.items[0],
            quantity: 2,
            totalPieces: 2,
            totalPrice: 6000,
          },
        ],
      },
    };

    tx.order.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(refreshed);

    tx.service.findMany.mockResolvedValue([
      serviceFixture(SERVICE_SHIRT, "Shirt", 1, 3000),
    ]);

    tx.orderItem.update.mockResolvedValue({
      ...current.items[0],
      quantity: 2,
      totalPieces: 2,
      lineTotal: 6000,
    });

    tx.order.update.mockResolvedValue({
      ...current,
      orderTotal: 6000,
    });

    tx.invoice.update.mockResolvedValue(
      refreshed.invoice,
    );

    tx.invoiceHistory.findFirst.mockResolvedValue(null);

    tx.invoiceHistory.create.mockResolvedValue({
      id: "history-1",
      invoiceId: INVOICE_A,
      businessId: BUSINESS_A,
      branchId: BRANCH_A,
      action: "EDITED",
      version: 1,
      reason: "Customer requested correction",
      actorUserId: "user-1",
      snapshot: {},
      expiresAt: new Date("2026-12-07T10:00:00.000Z"),
    });

    tx.garment.createMany.mockResolvedValue({
      count: 1,
    });

    transaction.mockImplementation(async (callback) =>
      callback(tx as never),
    );

    const result = await editOrderWithCorrection({
      orderId: ORDER_A,
      businessId: BUSINESS_A,
      branchId: BRANCH_A,
      actorUserId: "user-1",
      input: {
        reason: "Customer requested correction",
        confirmed: true,
        items: [
          {
            id: ITEM_SHIRT,
            serviceId: SERVICE_SHIRT,
            quantity: 2,
            colors: ["White"],
          },
        ],
      },
    });

    expect(result.order).toBe(refreshed);
    expect(result.invoice).toBe(refreshed.invoice);
    expect(result.reason).toBe(
      "Customer requested correction",
    );

    expect(tx.orderItem.update).toHaveBeenCalledWith({
      where: {
        id: ITEM_SHIRT,
      },
      data: {
        serviceId: SERVICE_SHIRT,
        serviceName: "Shirt",
        colors: ["White"],
        piecesPerUnit: 1,
        quantity: 2,
        totalPieces: 2,
        unitPrice: 3000,
        lineTotal: 6000,
      },
    });

    expect(tx.garment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          businessId: BUSINESS_A,
          branchId: BRANCH_A,
          orderId: ORDER_A,
          orderItemId: ITEM_SHIRT,
          garmentNumber: 2,
          status: "RECEIVED",
        }),
      ],
    });

    expect(tx.order.update).toHaveBeenCalledWith({
      where: {
        id: ORDER_A,
      },
      data: {
        orderTotal: 6000,
      },
    });

    expect(tx.invoiceItem.deleteMany).toHaveBeenCalledWith({
      where: {
        invoiceId: INVOICE_A,
      },
    });

    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: INVOICE_A,
        },
        data: expect.objectContaining({
          totalAmount: 6000,
          customerAgreement: "Existing agreement",
          items: {
            create: [
              {
                itemName: "Shirt",
                colors: ["White"],
                piecesPerUnit: 1,
                quantity: 2,
                totalPieces: 2,
                unitPrice: 3000,
                totalPrice: 6000,
              },
            ],
          },
        }),
      }),
    );

    expect(tx.invoiceHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: INVOICE_A,
          businessId: BUSINESS_A,
          branchId: BRANCH_A,
          action: "EDITED",
          version: 1,
          reason: "Customer requested correction",
          actorUserId: "user-1",
          snapshot: expect.objectContaining({
            id: INVOICE_A,
            invoiceNumber: "00042",
            totalAmount: 3000,
          }),
          expiresAt: expect.any(Date),
        }),
      }),
    );
  });

  it("rejects edits without confirmation or a reason", async () => {
    await expect(
      editOrderWithCorrection({
        orderId: ORDER_A,
        businessId: BUSINESS_A,
        branchId: BRANCH_A,
        actorUserId: "user-1",
        input: {
          reason: "   ",
          confirmed: true,
          items: [
            {
              id: ITEM_SHIRT,
              serviceId: SERVICE_SHIRT,
              quantity: 1,
              colors: [],
            },
          ],
        },
      }),
    ).rejects.toThrow(
      "A reason is required for this order correction",
    );

    await expect(
      editOrderWithCorrection({
        orderId: ORDER_A,
        businessId: BUSINESS_A,
        branchId: BRANCH_A,
        actorUserId: "user-1",
        input: {
          reason: "Valid correction",
          confirmed: false as true,
          items: [
            {
              id: ITEM_SHIRT,
              serviceId: SERVICE_SHIRT,
              quantity: 1,
              colors: [],
            },
          ],
        },
      }),
    ).rejects.toThrow(
      "Confirmation is required before editing an invoice",
    );

    expect(transaction).not.toHaveBeenCalled();
  });

  it("enforces business and branch isolation through the order lookup", async () => {
    const tx = createTx();

    tx.order.findFirst.mockResolvedValue(null);

    transaction.mockImplementation(async (callback) =>
      callback(tx as never),
    );

    await expect(
      editOrderWithCorrection({
        orderId: ORDER_A,
        businessId: BUSINESS_B,
        branchId: BRANCH_B,
        actorUserId: "user-b",
        input: {
          reason: "Attempted cross-tenant edit",
          confirmed: true,
          items: [
            {
              id: ITEM_SHIRT,
              serviceId: SERVICE_SHIRT,
              quantity: 1,
              colors: [],
            },
          ],
        },
      }),
    ).rejects.toThrow("Order not found");

    expect(tx.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ORDER_A,
          businessId: BUSINESS_B,
          branchId: BRANCH_B,
        },
      }),
    );

    expect(tx.service.findMany).not.toHaveBeenCalled();
    expect(tx.invoice.update).not.toHaveBeenCalled();
  });

  it("rejects removing an item whose garment history has progressed", async () => {
    const tx = createTx();
    const current = orderFixture();

    const currentItem = current.items[0];
    const currentGarment = current.garments[0];

    if (!currentItem || !currentGarment) {
      throw new Error("Test fixture is incomplete");
    }

    currentGarment.status = "READY";

    const secondItem = {
      id: ITEM_TROUSER,
      orderId: ORDER_A,
      serviceId: SERVICE_TROUSER,
      serviceName: "Trouser",
      colors: ["Black"],
      piecesPerUnit: 1,
      quantity: 1,
      totalPieces: 1,
      unitPrice: 5000,
      lineTotal: 5000,
      createdAt: NOW,
      updatedAt: NOW,
    };

    current.items.push(secondItem);

    tx.order.findFirst.mockResolvedValue(current);

    tx.service.findMany.mockResolvedValue([
      serviceFixture(SERVICE_TROUSER, "Trouser", 1, 5000),
    ]);

    transaction.mockImplementation(async (callback) =>
      callback(tx as never),
    );

    await expect(
      editOrderWithCorrection({
        orderId: ORDER_A,
        businessId: BUSINESS_A,
        branchId: BRANCH_A,
        actorUserId: "user-1",
        input: {
          reason: "Remove incorrect garment line",
          confirmed: true,
          items: [
            {
              id: ITEM_TROUSER,
              serviceId: SERVICE_TROUSER,
              quantity: 1,
              colors: ["Black"],
            },
          ],
        },
      }),
    ).rejects.toThrow(
      'Order item "Shirt" cannot be removed because garment history has already progressed',
    );

    expect(tx.garment.deleteMany).not.toHaveBeenCalled();
    expect(tx.orderItem.delete).not.toHaveBeenCalled();

    expect(tx.garment.deleteMany).not.toHaveBeenCalled();
    expect(tx.orderItem.delete).not.toHaveBeenCalled();
  });

  it("rejects reducing quantity when processed garments would be removed", async () => {
    const tx = createTx();
    const current = orderFixture();

    const currentItem = current.items[0];

    if (!currentItem) {
      throw new Error("Test fixture is incomplete");
    }

    currentItem.quantity = 2;
    currentItem.totalPieces = 2;

    current.garments = [
      garmentFixture(GARMENT_1, ITEM_SHIRT, 1, "RECEIVED"),
      garmentFixture(GARMENT_2, ITEM_SHIRT, 2, "READY"),
    ];

    tx.order.findFirst.mockResolvedValue(current);

    tx.service.findMany.mockResolvedValue([
      serviceFixture(SERVICE_SHIRT, "Shirt", 1, 3000),
    ]);

    transaction.mockImplementation(async (callback) =>
      callback(tx as never),
    );

    await expect(
      editOrderWithCorrection({
        orderId: ORDER_A,
        businessId: BUSINESS_A,
        branchId: BRANCH_A,
        actorUserId: "user-1",
        input: {
          reason: "Reduce incorrect quantity",
          confirmed: true,
          items: [
            {
              id: ITEM_SHIRT,
              serviceId: SERVICE_SHIRT,
              quantity: 1,
              colors: [],
            },
          ],
        },
      }),
    ).rejects.toThrow(
      'Quantity for "Shirt" cannot be reduced because processed garment history would be removed',
    );

    expect(tx.orderItem.update).not.toHaveBeenCalled();
    expect(tx.garment.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects inactive services", async () => {
    const tx = createTx();
    const current = orderFixture();

    tx.order.findFirst.mockResolvedValue(current);

    tx.service.findMany.mockResolvedValue([
      {
        ...serviceFixture(
          SERVICE_TROUSER,
          "Trouser",
          1,
          5000,
        ),
        isActive: false,
      },
    ]);

    transaction.mockImplementation(async (callback) =>
      callback(tx as never),
    );

    await expect(
      editOrderWithCorrection({
        orderId: ORDER_A,
        businessId: BUSINESS_A,
        branchId: BRANCH_A,
        actorUserId: "user-1",
        input: {
          reason: "Replace service",
          confirmed: true,
          items: [
            {
              serviceId: SERVICE_TROUSER,
              quantity: 1,
              colors: [],
            },
          ],
        },
      }),
    ).rejects.toThrow(
      'Service "Trouser" is inactive and cannot be added to an edited order',
    );

    expect(tx.orderItem.update).not.toHaveBeenCalled();
    expect(tx.orderItem.create).not.toHaveBeenCalled();
  });

  it("increments invoice history version", async () => {
    const tx = createTx();
    const current = orderFixture();

    const refreshed = {
      ...current,
      invoice: {
        ...current.invoice,
      },
    };

    tx.order.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(refreshed);

    tx.service.findMany.mockResolvedValue([
      serviceFixture(SERVICE_SHIRT, "Shirt", 1, 3000),
    ]);

    tx.orderItem.update.mockResolvedValue(current.items[0]);
    tx.order.update.mockResolvedValue(current);
    tx.invoiceItem.deleteMany.mockResolvedValue({ count: 1 });
    tx.invoice.update.mockResolvedValue(refreshed.invoice);

    tx.invoiceHistory.findFirst.mockResolvedValue({
      version: 7,
    });

    tx.invoiceHistory.create.mockResolvedValue({
      id: "history-8",
      version: 8,
    });

    transaction.mockImplementation(async (callback) =>
      callback(tx as never),
    );

    await editOrderWithCorrection({
      orderId: ORDER_A,
      businessId: BUSINESS_A,
      branchId: BRANCH_A,
      actorUserId: "user-1",
      input: {
        reason: "Second correction",
        confirmed: true,
        items: [
          {
            id: ITEM_SHIRT,
            serviceId: SERVICE_SHIRT,
            quantity: 1,
            colors: [],
          },
        ],
      },
    });

    expect(tx.invoiceHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 8,
        }),
      }),
    );
  });
});

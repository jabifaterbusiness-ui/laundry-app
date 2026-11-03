import { describe, expect, it, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    invoice: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import {
  createInvoice,
  createInvoiceFromOrderWithTx,
  getInvoiceForBranch,
  getInvoiceForOrder,
  listInvoices,
} from "../../src/modules/invoices/invoices.service.js";

describe("invoices.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createInvoice", () => {
    it("creates an invoice from the server-side order snapshot", async () => {
      const invoiceCreate = vi.fn().mockResolvedValue({
        id: "invoice-1",
        invoiceNumber: "00042",
        orderId: "order-1",
        totalAmount: 12500,
        items: [
          {
            itemName: "Complete Agbada",
            piecesPerUnit: 3,
            quantity: 2,
            totalPieces: 6,
            unitPrice: 4500,
            totalPrice: 9000,
          },
        ],
      });

      const tx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: "order-1",
            orderNumber: "00042",
            orderTotal: 12500,
            garmentNote: "Handle white shirt carefully",
            internalNote: "Staff-only note",
            customer: {
              id: "customer-1",
              name: "John Customer",
            },
            branch: {
              id: "branch-1",
              name: "Main Branch",
            },
            business: {
              id: "business-1",
              name: "Clean Laundry",
              phone: "08000000000",
              email: "info@example.com",
              website: "https://example.com",
              address: "123 Main Street",
              logoUrl: "https://example.com/logo.png",
              receiptPrimaryColor: "#123456",
              receiptAccentColor: "#abcdef",
              receiptBackgroundColor: "#f8f8f8",
              receiptTextColor: "#222222",
              receiptHeaderStyle: "modern",
            },
            items: [
              {
                id: "order-item-1",
                serviceName: "Complete Agbada",
                piecesPerUnit: 3,
                quantity: 2,
                totalPieces: 6,
                unitPrice: 4500,
                lineTotal: 9000,
              },
              {
                id: "order-item-2",
                serviceName: "Shirt",
                piecesPerUnit: 1,
                quantity: 1,
                totalPieces: 1,
                unitPrice: 3500,
                lineTotal: 3500,
              },
            ],
            invoice: null,
          }),
          update: vi.fn().mockResolvedValue({}),
        },
                invoice: {
          create: invoiceCreate,
        },
      };

      prismaMock.$transaction.mockImplementation(
        async (callback: (tx: any) => unknown) => callback(tx),
      );

      const result = await createInvoice({
        businessId: "business-1",
        branchId: "branch-1",
        orderId: "order-1",
        customerAgreement: "Items left beyond 30 days may attract storage charges.",
      });

      expect(result).toEqual({
        id: "invoice-1",
        invoiceNumber: "00042",
        orderId: "order-1",
        totalAmount: 12500,
        items: [
          {
            itemName: "Complete Agbada",
            piecesPerUnit: 3,
            quantity: 2,
            totalPieces: 6,
            unitPrice: 4500,
            totalPrice: 9000,
          },
        ],
      });

      expect(invoiceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            invoiceNumber: "00042",
            status: "ISSUED",
            customerName: "John Customer",
            companyName: "Clean Laundry",
            companyPhone: "08000000000",
            companyEmail: "info@example.com",
            companyWebsite: "https://example.com",
            companyAddress: "123 Main Street",
            logoUrl: "https://example.com/logo.png",
            receiptPrimaryColor: "#123456",
            receiptAccentColor: "#abcdef",
            receiptBackgroundColor: "#f8f8f8",
            receiptTextColor: "#222222",
            receiptHeaderStyle: "modern",
            totalAmount: 12500,
            garmentNote: "Handle white shirt carefully",
            internalNote: "Staff-only note",
            customerAgreement:
              "Items left beyond 30 days may attract storage charges.",
            items: {
              create: [
                {
                  itemName: "Complete Agbada",
                  piecesPerUnit: 3,
                  quantity: 2,
                  totalPieces: 6,
                  unitPrice: 4500,
                  totalPrice: 9000,
                },
                {
                  itemName: "Shirt",
                  piecesPerUnit: 1,
                  quantity: 1,
                  totalPieces: 1,
                  unitPrice: 3500,
                  totalPrice: 3500,
                },
              ],
            },
          }),
          include: expect.any(Object),
        }),
      );
    });

    it("rejects an order outside the authenticated business/branch", async () => {
      const findFirst = vi.fn().mockResolvedValue(null);

      const tx = {
        order: {
          findFirst,
        },
        invoice: {
          create: vi.fn(),
        },
      };

      prismaMock.$transaction.mockImplementation(
        async (callback: (tx: any) => unknown) => callback(tx),
      );

      await expect(
        createInvoice({
          businessId: "business-1",
          branchId: "branch-1",
          orderId: "other-order",
          customerAgreement: "Agreement",
        }),
      ).rejects.toMatchObject({
        message: "Order not found",
        statusCode: 404,
      });

      expect(findFirst).toHaveBeenCalledWith({
        where: {
          id: "other-order",
          businessId: "business-1",
          branchId: "branch-1",
        },
        include: {
          customer: true,
          branch: true,
          items: true,
          business: true,
          invoice: true,
        },
      });
    });

    it("rejects duplicate invoice creation for the same order", async () => {
      const tx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: "order-1",
            orderNumber: "00042",
            orderTotal: 5000,
            customer: { id: "customer-1", name: "John" },
            branch: { id: "branch-1", name: "Main" },
            business: {
              id: "business-1",
              name: "Clean Laundry",
              phone: null,
              email: null,
              website: null,
              address: null,
            },
            items: [
              {
                serviceName: "Shirt",
                piecesPerUnit: 1,
                quantity: 1,
                totalPieces: 1,
                unitPrice: 5000,
                lineTotal: 5000,
              },
            ],
            invoice: {
              id: "existing-invoice",
            },
          }),
        },
        invoice: {
          create: vi.fn(),
        },
      };

      prismaMock.$transaction.mockImplementation(
        async (callback: (tx: any) => unknown) => callback(tx),
      );

      await expect(
        createInvoice({
          businessId: "business-1",
          branchId: "branch-1",
          orderId: "order-1",
          customerAgreement: "Agreement",
        }),
      ).rejects.toMatchObject({
        message: "An invoice already exists for this order",
        statusCode: 409,
      });

      expect(tx.invoice.create).not.toHaveBeenCalled();
    });

    it("rejects an order with no items", async () => {
      const tx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: "order-1",
            orderNumber: "00042",
            orderTotal: 0,
            customer: { id: "customer-1", name: "John" },
            branch: { id: "branch-1", name: "Main" },
            business: {
              id: "business-1",
              name: "Clean Laundry",
              phone: null,
              email: null,
              website: null,
              address: null,
            },
            items: [],
            invoice: null,
          }),
        },
        invoice: {
          create: vi.fn(),
        },
      };

      prismaMock.$transaction.mockImplementation(
        async (callback: (tx: any) => unknown) => callback(tx),
      );

      await expect(
        createInvoice({
          businessId: "business-1",
          branchId: "branch-1",
          orderId: "order-1",
          customerAgreement: "Agreement",
        }),
      ).rejects.toMatchObject({
        message: "An invoice cannot be created for an order with no items",
        statusCode: 422,
      });
    });
  });

  describe("createInvoiceFromOrderWithTx", () => {
    it("updates the order total to match the invoice total", async () => {
      const invoice = {
        id: "invoice-2",
        invoiceNumber: "00043",
        totalAmount: 9000,
      };
      const orderUpdate = vi.fn().mockResolvedValue({});
      const automaticDiscount = {
        id: "all-customer-discount",
        name: "Launch promotion",
        percentage: -10,
        targetScope: "ALL_CUSTOMERS",
        customer: null,
        group: null,
        excludedServiceIds: [],
        allowStacking: false,
        isActive: true,
        startsAt: null,
        endsAt: null,
      };
      const tx = {
        customerGroupMember: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        priceAdjustment: {
          findMany: vi.fn().mockResolvedValue([automaticDiscount]),
        },
        taxRule: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        order: {
          update: orderUpdate,
        },
        invoice: {
          create: vi.fn().mockResolvedValue(invoice),
        },
      };

      const result = await createInvoiceFromOrderWithTx(
        tx as never,
        {
          id: "order-2",
          orderNumber: "00043",
          orderTotal: 10000,
          branchId: "branch-1",
          customerId: "customer-1",
          garmentNote: null,
          internalNote: null,
          customer: { id: "customer-1", name: "Jane Customer" },
          branch: { id: "branch-1", name: "Main Branch" },
          items: [{
            id: "item-1",
            serviceName: "Shirt",
            piecesPerUnit: 1,
            quantity: 2,
            totalPieces: 2,
            unitPrice: 5000,
            lineTotal: 10000,
          }],
        } as never,
        {
          id: "business-1",
          name: "Clean Laundry",
          phone: null,
          email: null,
          website: null,
          address: null,
          logoUrl: null,
          receiptPrimaryColor: null,
          receiptAccentColor: null,
          receiptBackgroundColor: null,
          receiptTextColor: null,
          receiptHeaderStyle: null,
        },
        "Customer agreement",
      );

      expect(result).toBe(invoice);
      expect(tx.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subtotal: 10000,
            adjustmentTotal: -1000,
            totalAmount: 9000,
          }),
        }),
      );
      expect(orderUpdate).toHaveBeenCalledWith({
        where: { id: "order-2" },
        data: { orderTotal: 9000 },
      });
    });
  });

  describe("getInvoiceForBranch", () => {
    it("uses business and branch scope", async () => {
      const invoice = { id: "invoice-1" };
      prismaMock.invoice.findFirst.mockResolvedValue(invoice);

      const result = await getInvoiceForBranch(
        "invoice-1",
        "business-1",
        "branch-1",
      );

      expect(result).toBe(invoice);
      expect(prismaMock.invoice.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "invoice-1",
            businessId: "business-1",
            branchId: "branch-1",
          },
        }),
      );
    });
  });

  describe("getInvoiceForOrder", () => {
    it("uses business, branch and order scope", async () => {
      const invoice = { id: "invoice-1" };
      prismaMock.invoice.findFirst.mockResolvedValue(invoice);

      const result = await getInvoiceForOrder(
        "order-1",
        "business-1",
        "branch-1",
      );

      expect(result).toBe(invoice);
      expect(prismaMock.invoice.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            orderId: "order-1",
            businessId: "business-1",
            branchId: "branch-1",
          },
        }),
      );
    });
  });

  describe("listInvoices", () => {
    it("lists invoices only from the authenticated business and branch", async () => {
      const invoices = [{ id: "invoice-1" }];

      prismaMock.invoice.findMany.mockResolvedValue(invoices);
      prismaMock.invoice.count.mockResolvedValue(1);

      const result = await listInvoices({
        businessId: "business-1",
        branchId: "branch-1",
        page: 1,
        pageSize: 20,
      });

      expect(result).toEqual({
        data: invoices,
        pagination: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      });

      expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            businessId: "business-1",
            branchId: "branch-1",
          },
        }),
      );

      expect(prismaMock.invoice.count).toHaveBeenCalledWith({
        where: {
          businessId: "business-1",
          branchId: "branch-1",
        },
      });
    });
  });
});

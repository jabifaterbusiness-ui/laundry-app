import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    payment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    invoice: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import {
  createPayment,
  getInvoicePaymentSummary,
  getPaymentForBranch,
  listPayments,
} from "../../src/modules/payments/payments.service.js";

const INVOICE_A = "88888888-8888-8888-8888-888888888888";

function mockTransaction() {
  prismaMock.$transaction.mockImplementation(
    async (callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction();
});

describe("payments.service", () => {
  describe("createPayment", () => {
    it("creates a payment against an outstanding invoice", async () => {
      prismaMock.invoice.findFirst.mockResolvedValue({
        id: INVOICE_A,
        businessId: "biz-A",
        branchId: "branch-A",
        totalAmount: 10000,
        status: "ISSUED",
        payments: [
          { amount: 3000 },
        ],
      });

      const payment = {
        id: "payment-1",
        businessId: "biz-A",
        branchId: "branch-A",
        invoiceId: INVOICE_A,
        amount: 4000,
        method: "TRANSFER",
        status: "POSTED",
      };

      prismaMock.payment.create.mockResolvedValue(payment);

      const result = await createPayment({
        businessId: "biz-A",
        branchId: "branch-A",
        invoiceId: INVOICE_A,
        amount: 4000,
        method: "TRANSFER",
        reference: "TRX-123",
        note: "Customer transfer",
      });

      expect(result).toBe(payment);

      expect(prismaMock.invoice.findFirst).toHaveBeenCalledWith({
        where: {
          id: INVOICE_A,
          businessId: "biz-A",
          branchId: "branch-A",
        },
        include: {
          payments: {
            where: {
              status: "POSTED",
            },
            select: {
              amount: true,
            },
          },
        },
      });

      expect(prismaMock.payment.create).toHaveBeenCalledWith({
        data: {
          businessId: "biz-A",
          branchId: "branch-A",
          invoiceId: INVOICE_A,
          amount: 4000,
          method: "TRANSFER",
          reference: "TRX-123",
          note: "Customer transfer",
        },
      });
    });

    it("rejects an invoice outside the authenticated business and branch", async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(null);

      await expect(
        createPayment({
          businessId: "biz-A",
          branchId: "branch-A",
          invoiceId: INVOICE_A,
          amount: 5000,
          method: "CASH",
        }),
      ).rejects.toMatchObject({
        message: "Invoice not found",
        statusCode: 404,
      });

      expect(prismaMock.payment.create).not.toHaveBeenCalled();
    });

    it("rejects payments against a void invoice", async () => {
      prismaMock.invoice.findFirst.mockResolvedValue({
        id: INVOICE_A,
        businessId: "biz-A",
        branchId: "branch-A",
        totalAmount: 10000,
        status: "VOID",
        payments: [],
      });

      await expect(
        createPayment({
          businessId: "biz-A",
          branchId: "branch-A",
          invoiceId: INVOICE_A,
          amount: 5000,
          method: "CASH",
        }),
      ).rejects.toMatchObject({
        message: "Payments cannot be recorded against a void invoice",
        statusCode: 422,
      });

      expect(prismaMock.payment.create).not.toHaveBeenCalled();
    });

    it("rejects a payment when the invoice is already fully paid", async () => {
      prismaMock.invoice.findFirst.mockResolvedValue({
        id: INVOICE_A,
        businessId: "biz-A",
        branchId: "branch-A",
        totalAmount: 10000,
        status: "ISSUED",
        payments: [
          { amount: 6000 },
          { amount: 4000 },
        ],
      });

      await expect(
        createPayment({
          businessId: "biz-A",
          branchId: "branch-A",
          invoiceId: INVOICE_A,
          amount: 1,
          method: "CASH",
        }),
      ).rejects.toMatchObject({
        message: "This invoice has already been fully paid",
        statusCode: 422,
      });

      expect(prismaMock.payment.create).not.toHaveBeenCalled();
    });

    it("rejects a payment greater than the outstanding balance", async () => {
      prismaMock.invoice.findFirst.mockResolvedValue({
        id: INVOICE_A,
        businessId: "biz-A",
        branchId: "branch-A",
        totalAmount: 10000,
        status: "ISSUED",
        payments: [
          { amount: 7000 },
        ],
      });

      await expect(
        createPayment({
          businessId: "biz-A",
          branchId: "branch-A",
          invoiceId: INVOICE_A,
          amount: 3001,
          method: "POS",
        }),
      ).rejects.toMatchObject({
        message:
          "Payment amount cannot exceed the outstanding balance of 3000",
        statusCode: 422,
      });

      expect(prismaMock.payment.create).not.toHaveBeenCalled();
    });

    it("allows a payment that exactly clears the outstanding balance", async () => {
      prismaMock.invoice.findFirst.mockResolvedValue({
        id: INVOICE_A,
        businessId: "biz-A",
        branchId: "branch-A",
        totalAmount: 10000,
        status: "ISSUED",
        payments: [
          { amount: 7000 },
        ],
      });

      prismaMock.payment.create.mockResolvedValue({
        id: "payment-2",
        amount: 3000,
        method: "CASH",
        status: "POSTED",
      });

      await createPayment({
        businessId: "biz-A",
        branchId: "branch-A",
        invoiceId: INVOICE_A,
        amount: 3000,
        method: "CASH",
      });

      expect(prismaMock.payment.create).toHaveBeenCalled();
    });

    it("supports multiple partial payments", async () => {
      prismaMock.invoice.findFirst.mockResolvedValue({
        id: INVOICE_A,
        businessId: "biz-A",
        branchId: "branch-A",
        totalAmount: 20000,
        status: "ISSUED",
        payments: [
          { amount: 5000 },
          { amount: 4000 },
        ],
      });

      prismaMock.payment.create.mockResolvedValue({
        id: "payment-3",
        amount: 6000,
        method: "TRANSFER",
        status: "POSTED",
      });

      await createPayment({
        businessId: "biz-A",
        branchId: "branch-A",
        invoiceId: INVOICE_A,
        amount: 6000,
        method: "TRANSFER",
      });

      expect(prismaMock.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          invoiceId: INVOICE_A,
          amount: 6000,
          method: "TRANSFER",
        }),
      });
    });
  });

  describe("getPaymentForBranch", () => {
    it("uses business and branch scope", async () => {
      const payment = { id: "payment-1" };
      prismaMock.payment.findFirst.mockResolvedValue(payment);

      const result = await getPaymentForBranch(
        "payment-1",
        "biz-A",
        "branch-A",
      );

      expect(result).toBe(payment);

      expect(prismaMock.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "payment-1",
            businessId: "biz-A",
            branchId: "branch-A",
          },
        }),
      );
    });
  });

  describe("listPayments", () => {
    it("lists only payments from the authenticated business and branch", async () => {
      const payments = [{ id: "payment-1" }];

      prismaMock.payment.findMany.mockResolvedValue(payments);
      prismaMock.payment.count.mockResolvedValue(1);

      const result = await listPayments({
        businessId: "biz-A",
        branchId: "branch-A",
        page: 1,
        pageSize: 25,
      });

      expect(result).toEqual({
        data: payments,
        pagination: {
          page: 1,
          pageSize: 25,
          total: 1,
          totalPages: 1,
        },
      });

      expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            businessId: "biz-A",
            branchId: "branch-A",
          },
          skip: 0,
          take: 25,
        }),
      );

      expect(prismaMock.payment.count).toHaveBeenCalledWith({
        where: {
          businessId: "biz-A",
          branchId: "branch-A",
        },
      });
    });

    it("passes invoice and status filters safely", async () => {
      prismaMock.payment.findMany.mockResolvedValue([]);
      prismaMock.payment.count.mockResolvedValue(0);

      await listPayments({
        businessId: "biz-A",
        branchId: "branch-A",
        invoiceId: INVOICE_A,
        status: "VOID",
        page: 2,
        pageSize: 10,
      });

      expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            businessId: "biz-A",
            branchId: "branch-A",
            invoiceId: INVOICE_A,
            status: "VOID",
          },
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe("getInvoicePaymentSummary", () => {
    it("calculates unpaid status correctly", async () => {
      prismaMock.invoice.findFirst.mockResolvedValue({
        id: INVOICE_A,
        invoiceNumber: "00042",
        totalAmount: 10000,
        payments: [],
      });

      const result = await getInvoicePaymentSummary(
        INVOICE_A,
        "biz-A",
        "branch-A",
      );

      expect(result.amountPaid).toBe(0);
      expect(result.balance).toBe(10000);
      expect(result.paymentStatus).toBe("UNPAID");
    });

    it("calculates partially paid status correctly", async () => {
      prismaMock.invoice.findFirst.mockResolvedValue({
        id: INVOICE_A,
        invoiceNumber: "00042",
        totalAmount: 10000,
        payments: [
          {
            amount: 3000,
            status: "POSTED",
          },
        ],
      });

      const result = await getInvoicePaymentSummary(
        INVOICE_A,
        "biz-A",
        "branch-A",
      );

      expect(result.amountPaid).toBe(3000);
      expect(result.balance).toBe(7000);
      expect(result.paymentStatus).toBe("PARTIALLY_PAID");
    });

    it("calculates paid status correctly", async () => {
      prismaMock.invoice.findFirst.mockResolvedValue({
        id: INVOICE_A,
        invoiceNumber: "00042",
        totalAmount: 10000,
        payments: [
          {
            amount: 6000,
            status: "POSTED",
          },
          {
            amount: 4000,
            status: "POSTED",
          },
        ],
      });

      const result = await getInvoicePaymentSummary(
        INVOICE_A,
        "biz-A",
        "branch-A",
      );

      expect(result.amountPaid).toBe(10000);
      expect(result.balance).toBe(0);
      expect(result.paymentStatus).toBe("PAID");
    });

    it("does not count VOID payments toward the balance", async () => {
      prismaMock.invoice.findFirst.mockResolvedValue({
        id: INVOICE_A,
        invoiceNumber: "00042",
        totalAmount: 10000,
        payments: [
          {
            amount: 6000,
            status: "POSTED",
          },
          {
            amount: 3000,
            status: "VOID",
          },
        ],
      });

      const result = await getInvoicePaymentSummary(
        INVOICE_A,
        "biz-A",
        "branch-A",
      );

      expect(result.amountPaid).toBe(6000);
      expect(result.balance).toBe(4000);
      expect(result.paymentStatus).toBe("PARTIALLY_PAID");
    });

    it("rejects an invoice outside the authenticated business and branch", async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(null);

      await expect(
        getInvoicePaymentSummary(
          INVOICE_A,
          "biz-B",
          "branch-B",
        ),
      ).rejects.toMatchObject({
        message: "Invoice not found",
        statusCode: 404,
      });

      expect(prismaMock.invoice.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: INVOICE_A,
            businessId: "biz-B",
            branchId: "branch-B",
          },
        }),
      );
    });
  });
});

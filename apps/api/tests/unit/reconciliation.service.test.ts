import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    invoice: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

import { reconcileInvoice } from "../../src/modules/payments/reconciliation.service.js";

const INVOICE_A = "88888888-8888-8888-8888-888888888888";

const BASE_INVOICE = {
  id: INVOICE_A,
  invoiceNumber: "INV-00001",
  status: "ISSUED",
  totalAmount: 10000,
  businessId: "biz-A",
  branchId: "branch-A",
  payments: [],
};

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: "payment-A",
    businessId: "biz-A",
    branchId: "branch-A",
    invoiceId: INVOICE_A,
    amount: 10000,
    type: "PAYMENT",
    status: "POSTED",
    refundOfPaymentId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reconciliation.service", () => {
  it("reconciles a healthy unpaid invoice", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(BASE_INVOICE);

    const result = await reconcileInvoice({
      invoiceId: INVOICE_A,
      businessId: "biz-A",
      branchId: "branch-A",
    });

    expect(result.reconciled).toBe(true);
    expect(result.issueCount).toBe(0);
    expect(result.totalAmount).toBe(10000);
    expect(result.amountPaid).toBe(0);
    expect(result.balance).toBe(10000);
    expect(result.paymentStatus).toBe("UNPAID");
  });

  it("reconciles a fully paid invoice", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({
      ...BASE_INVOICE,
      payments: [payment()],
    });

    const result = await reconcileInvoice({
      invoiceId: INVOICE_A,
      businessId: "biz-A",
      branchId: "branch-A",
    });

    expect(result.reconciled).toBe(true);
    expect(result.amountPaid).toBe(10000);
    expect(result.balance).toBe(0);
    expect(result.paymentStatus).toBe("PAID");
  });

  it("calculates posted refunds against the original payment", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({
      ...BASE_INVOICE,
      payments: [
        payment({ id: "payment-A", amount: 10000 }),
        payment({
          id: "refund-A",
          amount: 2500,
          type: "REFUND",
          refundOfPaymentId: "payment-A",
        }),
      ],
    });

    const result = await reconcileInvoice({
      invoiceId: INVOICE_A,
      businessId: "biz-A",
      branchId: "branch-A",
    });

    expect(result.reconciled).toBe(true);
    expect(result.amountPaid).toBe(7500);
    expect(result.balance).toBe(2500);
    expect(result.paymentStatus).toBe("PARTIALLY_PAID");
  });

  it("enforces business and branch scope", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(BASE_INVOICE);

    await reconcileInvoice({
      invoiceId: INVOICE_A,
      businessId: "biz-A",
      branchId: "branch-A",
    });

    expect(prismaMock.invoice.findFirst).toHaveBeenCalledWith({
      where: {
        id: INVOICE_A,
        businessId: "biz-A",
        branchId: "branch-A",
      },
      include: {
        payments: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  });

  it("rejects an invoice outside the authenticated business or branch", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(null);

    await expect(
      reconcileInvoice({
        invoiceId: INVOICE_A,
        businessId: "biz-B",
        branchId: "branch-B",
      }),
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

  it("detects a refund without an original payment", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({
      ...BASE_INVOICE,
      payments: [
        payment({
          id: "refund-A",
          amount: 2500,
          type: "REFUND",
          refundOfPaymentId: null,
        }),
      ],
    });

    const result = await reconcileInvoice({
      invoiceId: INVOICE_A,
      businessId: "biz-A",
      branchId: "branch-A",
    });

    expect(result.reconciled).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "REFUND_WITHOUT_ORIGINAL",
          paymentId: "refund-A",
        }),
      ]),
    );
  });

  it("detects a refund targeting a non-payment row", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({
      ...BASE_INVOICE,
      payments: [
        payment({
          id: "refund-target",
          amount: 10000,
          type: "REFUND",
          refundOfPaymentId: "refund-source",
        }),
        payment({
          id: "refund-source",
          amount: 10000,
          type: "REFUND",
          refundOfPaymentId: null,
        }),
      ],
    });

    const result = await reconcileInvoice({
      invoiceId: INVOICE_A,
      businessId: "biz-A",
      branchId: "branch-A",
    });

    expect(result.reconciled).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "REFUND_TARGET_NOT_PAYMENT",
          paymentId: "refund-target",
        }),
      ]),
    );
  });

  it("detects refunds that exceed the original payment", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({
      ...BASE_INVOICE,
      payments: [
        payment({ id: "payment-A", amount: 5000 }),
        payment({
          id: "refund-A",
          amount: 6000,
          type: "REFUND",
          refundOfPaymentId: "payment-A",
        }),
      ],
    });

    const result = await reconcileInvoice({
      invoiceId: INVOICE_A,
      businessId: "biz-A",
      branchId: "branch-A",
    });

    expect(result.reconciled).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "REFUND_EXCEEDS_ORIGINAL",
          paymentId: "payment-A",
        }),
      ]),
    );
  });

  it("detects posted payments exceeding the invoice total", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({
      ...BASE_INVOICE,
      payments: [payment({ amount: 12000 })],
    });

    const result = await reconcileInvoice({
      invoiceId: INVOICE_A,
      businessId: "biz-A",
      branchId: "branch-A",
    });

    expect(result.reconciled).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "PAYMENTS_EXCEED_INVOICE",
        }),
      ]),
    );
  });

  it("detects a void invoice with a posted ledger", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({
      ...BASE_INVOICE,
      status: "VOID",
      payments: [payment({ amount: 5000 })],
    });

    const result = await reconcileInvoice({
      invoiceId: INVOICE_A,
      businessId: "biz-A",
      branchId: "branch-A",
    });

    expect(result.reconciled).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOID_INVOICE_HAS_POSTED_LEDGER",
        }),
      ]),
    );
  });

  it("detects non-positive payment amounts", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({
      ...BASE_INVOICE,
      payments: [payment({ amount: 0 })],
    });

    const result = await reconcileInvoice({
      invoiceId: INVOICE_A,
      businessId: "biz-A",
      branchId: "branch-A",
    });

    expect(result.reconciled).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "NON_POSITIVE_PAYMENT",
          paymentId: "payment-A",
        }),
      ]),
    );
  });

  it("does not mutate the payment or invoice ledger", async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({
      ...BASE_INVOICE,
      payments: [payment()],
    });

    await reconcileInvoice({
      invoiceId: INVOICE_A,
      businessId: "biz-A",
      branchId: "branch-A",
    });

    expect(prismaMock.invoice.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock).not.toHaveProperty("payment");
  });
});

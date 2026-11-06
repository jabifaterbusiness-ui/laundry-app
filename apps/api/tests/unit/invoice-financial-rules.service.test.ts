import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { $transaction: vi.fn() },
}));

vi.mock("../../src/lib/prisma.js", () => ({ prisma: prismaMock }));

import { updateInvoiceFinancialRules } from "../../src/modules/invoices/invoice-financial-rules.service.js";

type InvoiceFixture = {
  id: string;
  businessId: string;
  branchId: string;
  status: string;
  invoiceNumber: string;
  subtotal: number;
  adjustedSubtotal: number;
  adjustmentTotal: number;
  additiveTaxTotal: number;
  withholdingTaxTotal: number;
  totalAmount: number;
  appliedAdjustments: Array<Record<string, unknown>>;
  appliedTaxes: Array<Record<string, unknown>>;
  items: Array<{ id: string; totalPrice: number; createdAt: Date }>;
  payments: Array<{ amount: number; type: string }>;
  order: { id: string };
};

const baseInvoice: InvoiceFixture = {
  id: "invoice-1",
  businessId: "business-1",
  branchId: "branch-1",
  status: "ISSUED",
  invoiceNumber: "INV-0001",
  subtotal: 1000,
  adjustedSubtotal: 1000,
  adjustmentTotal: 0,
  additiveTaxTotal: 0,
  withholdingTaxTotal: 0,
  totalAmount: 1000,
  appliedAdjustments: [],
  appliedTaxes: [],
  items: [{ id: "item-1", totalPrice: 1000, createdAt: new Date("2026-09-01T00:00:00.000Z") }],
  payments: [],
  order: { id: "order-1" },
};

function setup(input?: {
  invoice?: InvoiceFixture;
  adjustments?: Array<Record<string, unknown>>;
  taxes?: Array<Record<string, unknown>>;
}) {
  const invoice = input?.invoice ?? baseInvoice;
  const tx = {
    branchResourceShare: { findMany: vi.fn().mockResolvedValue([]) },
    invoice: {
      findFirst: vi.fn().mockResolvedValue(invoice),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...invoice,
        ...data,
      })),
    },
    priceAdjustment: { findMany: vi.fn().mockResolvedValue(input?.adjustments ?? []) },
    taxRule: { findMany: vi.fn().mockResolvedValue(input?.taxes ?? []) },
    invoiceHistory: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "history-1" }),
    },
    order: { update: vi.fn().mockResolvedValue({ id: "order-1" }) },
  };
  prismaMock.$transaction.mockImplementation(
    async (callback: (transaction: never) => Promise<unknown>) => callback(tx as never),
  );
  return tx;
}

const baseInput = {
  invoiceId: "invoice-1",
  businessId: "business-1",
  branchId: "branch-1",
  actorUserId: "user-1",
  reason: "Correct the invoice pricing",
  adjustments: [] as Array<{ adjustmentId: string; scope: "INVOICE" | "ITEMS"; itemIndexes?: number[] }>,
  taxRuleIds: [] as string[],
};

describe("updateInvoiceFinancialRules branch and discount scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a new automatic customer discount from manual invoice correction", async () => {
    setup({
      adjustments: [{
        id: "automatic-discount",
        name: "VIP discount",
        percentage: -10,
        targetScope: "CUSTOMER",
        isActive: true,
      }],
    });

    await expect(updateInvoiceFinancialRules({
      ...baseInput,
      adjustments: [{ adjustmentId: "automatic-discount", scope: "INVOICE" }],
    })).rejects.toMatchObject({
      message: "Automatic customer and group discounts cannot be added manually; they are applied automatically when eligible",
      statusCode: 422,
    });
  });

  it("does not allow an adjustment owned by another branch unless shared", async () => {
    const tx = setup();

    await expect(updateInvoiceFinancialRules({
      ...baseInput,
      adjustments: [{ adjustmentId: "other-branch-discount", scope: "INVOICE" }],
    })).rejects.toMatchObject({
      message: "One or more selected adjustments are unavailable in this branch",
      statusCode: 422,
    });

    expect(tx.priceAdjustment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        businessId: "business-1",
        id: { in: ["other-branch-discount"] },
        AND: [{
          OR: [
            { branchId: null },
            { branchId: { in: ["branch-1"] } },
            { id: { in: [] } },
          ],
        }],
      }),
    }));
  });

  it("allows an automatic discount already recorded on the invoice to be retained", async () => {
    const invoice = {
      ...baseInvoice,
      appliedAdjustments: [{
        id: "automatic-discount",
        name: "VIP discount",
        percentage: -10,
        amount: -100,
        scope: "INVOICE",
      }],
    };
    const tx = setup({
      invoice,
      adjustments: [{
        id: "automatic-discount",
        name: "VIP discount",
        percentage: -10,
        targetScope: "CUSTOMER",
        isActive: false,
      }],
    });

    const result = await updateInvoiceFinancialRules({
      ...baseInput,
      adjustments: [{ adjustmentId: "automatic-discount", scope: "INVOICE" }],
    });

    expect(result.after.totalAmount).toBe(900);
    expect(tx.invoice.update).toHaveBeenCalled();
    expect(tx.invoiceHistory.create).toHaveBeenCalled();
  });

  it("keeps an existing applied adjustment from its invoice snapshot if its rule was retired", async () => {
    const invoice = {
      ...baseInvoice,
      appliedAdjustments: [{
        id: "retired-adjustment",
        name: "Old promotion",
        percentage: -5,
        amount: -50,
        scope: "INVOICE",
      }],
    };
    const tx = setup({ invoice });

    const result = await updateInvoiceFinancialRules({
      ...baseInput,
      adjustments: [{ adjustmentId: "retired-adjustment", scope: "INVOICE" }],
    });

    expect(result.after.totalAmount).toBe(950);
    expect(tx.invoice.update).toHaveBeenCalled();
  });
});

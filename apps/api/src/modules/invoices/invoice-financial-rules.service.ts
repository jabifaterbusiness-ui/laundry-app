import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { calculateInvoice } from "./invoice-calculator.js";

export async function updateInvoiceFinancialRules(input: {
  invoiceId: string; businessId: string; branchId: string; actorUserId: string;
  reason: string;
  adjustments: Array<{ adjustmentId: string; scope: "INVOICE" | "ITEMS"; itemIndexes?: number[] }>;
  taxRuleIds: string[];
}) {
  const reason = input.reason.trim();
  if (!reason) throw new AppError("A reason is required for this financial correction", 422);
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: input.invoiceId, businessId: input.businessId, branchId: input.branchId },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        payments: { where: { status: "POSTED" }, select: { amount: true, type: true } },
        order: { select: { id: true } },
      },
    });
    if (!invoice) throw new AppError("Invoice not found", 404);
    if (invoice.status === "VOID") throw new AppError("A void invoice cannot be repriced", 422);

    const adjustmentIds = [...new Set(input.adjustments.map((rule) => rule.adjustmentId))];
    const taxIds = [...new Set(input.taxRuleIds)];
    const [adjustmentRules, taxRules] = await Promise.all([
      adjustmentIds.length ? tx.priceAdjustment.findMany({ where: { businessId: input.businessId, id: { in: adjustmentIds }, isActive: true } }) : [],
      taxIds.length ? tx.taxRule.findMany({ where: { businessId: input.businessId, id: { in: taxIds }, isActive: true } }) : [],
    ]);
    if (adjustmentRules.length !== adjustmentIds.length) throw new AppError("One or more selected adjustments are unavailable", 422);
    if (taxRules.length !== taxIds.length) throw new AppError("One or more selected taxes are unavailable", 422);
    const adjustmentMap = new Map(adjustmentRules.map((rule) => [rule.id, rule]));
    const adjustments = input.adjustments.map((selection) => {
      const rule = adjustmentMap.get(selection.adjustmentId)!;
      const itemIds = (selection.itemIndexes ?? []).map((index) => {
        if (!Number.isInteger(index) || index < 0 || index >= invoice.items.length) throw new AppError("A selected adjustment contains an invalid invoice item", 422);
        return invoice.items[index]!.id;
      });
      if (selection.scope === "ITEMS" && itemIds.length === 0) throw new AppError("Select at least one invoice item for this adjustment", 422);
      return { id: rule.id, name: rule.name, percentage: rule.percentage, scope: selection.scope, itemIds };
    });
    const calculation = calculateInvoice(
      invoice.items.map((item) => ({ id: item.id, amount: item.totalPrice })),
      adjustments,
      taxRules.map((rule) => ({
        id: rule.id, name: rule.name,
        kind: rule.kind as "PERCENTAGE" | "FIXED", value: rule.value,
        treatment: rule.treatment as "ADDITIVE" | "WITHHOLDING",
        enabled: true, allowWithOtherTaxes: rule.allowWithOtherTaxes,
      })),
    );
    const amountPaid = invoice.payments.reduce((sum, payment) =>
      sum + (payment.type === "REFUND" ? -payment.amount : payment.amount), 0);
    if (amountPaid > calculation.totalAmount) {
      throw new AppError(
        `The revised invoice total (${calculation.totalAmount}) is below the amount already paid (${amountPaid}). Record an appropriate refund or account credit before applying this change.`,
        422,
      );
    }

    const previousSnapshot = {
      invoiceNumber: invoice.invoiceNumber,
      subtotal: invoice.subtotal, adjustedSubtotal: invoice.adjustedSubtotal,
      adjustmentTotal: invoice.adjustmentTotal, additiveTaxTotal: invoice.additiveTaxTotal,
      withholdingTaxTotal: invoice.withholdingTaxTotal, appliedAdjustments: invoice.appliedAdjustments,
      appliedTaxes: invoice.appliedTaxes, totalAmount: invoice.totalAmount,
      items: invoice.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    };
    const latest = await tx.invoiceHistory.findFirst({
      where: { invoiceId: invoice.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const now = new Date();
    const history = await tx.invoiceHistory.create({
      data: {
        invoiceId: invoice.id, businessId: input.businessId, branchId: input.branchId,
        action: "FINANCIAL_RULES_UPDATED", version: (latest?.version ?? 0) + 1,
        reason, actorUserId: input.actorUserId, snapshot: previousSnapshot,
        expiresAt: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
      },
    });
    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        subtotal: calculation.subtotal, adjustedSubtotal: calculation.adjustedSubtotal,
        adjustmentTotal: calculation.adjustmentTotal, additiveTaxTotal: calculation.additiveTaxTotal,
        withholdingTaxTotal: calculation.withholdingTaxTotal,
        appliedAdjustments: calculation.adjustments as unknown as Prisma.InputJsonValue, appliedTaxes: calculation.taxes as unknown as Prisma.InputJsonValue,
        totalAmount: calculation.totalAmount,
      },
      include: { items: true, payments: true },
    });
    await tx.order.update({ where: { id: invoice.order.id }, data: { orderTotal: calculation.totalAmount } });
    return { invoice: updated, history, reason, before: previousSnapshot, after: {
      subtotal: calculation.subtotal, adjustedSubtotal: calculation.adjustedSubtotal,
      adjustmentTotal: calculation.adjustmentTotal, additiveTaxTotal: calculation.additiveTaxTotal,
      withholdingTaxTotal: calculation.withholdingTaxTotal,
      appliedAdjustments: calculation.adjustments, appliedTaxes: calculation.taxes,
      totalAmount: calculation.totalAmount,
    } };
  });
}

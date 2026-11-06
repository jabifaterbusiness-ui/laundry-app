import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { getBranchResourceScope } from "../branches/branch-resource-scope.service.js";
import { calculateInvoice, type TaxRule } from "./invoice-calculator.js";

type JsonRecord = Record<string, unknown>;

function jsonRecords(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is JsonRecord =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
}

function snapshotMap(value: unknown): Map<string, JsonRecord> {
  return new Map(
    jsonRecords(value)
      .filter((entry): entry is JsonRecord & { id: string } => typeof entry.id === "string")
      .map((entry) => [entry.id, entry]),
  );
}

function branchScopeFilter(ownerBranchIds: string[], resourceIds: string[]) {
  return {
    OR: [
      { branchId: null },
      { branchId: { in: ownerBranchIds } },
      { id: { in: resourceIds } },
    ],
  };
}

export async function updateInvoiceFinancialRules(input: {
  invoiceId: string;
  businessId: string;
  branchId: string;
  actorUserId: string;
  reason: string;
  adjustments: Array<{
    adjustmentId: string;
    scope: "INVOICE" | "ITEMS";
    itemIndexes?: number[];
  }>;
  taxRuleIds: string[];
}) {
  const reason = input.reason.trim();
  if (!reason) throw new AppError("A reason is required for this financial correction", 422);

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: {
        id: input.invoiceId,
        businessId: input.businessId,
        branchId: input.branchId,
      },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        payments: { where: { status: "POSTED" }, select: { amount: true, type: true } },
        order: { select: { id: true } },
      },
    });
    if (!invoice) throw new AppError("Invoice not found", 404);
    if (invoice.status === "VOID") throw new AppError("A void invoice cannot be repriced", 422);

    const existingAdjustmentSnapshots = snapshotMap(invoice.appliedAdjustments);
    const existingTaxSnapshots = snapshotMap(invoice.appliedTaxes);
    const existingAdjustmentIds = new Set(existingAdjustmentSnapshots.keys());
    const existingTaxIds = new Set(existingTaxSnapshots.keys());
    const adjustmentIds = [...new Set(input.adjustments.map((rule) => rule.adjustmentId))];
    const taxIds = [...new Set(input.taxRuleIds)];

    if (adjustmentIds.length !== input.adjustments.length || taxIds.length !== input.taxRuleIds.length) {
      throw new AppError("Duplicate financial rule selections are not allowed", 422);
    }

    const [discountScope, taxScope] = await Promise.all([
      getBranchResourceScope({
        businessId: input.businessId,
        branchId: input.branchId,
        userId: input.actorUserId,
        resourceType: "DISCOUNTS",
      }, tx),
      getBranchResourceScope({
        businessId: input.businessId,
        branchId: input.branchId,
        userId: input.actorUserId,
        resourceType: "TAX_RULES",
      }, tx),
    ]);

    const [adjustmentRules, taxRules] = await Promise.all([
      adjustmentIds.length
        ? tx.priceAdjustment.findMany({
            where: {
              businessId: input.businessId,
              id: { in: adjustmentIds },
              AND: [branchScopeFilter(discountScope.ownerBranchIds, discountScope.resourceIds)],
            },
          })
        : [],
      taxIds.length
        ? tx.taxRule.findMany({
            where: {
              businessId: input.businessId,
              id: { in: taxIds },
              AND: [branchScopeFilter(taxScope.ownerBranchIds, taxScope.resourceIds)],
            },
          })
        : [],
    ]);

    const adjustmentMap = new Map(adjustmentRules.map((rule) => [rule.id, rule]));
    const adjustments = input.adjustments.map((selection) => {
      const rule = adjustmentMap.get(selection.adjustmentId);
      const snapshot = existingAdjustmentSnapshots.get(selection.adjustmentId);

      if (!rule && !snapshot) {
        throw new AppError("One or more selected adjustments are unavailable in this branch", 422);
      }
      if (rule && rule.targetScope !== "MANUAL" && !existingAdjustmentIds.has(rule.id)) {
        throw new AppError(
          "Automatic customer and group discounts cannot be added manually; they are applied automatically when eligible",
          422,
        );
      }
      if (rule && !rule.isActive && !existingAdjustmentIds.has(rule.id)) {
        throw new AppError("One or more selected adjustments are unavailable", 422);
      }

      const name = rule?.name ?? snapshot?.name;
      const percentage = rule?.percentage ?? snapshot?.percentage;
      if (typeof name !== "string" || typeof percentage !== "number") {
        throw new AppError("An existing adjustment snapshot is incomplete and cannot be recalculated", 422);
      }

      const itemIds = (selection.itemIndexes ?? []).map((index) => {
        if (!Number.isInteger(index) || index < 0 || index >= invoice.items.length) {
          throw new AppError("A selected adjustment contains an invalid invoice item", 422);
        }
        return invoice.items[index]!.id;
      });
      if (selection.scope === "ITEMS" && itemIds.length === 0) {
        throw new AppError("Select at least one invoice item for this adjustment", 422);
      }

      return {
        id: selection.adjustmentId,
        name,
        percentage,
        scope: selection.scope,
        itemIds,
      };
    });

    const taxRuleMap = new Map(taxRules.map((rule) => [rule.id, rule]));
    const calculationTaxes: TaxRule[] = taxIds.map((id) => {
      const rule = taxRuleMap.get(id);
      const snapshot = existingTaxSnapshots.get(id);
      if (!rule && !snapshot) {
        throw new AppError("One or more selected taxes are unavailable in this branch", 422);
      }
      if (rule && !rule.isActive && !existingTaxIds.has(id)) {
        throw new AppError("One or more selected taxes are unavailable", 422);
      }

      // Keep the immutable invoice snapshot for rules already applied to
      // this invoice; only newly selected rules use their current definition.
      const name = snapshot?.name ?? rule?.name;
      const kind = snapshot?.kind ?? rule?.kind;
      const value = snapshot?.value ?? rule?.value;
      const treatment = snapshot?.treatment ?? rule?.treatment;
      if (
        typeof name !== "string" ||
        (kind !== "PERCENTAGE" && kind !== "FIXED") ||
        typeof value !== "number" ||
        (treatment !== "ADDITIVE" && treatment !== "WITHHOLDING")
      ) {
        throw new AppError("An existing tax snapshot is incomplete and cannot be recalculated", 422);
      }

      const normalizedKind = kind as "PERCENTAGE" | "FIXED";
      const normalizedTreatment = treatment as "ADDITIVE" | "WITHHOLDING";
      return {
        id,
        name,
        kind: normalizedKind,
        value,
        treatment: normalizedTreatment,
        enabled: true,
        // A previously applied tax combination was already accepted. Its
        // immutable invoice snapshot remains valid if the rule was retired.
        allowWithOtherTaxes: existingTaxIds.has(id) ? true : rule?.allowWithOtherTaxes ?? true,
      };
    });

    const calculation = calculateInvoice(
      invoice.items.map((item) => ({ id: item.id, amount: item.totalPrice })),
      adjustments,
      calculationTaxes,
    );
    const amountPaid = invoice.payments.reduce(
      (sum, payment) => sum + (payment.type === "REFUND" ? -payment.amount : payment.amount),
      0,
    );
    if (amountPaid > calculation.totalAmount) {
      throw new AppError(
        `The revised invoice total (${calculation.totalAmount}) is below the amount already paid (${amountPaid}). Record an appropriate refund or account credit before applying this change.`,
        422,
      );
    }

    const previousSnapshot = {
      invoiceNumber: invoice.invoiceNumber,
      subtotal: invoice.subtotal,
      adjustedSubtotal: invoice.adjustedSubtotal,
      adjustmentTotal: invoice.adjustmentTotal,
      additiveTaxTotal: invoice.additiveTaxTotal,
      withholdingTaxTotal: invoice.withholdingTaxTotal,
      appliedAdjustments: invoice.appliedAdjustments,
      appliedTaxes: invoice.appliedTaxes,
      totalAmount: invoice.totalAmount,
      items: invoice.items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
    };
    const latest = await tx.invoiceHistory.findFirst({
      where: { invoiceId: invoice.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const now = new Date();
    const history = await tx.invoiceHistory.create({
      data: {
        invoiceId: invoice.id,
        businessId: input.businessId,
        branchId: input.branchId,
        action: "FINANCIAL_RULES_UPDATED",
        version: (latest?.version ?? 0) + 1,
        reason,
        actorUserId: input.actorUserId,
        snapshot: previousSnapshot,
        expiresAt: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
      },
    });
    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        subtotal: calculation.subtotal,
        adjustedSubtotal: calculation.adjustedSubtotal,
        adjustmentTotal: calculation.adjustmentTotal,
        additiveTaxTotal: calculation.additiveTaxTotal,
        withholdingTaxTotal: calculation.withholdingTaxTotal,
        appliedAdjustments: calculation.adjustments as unknown as Prisma.InputJsonValue,
        appliedTaxes: calculation.taxes as unknown as Prisma.InputJsonValue,
        totalAmount: calculation.totalAmount,
      },
      include: { items: true, payments: true },
    });
    await tx.order.update({
      where: { id: invoice.order.id },
      data: { orderTotal: calculation.totalAmount },
    });

    return {
      invoice: updated,
      history,
      reason,
      before: previousSnapshot,
      after: {
        subtotal: calculation.subtotal,
        adjustedSubtotal: calculation.adjustedSubtotal,
        adjustmentTotal: calculation.adjustmentTotal,
        additiveTaxTotal: calculation.additiveTaxTotal,
        withholdingTaxTotal: calculation.withholdingTaxTotal,
        appliedAdjustments: calculation.adjustments,
        appliedTaxes: calculation.taxes,
        totalAmount: calculation.totalAmount,
      },
    };
  });
}

import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

export async function listPricingRules(businessId: string) {
  const [adjustments, taxes] = await Promise.all([
    prisma.priceAdjustment.findMany({ where: { businessId }, orderBy: { name: "asc" } }),
    prisma.taxRule.findMany({ where: { businessId }, orderBy: { name: "asc" } }),
  ]);
  return { adjustments, taxes };
}

export async function createPriceAdjustment(input: { businessId: string; name: string; percentage: number }) {
  if (!Number.isFinite(input.percentage) || input.percentage < -100 || input.percentage > 1000) {
    throw new AppError("Adjustment percentage must be between -100 and 1000", 422);
  }
  try {
    return await prisma.priceAdjustment.create({ data: input });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new AppError("An adjustment with this name already exists", 409);
    }
    throw error;
  }
}

export async function deletePriceAdjustment(id: string, businessId: string) {
  const result = await prisma.priceAdjustment.deleteMany({ where: { id, businessId } });
  if (!result.count) throw new AppError("Price adjustment not found", 404);
}

export async function createTaxRule(input: {
  businessId: string; name: string; kind: "PERCENTAGE" | "FIXED"; value: number;
  treatment: "ADDITIVE" | "WITHHOLDING"; enabledByDefault: boolean; allowWithOtherTaxes: boolean;
}) {
  if (!Number.isFinite(input.value) || input.value < 0 || (input.kind === "PERCENTAGE" && input.value > 1000)) {
    throw new AppError("Tax value is invalid", 422);
  }
  try {
    return await prisma.taxRule.create({ data: input });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new AppError("A tax with this name already exists", 409);
    }
    throw error;
  }
}

export async function deleteTaxRule(id: string, businessId: string) {
  const result = await prisma.taxRule.deleteMany({ where: { id, businessId } });
  if (!result.count) throw new AppError("Tax rule not found", 404);
}

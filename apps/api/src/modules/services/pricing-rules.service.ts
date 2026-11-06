import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { assertBranchResourceWriteAccess, getBranchResourceScope } from "../branches/branch-resource-scope.service.js";

export async function listPricingRules(
  businessId: string,
  branchId: string,
  userId: string,
  customerId?: string,
) {
  const [discountScope, taxScope] = await Promise.all([
    getBranchResourceScope({ businessId, branchId, userId, resourceType: "DISCOUNTS" }),
    getBranchResourceScope({ businessId, branchId, userId, resourceType: "TAX_RULES" }),
  ]);

  let applicableGroupIds: string[] = [];
  if (customerId) {
    const customerScope = await getBranchResourceScope({
      businessId,
      branchId,
      userId,
      resourceType: "CUSTOMERS",
    });
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        businessId,
        OR: [
          { ownerBranchId: null },
          { ownerBranchId: { in: customerScope.ownerBranchIds } },
          { id: { in: customerScope.resourceIds } },
        ],
      },
      select: { id: true },
    });
    if (!customer) throw new AppError("Customer not found", 404);

    const memberships = await prisma.customerGroupMember.findMany({
      where: { businessId, customerId },
      select: { groupId: true },
    });
    applicableGroupIds = memberships.map((membership) => membership.groupId);
  }

  const now = new Date();
  const applicableTargets = [
    { targetScope: "MANUAL" },
    ...(customerId
      ? [
          { targetScope: "CUSTOMER", customerId },
          ...(applicableGroupIds.length
            ? [{ targetScope: "GROUP", groupId: { in: applicableGroupIds } }]
            : []),
          { targetScope: "ALL_CUSTOMERS" },
        ]
      : []),
  ];

  const [adjustments, taxes] = await Promise.all([
    prisma.priceAdjustment.findMany({
      where: {
        businessId,
        isActive: true,
        OR: [
          { branchId: null },
          { branchId: { in: discountScope.ownerBranchIds } },
          { id: { in: discountScope.resourceIds } },
        ],
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          { OR: applicableTargets },
        ],
      },
      include: {
        customer: { select: { id: true, name: true } },
        group: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.taxRule.findMany({
      where: {
        businessId,
        isActive: true,
        OR: [
          { branchId: null },
          { branchId: { in: taxScope.ownerBranchIds } },
          { id: { in: taxScope.resourceIds } },
        ],
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return { adjustments, taxes };
}

export async function createPriceAdjustment(input: {
  businessId: string;
  branchId: string;
  userId: string;
  name: string;
  percentage: number;
  targetScope?: "MANUAL" | "CUSTOMER" | "GROUP" | "ALL_CUSTOMERS";
  customerId?: string;
  groupId?: string;
  startsAt?: string;
  endsAt?: string;
  allowStacking?: boolean;
  excludedServiceIds?: string[];
}) {
  const targetScope = input.targetScope ?? "MANUAL";
  const customerScope = await getBranchResourceScope({ businessId: input.businessId, branchId: input.branchId, userId: input.userId, resourceType: "CUSTOMERS" });
  const serviceScope = await getBranchResourceScope({ businessId: input.businessId, branchId: input.branchId, userId: input.userId, resourceType: "SERVICES" });
  if (!Number.isFinite(input.percentage) || input.percentage < -100 || input.percentage > 1000) {
    throw new AppError("Adjustment percentage must be between -100 and 1000", 422);
  }
  if (targetScope !== "MANUAL" && input.percentage >= 0) {
    throw new AppError("Automatic customer discounts must be a negative percentage", 422);
  }
  if (targetScope === "CUSTOMER" && !input.customerId) {
    throw new AppError("Choose a customer for an individual discount", 422);
  }
  if (targetScope === "GROUP" && !input.groupId) {
    throw new AppError("Choose a customer group for this discount", 422);
  }
  if (targetScope !== "CUSTOMER" && input.customerId) {
    throw new AppError("A customer can only be selected for an individual discount", 422);
  }
  if (targetScope !== "GROUP" && input.groupId) {
    throw new AppError("A group can only be selected for a group discount", 422);
  }
  if (targetScope === "ALL_CUSTOMERS" && (!input.startsAt || !input.endsAt)) {
    throw new AppError("Promotions for all customers require a start and end date", 422);
  }
  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime())) ||
      (startsAt && endsAt && endsAt <= startsAt)) {
    throw new AppError("The discount end date must be after its start date", 422);
  }
  const excludedServiceIds = [...new Set(input.excludedServiceIds ?? [])];
  const [customer, group, services] = await Promise.all([
    input.customerId
      ? prisma.customer.findFirst({ where: { id: input.customerId, businessId: input.businessId, OR: [{ ownerBranchId: null }, { ownerBranchId: { in: customerScope.ownerBranchIds } }, { id: { in: customerScope.resourceIds } }] }, select: { id: true } })
      : Promise.resolve(null),
    input.groupId
      ? prisma.customerGroup.findFirst({ where: { id: input.groupId, businessId: input.businessId }, select: { id: true } })
      : Promise.resolve(null),
    excludedServiceIds.length
      ? prisma.service.findMany({ where: { businessId: input.businessId, id: { in: excludedServiceIds }, OR: [{ ownerBranchId: null }, { ownerBranchId: { in: serviceScope.ownerBranchIds } }, { id: { in: serviceScope.resourceIds } }] }, select: { id: true } })
      : Promise.resolve([]),
  ]);
  if (input.customerId && !customer) throw new AppError("Selected customer is unavailable", 404);
  if (input.groupId && !group) throw new AppError("Selected customer group is unavailable", 404);
  if (services.length !== excludedServiceIds.length) throw new AppError("One or more excluded services are unavailable", 422);
  try {
    return await prisma.priceAdjustment.create({
      data: {
        businessId: input.businessId,
        branchId: input.branchId,
        name: input.name,
        percentage: input.percentage,
        targetScope,
        customerId: input.customerId ?? null,
        groupId: input.groupId ?? null,
        startsAt,
        endsAt,
        allowStacking: input.allowStacking ?? false,
        excludedServiceIds,
      },
      include: { customer: { select: { id: true, name: true } }, group: { select: { id: true, name: true } } },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new AppError("An adjustment with this name already exists", 409);
    }
    throw error;
  }
}

export async function setPriceAdjustmentActive(id: string, businessId: string, branchId: string, userId: string, isActive: boolean) {
  const scope = await getBranchResourceScope({ businessId, branchId, userId, resourceType: "DISCOUNTS" });
  const existing = await prisma.priceAdjustment.findFirst({ where: { id, businessId, OR: [{ branchId: null }, { branchId: { in: scope.ownerBranchIds } }, { id: { in: scope.resourceIds } }] } });
  if (!existing) throw new AppError("Price adjustment not found", 404);
  await assertBranchResourceWriteAccess({ businessId, branchId, userId, resourceType: "DISCOUNTS", ownerBranchId: existing.branchId, resourceId: id });
  const result = await prisma.priceAdjustment.updateMany({
    where: { id, businessId, branchId: existing.branchId },
    data: { isActive },
  });
  if (!result.count) throw new AppError("Price adjustment not found", 404);
  return prisma.priceAdjustment.findFirst({
    where: { id, businessId, branchId: existing.branchId },
    include: { customer: { select: { id: true, name: true } }, group: { select: { id: true, name: true } } },
  });
}

export async function deletePriceAdjustment(id: string, businessId: string, branchId: string, userId: string) {
  const scope = await getBranchResourceScope({ businessId, branchId, userId, resourceType: "DISCOUNTS" });
  const existing = await prisma.priceAdjustment.findFirst({ where: { id, businessId, OR: [{ branchId: null }, { branchId: { in: scope.ownerBranchIds } }, { id: { in: scope.resourceIds } }] } });
  if (!existing) throw new AppError("Price adjustment not found", 404);
  await assertBranchResourceWriteAccess({ businessId, branchId, userId, resourceType: "DISCOUNTS", ownerBranchId: existing.branchId, resourceId: id });
  const result = await prisma.priceAdjustment.deleteMany({ where: { id, businessId, branchId: existing.branchId } });
  if (!result.count) throw new AppError("Price adjustment not found", 404);
}

export async function createTaxRule(input: {
  businessId: string; branchId: string; name: string; kind: "PERCENTAGE" | "FIXED"; value: number;
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

export async function deleteTaxRule(id: string, businessId: string, branchId: string, userId: string) {
  const scope = await getBranchResourceScope({ businessId, branchId, userId, resourceType: "TAX_RULES" });
  const existing = await prisma.taxRule.findFirst({ where: { id, businessId, OR: [{ branchId: null }, { branchId: { in: scope.ownerBranchIds } }, { id: { in: scope.resourceIds } }] } });
  if (!existing) throw new AppError("Tax rule not found", 404);
  await assertBranchResourceWriteAccess({ businessId, branchId, userId, resourceType: "TAX_RULES", ownerBranchId: existing.branchId, resourceId: id });
  const result = await prisma.taxRule.deleteMany({ where: { id, businessId, branchId: existing.branchId } });
  if (!result.count) throw new AppError("Tax rule not found", 404);
}

import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { assertBranchResourceWriteAccess, getBranchResourceScope } from "../branches/branch-resource-scope.service.js";

export async function listCustomerServicePrices(businessId: string, branchId: string, userId: string, customerId: string) {
  const [scope, customerScope] = await Promise.all([
    getBranchResourceScope({ businessId, branchId, userId, resourceType: "CUSTOMER_PRICING" }),
    getBranchResourceScope({ businessId, branchId, userId, resourceType: "CUSTOMERS" }),
  ]);
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
    select: { id: true, ownerBranchId: true },
  });
  if (!customer) throw new AppError("Customer not found", 404);
  return prisma.customerServicePrice.findMany({
    where: { businessId, customerId, OR: [{ branchId: null }, { branchId: { in: scope.ownerBranchIds } }, { id: { in: scope.resourceIds } }] },
    include: {
      service: { select: { id: true, name: true, pieces: true, unitPrice: true, isActive: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { service: { name: "asc" } },
  });
}

export async function setCustomerServicePrice(input: { businessId: string; branchId: string; userId: string; customerId: string; serviceId: string; unitPrice: number }) {
  const [customerScope, serviceScope] = await Promise.all([
    getBranchResourceScope({ businessId: input.businessId, branchId: input.branchId, userId: input.userId, resourceType: "CUSTOMERS" }),
    getBranchResourceScope({ businessId: input.businessId, branchId: input.branchId, userId: input.userId, resourceType: "SERVICES" }),
  ]);
  const [customer, service] = await Promise.all([
    prisma.customer.findFirst({
      where: {
        id: input.customerId,
        businessId: input.businessId,
        OR: [
          { ownerBranchId: null },
          { ownerBranchId: { in: customerScope.ownerBranchIds } },
          { id: { in: customerScope.resourceIds } },
        ],
      },
      select: { id: true, ownerBranchId: true },
    }),
    prisma.service.findFirst({
      where: {
        id: input.serviceId,
        businessId: input.businessId,
        OR: [
          { ownerBranchId: null },
          { ownerBranchId: { in: serviceScope.ownerBranchIds } },
          { id: { in: serviceScope.resourceIds } },
        ],
      },
      select: { id: true, ownerBranchId: true },
    }),
  ]);
  if (!customer) throw new AppError("Customer not found", 404);
  if (!service) throw new AppError("Service not found", 404);
  await assertBranchResourceWriteAccess({
    businessId: input.businessId,
    branchId: input.branchId,
    userId: input.userId,
    resourceType: "CUSTOMERS",
    ownerBranchId: customer.ownerBranchId,
    resourceId: customer.id,
  });
  await assertBranchResourceWriteAccess({
    businessId: input.businessId,
    branchId: input.branchId,
    userId: input.userId,
    resourceType: "SERVICES",
    ownerBranchId: service.ownerBranchId,
    resourceId: service.id,
  });
  if (!Number.isSafeInteger(input.unitPrice) || input.unitPrice < 0) throw new AppError("Customer price must be a non-negative whole-naira amount", 422);
  return prisma.customerServicePrice.upsert({
    where: { customerId_serviceId_branchId: { customerId: input.customerId, serviceId: input.serviceId, branchId: input.branchId } },
    create: {
      businessId: input.businessId,
      branchId: input.branchId,
      customerId: input.customerId,
      serviceId: input.serviceId,
      unitPrice: input.unitPrice,
    },
    update: { unitPrice: input.unitPrice },
    include: {
      service: { select: { id: true, name: true, pieces: true, unitPrice: true } },
      branch: { select: { id: true, name: true } },
    },
  });
}

export async function removeCustomerServicePrice(id: string, businessId: string, branchId: string, userId: string) {
  const scope = await getBranchResourceScope({ businessId, branchId, userId, resourceType: "CUSTOMER_PRICING" });
  const existing = await prisma.customerServicePrice.findFirst({ where: { id, businessId, OR: [{ branchId: null }, { branchId: { in: scope.ownerBranchIds } }, { id: { in: scope.resourceIds } }] } });
  if (!existing) throw new AppError("Customer-specific service price not found", 404);
  await assertBranchResourceWriteAccess({ businessId, branchId, userId, resourceType: "CUSTOMER_PRICING", ownerBranchId: existing.branchId, resourceId: id });
  const result = await prisma.customerServicePrice.deleteMany({ where: { id, businessId, branchId: existing.branchId } });
  if (!result.count) throw new AppError("Customer-specific service price not found", 404);
}

import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

export async function listCustomerServicePrices(businessId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, businessId }, select: { id: true } });
  if (!customer) throw new AppError("Customer not found", 404);
  return prisma.customerServicePrice.findMany({
    where: { businessId, customerId },
    include: { service: { select: { id: true, name: true, pieces: true, unitPrice: true, isActive: true } } },
    orderBy: { service: { name: "asc" } },
  });
}

export async function setCustomerServicePrice(input: { businessId: string; customerId: string; serviceId: string; unitPrice: number }) {
  const [customer, service] = await Promise.all([
    prisma.customer.findFirst({ where: { id: input.customerId, businessId: input.businessId }, select: { id: true } }),
    prisma.service.findFirst({ where: { id: input.serviceId, businessId: input.businessId }, select: { id: true } }),
  ]);
  if (!customer) throw new AppError("Customer not found", 404);
  if (!service) throw new AppError("Service not found", 404);
  if (!Number.isSafeInteger(input.unitPrice) || input.unitPrice < 0) throw new AppError("Customer price must be a non-negative whole-naira amount", 422);
  return prisma.customerServicePrice.upsert({
    where: { customerId_serviceId: { customerId: input.customerId, serviceId: input.serviceId } },
    create: input,
    update: { unitPrice: input.unitPrice },
    include: { service: { select: { id: true, name: true, pieces: true, unitPrice: true } } },
  });
}

export async function removeCustomerServicePrice(id: string, businessId: string) {
  const result = await prisma.customerServicePrice.deleteMany({ where: { id, businessId } });
  if (!result.count) throw new AppError("Customer-specific service price not found", 404);
}

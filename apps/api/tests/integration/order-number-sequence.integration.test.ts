import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma.js";
import { createUniqueOrderNumber } from "../../src/modules/orders/orders.service.js";

describe("order number allocation against PostgreSQL", () => {
  const slug = `order-sequence-${randomUUID()}`;
  let businessId: string | null = null;
  let branchId: string | null = null;
  let customerId: string | null = null;

  afterAll(async () => {
    if (!businessId) return;
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.orderNumberSequence.deleteMany({ where: { businessId } });
    if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    if (branchId) await prisma.branch.deleteMany({ where: { id: branchId } });
    await prisma.business.delete({ where: { id: businessId } });
  });

  it("reconciles a stale counter and serializes concurrent allocations per business", async () => {
    const business = await prisma.business.create({
      data: { name: "Order Sequence Integration Test", slug },
      select: { id: true },
    });
    businessId = business.id;

    const branch = await prisma.branch.create({
      data: { businessId, name: "Integration Branch" },
      select: { id: true },
    });
    branchId = branch.id;

    const customer = await prisma.customer.create({
      data: { businessId, name: "Integration Customer", phone: "+2348000000000" },
      select: { id: true },
    });
    customerId = customer.id;

    await prisma.order.createMany({
      data: Array.from({ length: 27 }, (_, index) => ({
        businessId: businessId!,
        branchId: branchId!,
        customerId: customerId!,
        orderNumber: String(index + 1).padStart(5, "0"),
      })),
    });
    await prisma.orderNumberSequence.create({
      data: { businessId, nextNumber: 9 },
    });

    const allocated = await Promise.all(
      Array.from({ length: 8 }, () =>
        prisma.$transaction(async (tx) => {
          const orderNumber = await createUniqueOrderNumber(tx, businessId!);
          await tx.order.create({
            data: {
              businessId: businessId!,
              branchId: branchId!,
              customerId: customerId!,
              orderNumber,
            },
          });
          return orderNumber;
        }),
      ),
    );

    expect([...allocated].sort()).toEqual([
      "00028", "00029", "00030", "00031",
      "00032", "00033", "00034", "00035",
    ]);

    const finalSequence = await prisma.orderNumberSequence.findUniqueOrThrow({
      where: { businessId },
      select: { nextNumber: true },
    });
    expect(finalSequence.nextNumber).toBe(36);

    const orders = await prisma.order.findMany({
      where: { businessId },
      select: { orderNumber: true },
      orderBy: { orderNumber: "asc" },
    });
    expect(orders).toHaveLength(35);
    expect(new Set(orders.map((order) => order.orderNumber)).size).toBe(35);
  });
});

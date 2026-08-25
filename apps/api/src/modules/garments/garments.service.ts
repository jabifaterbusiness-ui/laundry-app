import type { GarmentStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

export interface ListGarmentsParams {
  businessId: string;
  branchId: string;
  orderId?: string;
  orderItemId?: string;
  status?: GarmentStatus;
  page: number;
  pageSize: number;
}

export async function createGarmentsForOrder(
  orderId: string,
  businessId: string,
  branchId: string,
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: {
        id: orderId,
        businessId,
        branchId,
      },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    const existing = await tx.garment.findMany({
      where: {
        orderId,
        businessId,
        branchId,
      },
      select: {
        orderItemId: true,
        garmentNumber: true,
      },
    });

    const existingKeys = new Set(
      existing.map(
        (g) => `${g.orderItemId}:${g.garmentNumber}`,
      ),
    );

    const creates: Prisma.GarmentCreateManyInput[] = [];

    for (const item of order.items) {
      for (let number = 1; number <= item.totalPieces; number += 1) {
        const key = `${item.id}:${number}`;

        if (existingKeys.has(key)) {
          continue;
        }

        creates.push({
          businessId,
          branchId,
          orderId: order.id,
          orderItemId: item.id,
          garmentNumber: number,
          status: "RECEIVED",
        });
      }
    }

    if (creates.length > 0) {
      await tx.garment.createMany({
        data: creates,
      });
    }

    return tx.garment.findMany({
      where: {
        orderId,
        businessId,
        branchId,
      },
      include: {
        orderItem: true,
      },
      orderBy: [
        { orderItemId: "asc" },
        { garmentNumber: "asc" },
      ],
    });
  });
}

export async function listGarments(params: ListGarmentsParams) {
  const {
    businessId,
    branchId,
    orderId,
    orderItemId,
    status,
    page,
    pageSize,
  } = params;

  const where: Prisma.GarmentWhereInput = {
    businessId,
    branchId,
    ...(orderId ? { orderId } : {}),
    ...(orderItemId ? { orderItemId } : {}),
    ...(status ? { status } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.garment.findMany({
      where,
      include: {
        orderItem: true,
      },
      orderBy: [
        { createdAt: "desc" },
        { garmentNumber: "asc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.garment.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export async function getGarmentForBusiness(
  id: string,
  businessId: string,
  branchId: string,
) {
  return prisma.garment.findFirst({
    where: {
      id,
      businessId,
      branchId,
    },
    include: {
      orderItem: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          customerId: true,
          status: true,
        },
      },
    },
  });
}

export async function updateGarmentStatus(
  id: string,
  businessId: string,
  branchId: string,
  status: GarmentStatus,
  note?: string,
) {
  const existing = await prisma.garment.findFirst({
    where: {
      id,
      businessId,
      branchId,
    },
  });

  if (!existing) {
    throw new AppError("Garment not found", 404);
  }

  const now = new Date();

  const data: Prisma.GarmentUpdateInput = {
    status,
  };

  if (note !== undefined) {
    data.note = note;
  }

  if (status === "READY") {
    data.readyAt = now;
  }

  if (status === "PICKED_UP") {
    data.pickedUpAt = now;
  }

  if (status === "DAMAGED") {
    data.damagedAt = now;
  }

  if (status === "LOST") {
    data.lostAt = now;
  }

  return prisma.garment.update({
    where: { id },
    data,
    include: {
      orderItem: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          customerId: true,
          status: true,
        },
      },
    },
  });
}

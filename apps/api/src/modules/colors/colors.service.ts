import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

export const DEFAULT_COLORS = [
  "Black",
  "White",
  "Red",
  "Blue",
  "Green",
  "Yellow",
  "Orange",
  "Purple",
  "Pink",
  "Brown",
  "Grey",
  "Navy Blue",
  "Sky Blue",
  "Royal Blue",
  "Cream",
  "Beige",
  "Wine",
  "Burgundy",
  "Maroon",
  "Gold",
  "Silver",
  "Khaki",
  "Peach",
  "Turquoise",
  "Teal",
  "Violet",
];

export async function ensureDefaultColors(
  businessId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  await db.color.createMany({
    data: DEFAULT_COLORS.map((name) => ({
      businessId,
      name,
      isActive: true,
    })),
    skipDuplicates: true,
  });
}

export async function listColors(params: {
  businessId: string;
  status: "active" | "inactive" | "all";
  search?: string;
}) {
  await ensureDefaultColors(params.businessId);

  const where: Prisma.ColorWhereInput = {
    businessId: params.businessId,
  };

  if (params.status !== "all") {
    where.isActive = params.status === "active";
  }

  if (params.search) {
    where.name = {
      contains: params.search,
      mode: "insensitive",
    };
  }

  return prisma.color.findMany({
    where,
    orderBy: { name: "asc" },
  });
}

export async function createColor(businessId: string, name: string) {
  const existing = await prisma.color.findFirst({
    where: {
      businessId,
      name: { equals: name, mode: "insensitive" },
    },
  });

  if (existing) {
    throw new AppError("Colour already exists", 409);
  }

  return prisma.color.create({
    data: { businessId, name },
  });
}

export async function updateColor(
  id: string,
  businessId: string,
  name: string,
) {
  const existing = await prisma.color.findFirst({
    where: {
      businessId,
      name: { equals: name, mode: "insensitive" },
      NOT: { id },
    },
  });

  if (existing) {
    throw new AppError("Colour already exists", 409);
  }

  const result = await prisma.color.updateMany({
    where: { id, businessId },
    data: { name },
  });

  if (result.count === 0) {
    throw new AppError("Colour not found", 404);
  }

  return prisma.color.findFirst({
    where: { id, businessId },
  });
}

export async function setColorActiveStatus(
  id: string,
  businessId: string,
  isActive: boolean,
) {
  const result = await prisma.color.updateMany({
    where: { id, businessId },
    data: { isActive },
  });

  if (result.count === 0) {
    throw new AppError("Colour not found", 404);
  }

  return prisma.color.findFirst({
    where: { id, businessId },
  });
}

import { PrismaClient } from "@prisma/client";
import { config } from "../config/index.js";

// Prevent multiple PrismaClient instances during dev hot-reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.isProduction ? ["error", "warn"] : ["warn", "error"],
  });

if (!config.isProduction) {
  globalForPrisma.prisma = prisma;
}

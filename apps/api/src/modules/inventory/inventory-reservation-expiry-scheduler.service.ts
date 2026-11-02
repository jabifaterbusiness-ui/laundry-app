import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";

export async function processExpiredInventoryReservations(now = new Date()) {
  const expired = await prisma.inventoryReservation.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: now } },
    select: { id: true, businessId: true, branchId: true, inventoryItemId: true, quantity: true },
    orderBy: { expiresAt: "asc" },
    take: 500,
  });

  let released = 0;
  for (const candidate of expired) {
    const didRelease = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "inventory_reservations" WHERE "id" = ${candidate.id} AND "status" = 'ACTIVE' FOR UPDATE`);
      const reservation = await tx.inventoryReservation.findFirst({
        where: { id: candidate.id, status: "ACTIVE", expiresAt: { lte: now } },
      });
      if (!reservation) return false;

      const stock = await tx.inventoryStock.findUnique({
        where: { inventoryItemId_branchId: { inventoryItemId: reservation.inventoryItemId, branchId: reservation.branchId } },
      });
      if (!stock) throw new Error("Reserved inventory balance not found for expired reservation " + reservation.id);
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "inventory_stocks" WHERE "id" = ${stock.id} FOR UPDATE`);
      const lockedStock = await tx.inventoryStock.findUniqueOrThrow({ where: { id: stock.id } });
      if (lockedStock.reservedQuantity < reservation.quantity) {
        throw new Error("Reserved inventory balance is inconsistent for reservation " + reservation.id);
      }
      await tx.inventoryStock.update({
        where: { id: stock.id },
        data: { reservedQuantity: { decrement: reservation.quantity } },
      });
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: "EXPIRED", releasedAt: now },
      });
      return true;
    });
    if (didRelease) released += 1;
  }
  return { scanned: expired.length, released };
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let processing = false;
export function startInventoryReservationExpiryScheduler() {
  if (schedulerTimer) return;
  const run = () => {
    if (processing) return;
    processing = true;
    void processExpiredInventoryReservations()
      .then((result) => { if (result.released > 0) logger.info("Expired inventory reservations released: " + result.released); })
      .catch((error) => { logger.error(error instanceof Error ? "Inventory reservation expiry scheduler failed: " + error.message : "Inventory reservation expiry scheduler failed."); })
      .finally(() => { processing = false; });
  };
  schedulerTimer = setInterval(run, 60_000);
  schedulerTimer.unref?.();
  run();
  logger.info("Inventory reservation expiry scheduler started.");
}
export function stopInventoryReservationExpiryScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
}

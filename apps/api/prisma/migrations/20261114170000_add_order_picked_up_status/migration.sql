-- Add an explicit order-level pickup lifecycle state and event timestamp.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PICKED_UP';

ALTER TABLE "orders"
ADD COLUMN "pickedUpAt" TIMESTAMP(3);

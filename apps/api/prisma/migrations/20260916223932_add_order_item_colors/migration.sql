-- AlterTable
ALTER TABLE "invoice_items" ADD COLUMN     "colors" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "colors" TEXT[] DEFAULT ARRAY[]::TEXT[];

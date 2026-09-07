-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('PAYMENT', 'REFUND');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "refundOfPaymentId" TEXT,
ADD COLUMN     "type" "PaymentType" NOT NULL DEFAULT 'PAYMENT';

-- CreateIndex
CREATE INDEX "payments_refundOfPaymentId_idx" ON "payments"("refundOfPaymentId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_refundOfPaymentId_fkey" FOREIGN KEY ("refundOfPaymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

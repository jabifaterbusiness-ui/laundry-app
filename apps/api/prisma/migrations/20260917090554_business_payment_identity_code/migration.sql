/*
  Warnings:

  - A unique constraint covering the columns `[businessCode]` on the table `business_payment_identities` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `businessCode` to the `business_payment_identities` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "business_payment_identities" ADD COLUMN     "businessCode" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "business_payment_identities_businessCode_key" ON "business_payment_identities"("businessCode");

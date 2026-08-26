-- CreateTable
CREATE TABLE "order_number_sequences" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_number_sequences_businessId_key" ON "order_number_sequences"("businessId");

-- AddForeignKey
ALTER TABLE "order_number_sequences" ADD CONSTRAINT "order_number_sequences_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "colors" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "colors_businessId_isActive_idx" ON "colors"("businessId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "colors_businessId_name_key" ON "colors"("businessId", "name");

-- AddForeignKey
ALTER TABLE "colors" ADD CONSTRAINT "colors_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

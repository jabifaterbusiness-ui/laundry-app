-- CreateTable
CREATE TABLE "employee_compensations" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "basicSalary" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_compensations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_compensations_businessId_employeeId_effectiveFrom_idx" ON "employee_compensations"("businessId", "employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "employee_compensations_businessId_employeeId_effectiveTo_idx" ON "employee_compensations"("businessId", "employeeId", "effectiveTo");

-- AddForeignKey
ALTER TABLE "employee_compensations" ADD CONSTRAINT "employee_compensations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_compensations" ADD CONSTRAINT "employee_compensations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

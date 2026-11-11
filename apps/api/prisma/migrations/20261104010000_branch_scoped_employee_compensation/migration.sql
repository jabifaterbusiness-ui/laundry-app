ALTER TABLE "employee_compensations"
  ADD COLUMN "branchId" TEXT;

ALTER TABLE "employee_compensations"
  ADD CONSTRAINT "employee_compensations_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "employee_compensations_businessId_branchId_employeeId_effectiveFrom_idx"
  ON "employee_compensations"("businessId", "branchId", "employeeId", "effectiveFrom");

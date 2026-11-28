-- Align legacy migration-created names, indexes and database defaults with the
-- current Prisma schema. These operations preserve table rows and backup history.

DROP INDEX "inventory_stocktakes_businessId_branchId_status_submittedAt_idx";
DROP INDEX "price_adjustments_businessId_isActive_idx";
DROP INDEX "tax_rules_businessId_isActive_enabledByDefault_idx";

ALTER TABLE "backup_schedules" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "refresh_tokens" ALTER COLUMN "sessionId" DROP DEFAULT;

CREATE INDEX "customer_accounts_businessId_branchId_idx"
  ON "customer_accounts"("businessId", "branchId");
CREATE INDEX "price_adjustments_businessId_branchId_isActive_idx"
  ON "price_adjustments"("businessId", "branchId", "isActive");
CREATE INDEX "tax_rules_businessId_branchId_isActive_enabledByDefault_idx"
  ON "tax_rules"("businessId", "branchId", "isActive", "enabledByDefault");

ALTER TABLE "backup_settings"
  RENAME CONSTRAINT "backup_settings_destinationConnectionId_fkey"
  TO "backup_settings_businessId_destinationConnectionId_fkey";

ALTER INDEX "branch_resource_shares_businessId_ownerBranchId_resourceType_id"
  RENAME TO "branch_resource_shares_businessId_ownerBranchId_resourceTyp_idx";
ALTER INDEX "branch_resource_shares_businessId_targetBranchId_resourceType_i"
  RENAME TO "branch_resource_shares_businessId_targetBranchId_resourceTy_idx";
ALTER INDEX "customer_account_transactions_businessId_customerAccountId_crea"
  RENAME TO "customer_account_transactions_businessId_customerAccountId__idx";
ALTER INDEX "employee_compensations_businessId_branchId_employeeId_effective"
  RENAME TO "employee_compensations_businessId_branchId_employeeId_effec_idx";
ALTER INDEX "inventory_purchase_order_lines_purchaseOrderId_inventoryItemId_"
  RENAME TO "inventory_purchase_order_lines_purchaseOrderId_inventoryIte_key";
ALTER INDEX "inventory_purchase_orders_businessId_branchId_status_createdAt_"
  RENAME TO "inventory_purchase_orders_businessId_branchId_status_create_idx";
ALTER INDEX "inventory_transfers_businessId_destinationBranchId_status_creat"
  RENAME TO "inventory_transfers_businessId_destinationBranchId_status_c_idx";
ALTER INDEX "inventory_transfers_businessId_sourceBranchId_status_createdAt_"
  RENAME TO "inventory_transfers_businessId_sourceBranchId_status_create_idx";
ALTER INDEX "order_status_notification_deliveries_businessId_deliveryStatus_"
  RENAME TO "order_status_notification_deliveries_businessId_deliverySta_idx";

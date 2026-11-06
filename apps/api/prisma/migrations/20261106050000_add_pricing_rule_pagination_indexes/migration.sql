-- Support stable keyset-like ordering for paginated pricing rule management.
CREATE INDEX "price_adjustments_businessId_branchId_name_id_idx"
  ON "price_adjustments" ("businessId", "branchId", "name", "id");

CREATE INDEX "tax_rules_businessId_branchId_name_id_idx"
  ON "tax_rules" ("businessId", "branchId", "name", "id");

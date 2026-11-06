-- Backfill legacy customer ownership only when every retained order for that
-- customer belongs to exactly one branch in the same business. Customers with
-- no order history or orders across multiple branches remain NULL and are
-- intentionally displayed as business-wide legacy records.
WITH unambiguous_customer_owners AS (
  SELECT
    c."id" AS "customerId",
    c."businessId" AS "businessId",
    MIN(o."branchId") AS "ownerBranchId"
  FROM "customers" c
  INNER JOIN "orders" o
    ON o."customerId" = c."id"
   AND o."businessId" = c."businessId"
  WHERE c."ownerBranchId" IS NULL
  GROUP BY c."id", c."businessId"
  HAVING COUNT(DISTINCT o."branchId") = 1
)
UPDATE "customers" c
SET "ownerBranchId" = candidate."ownerBranchId"
FROM unambiguous_customer_owners candidate
INNER JOIN "branches" b
  ON b."id" = candidate."ownerBranchId"
 AND b."businessId" = candidate."businessId"
WHERE c."id" = candidate."customerId"
  AND c."businessId" = candidate."businessId"
  AND c."ownerBranchId" IS NULL;

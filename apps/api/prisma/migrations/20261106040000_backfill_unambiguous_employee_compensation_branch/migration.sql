-- Assign legacy employee compensation only when the employee has exactly
-- one branch membership in the same business. Multi-branch and unassigned
-- employees remain NULL so a business-wide legacy salary is never exposed
-- to an arbitrary branch.
WITH single_branch_memberships AS (
  SELECT
    u."businessId" AS "businessId",
    ub."userId" AS "employeeId",
    MIN(ub."branchId") AS "branchId"
  FROM "user_branches" ub
  INNER JOIN "users" u
    ON u."id" = ub."userId"
  INNER JOIN "branches" b
    ON b."id" = ub."branchId"
   AND b."businessId" = u."businessId"
  GROUP BY u."businessId", ub."userId"
  HAVING COUNT(DISTINCT ub."branchId") = 1
)
UPDATE "employee_compensations" ec
SET "branchId" = membership."branchId"
FROM single_branch_memberships membership
WHERE ec."businessId" = membership."businessId"
  AND ec."employeeId" = membership."employeeId"
  AND ec."branchId" IS NULL;

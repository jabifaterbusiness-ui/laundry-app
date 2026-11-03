CREATE TABLE "customer_groups" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_groups_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "customer_groups_businessId_name_key" ON "customer_groups"("businessId", "name");
CREATE INDEX "customer_groups_businessId_createdAt_idx" ON "customer_groups"("businessId", "createdAt");

CREATE TABLE "customer_group_members" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_group_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "customer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_group_members_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "customer_group_members_groupId_customerId_key" ON "customer_group_members"("groupId", "customerId");
CREATE INDEX "customer_group_members_businessId_groupId_idx" ON "customer_group_members"("businessId", "groupId");
CREATE INDEX "customer_group_members_businessId_customerId_idx" ON "customer_group_members"("businessId", "customerId");

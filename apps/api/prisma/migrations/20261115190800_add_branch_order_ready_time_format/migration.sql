ALTER TABLE "branches"
ADD COLUMN "orderReadyTimeFormat" TEXT NOT NULL DEFAULT '24H';

ALTER TABLE "branches"
ADD CONSTRAINT "branches_orderReadyTimeFormat_check"
CHECK ("orderReadyTimeFormat" IN ('12H', '24H'));

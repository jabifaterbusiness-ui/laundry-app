ALTER TABLE "branches" ADD COLUMN "defaultOrderReadyTime" TEXT;

ALTER TABLE "branches"
ADD CONSTRAINT "branches_defaultOrderReadyTime_check"
CHECK ("defaultOrderReadyTime" IS NULL OR "defaultOrderReadyTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$');

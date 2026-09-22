ALTER TABLE "businesses"
ADD COLUMN "defaultCustomerAgreement" TEXT NOT NULL
DEFAULT 'Customer agrees to the laundry service terms and conditions.';

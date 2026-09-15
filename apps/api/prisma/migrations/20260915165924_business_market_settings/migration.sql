-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "countryCode" TEXT NOT NULL DEFAULT 'NG',
ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'NGN',
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en-NG',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos';

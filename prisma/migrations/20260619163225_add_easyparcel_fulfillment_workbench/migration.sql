-- AlterTable
ALTER TABLE "EmailDelivery" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "NotificationDelivery" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WelcomePack" ADD COLUMN     "defaultParcelCurrency" TEXT,
ADD COLUMN     "defaultParcelHeightCm" DOUBLE PRECISION,
ADD COLUMN     "defaultParcelLengthCm" DOUBLE PRECISION,
ADD COLUMN     "defaultParcelWeightKg" DOUBLE PRECISION,
ADD COLUMN     "defaultParcelWidthCm" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "WelcomePackItem" ADD COLUMN     "customsDescription" TEXT,
ADD COLUMN     "declaredUnitValue" DOUBLE PRECISION,
ADD COLUMN     "hsCode" TEXT;

-- AlterTable
ALTER TABLE "WelcomePackOrder" ADD COLUMN     "addressIsResidential" BOOLEAN,
ADD COLUMN     "easyParcelExportCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "easyParcelExportedAt" TIMESTAMP(3),
ADD COLUMN     "parcelHeightCm" DOUBLE PRECISION,
ADD COLUMN     "parcelLengthCm" DOUBLE PRECISION,
ADD COLUMN     "parcelWeightKg" DOUBLE PRECISION,
ADD COLUMN     "parcelWidthCm" DOUBLE PRECISION,
ADD COLUMN     "taxId" TEXT;

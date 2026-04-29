-- CreateEnum
CREATE TYPE "WelcomePackOrderStatus" AS ENUM ('PENDING', 'APPROVED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ShippingRegion" AS ENUM ('DOMESTIC', 'INTERNATIONAL');

-- CreateTable
CREATE TABLE "WelcomePack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentWave" INTEGER NOT NULL DEFAULT 1,
    "wave2Open" BOOLEAN NOT NULL DEFAULT false,
    "idCardTemplateBlobUrl" TEXT,
    "idCardWidth" INTEGER,
    "idCardHeight" INTEGER,
    "idCardNameX" INTEGER,
    "idCardNameY" INTEGER,
    "idCardFontSize" INTEGER,
    "idCardFontColor" TEXT,
    "idCardFontFamily" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WelcomePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WelcomePackItem" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageBlobUrl" TEXT,
    "requiresSize" BOOLEAN NOT NULL DEFAULT false,
    "sizeChartBlobUrl" TEXT,
    "sizeOptions" TEXT[],
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WelcomePackItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WelcomePackOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "status" "WelcomePackOrderStatus" NOT NULL DEFAULT 'PENDING',
    "wave" INTEGER NOT NULL,
    "idCardName" TEXT NOT NULL,
    "region" "ShippingRegion" NOT NULL,
    "recipientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "stateProvince" TEXT,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "notes" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "WelcomePackOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WelcomePackOrderItemSelection" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "selectedSize" TEXT,

    CONSTRAINT "WelcomePackOrderItemSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WelcomePackItem_packId_idx" ON "WelcomePackItem"("packId");

-- CreateIndex
CREATE UNIQUE INDEX "WelcomePackOrder_userId_key" ON "WelcomePackOrder"("userId");

-- CreateIndex
CREATE INDEX "WelcomePackOrder_status_idx" ON "WelcomePackOrder"("status");

-- CreateIndex
CREATE INDEX "WelcomePackOrder_packId_idx" ON "WelcomePackOrder"("packId");

-- CreateIndex
CREATE UNIQUE INDEX "WelcomePackOrderItemSelection_orderId_itemId_key" ON "WelcomePackOrderItemSelection"("orderId", "itemId");

-- AddForeignKey
ALTER TABLE "WelcomePackItem" ADD CONSTRAINT "WelcomePackItem_packId_fkey" FOREIGN KEY ("packId") REFERENCES "WelcomePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WelcomePackOrder" ADD CONSTRAINT "WelcomePackOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WelcomePackOrder" ADD CONSTRAINT "WelcomePackOrder_packId_fkey" FOREIGN KEY ("packId") REFERENCES "WelcomePack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WelcomePackOrderItemSelection" ADD CONSTRAINT "WelcomePackOrderItemSelection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WelcomePackOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WelcomePackOrderItemSelection" ADD CONSTRAINT "WelcomePackOrderItemSelection_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "WelcomePackItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

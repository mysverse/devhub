-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PAYPAL', 'DUITNOW', 'ROBUX', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "discordId" TEXT,
    "robloxId" TEXT,
    "legalName" TEXT,
    "shippingAddress" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'PAYPAL',
    "paypalEmail" TEXT,
    "duitNowId" TEXT,
    "robuxUsername" TEXT,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "linearIssueId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "TxStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_discordId_key" ON "UserProfile"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_robloxId_key" ON "UserProfile"("robloxId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_linearIssueId_key" ON "Transaction"("linearIssueId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

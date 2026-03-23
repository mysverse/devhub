-- AlterEnum
ALTER TYPE "TxStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT;

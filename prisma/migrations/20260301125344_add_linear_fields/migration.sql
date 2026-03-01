/*
  Warnings:

  - A unique constraint covering the columns `[linearId]` on the table `UserProfile` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[linearEmail]` on the table `UserProfile` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "linearEmail" TEXT,
ADD COLUMN     "linearId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_linearId_key" ON "UserProfile"("linearId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_linearEmail_key" ON "UserProfile"("linearEmail");

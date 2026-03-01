-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DEVELOPER');

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'DEVELOPER';

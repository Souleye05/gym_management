-- CreateEnum
CREATE TYPE "AttemptKind" AS ENUM ('LOGIN', 'OTP_REQUEST');

-- DropIndex
DROP INDEX "login_attempts_identifier_createdAt_idx";

-- AlterTable
ALTER TABLE "login_attempts" ADD COLUMN     "kind" "AttemptKind" NOT NULL DEFAULT 'LOGIN';

-- CreateIndex
CREATE INDEX "login_attempts_kind_identifier_createdAt_idx" ON "login_attempts"("kind", "identifier", "createdAt");

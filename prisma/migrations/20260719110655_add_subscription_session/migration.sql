-- CreateEnum
CREATE TYPE "PlanId" AS ENUM ('MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('SUBSCRIBER', 'VISITOR');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'MOBILE_MONEY');

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "planId" "PlanId" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "amountPaid" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "createdByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "type" "SessionType" NOT NULL,
    "clientId" TEXT,
    "visitorName" TEXT,
    "visitorPhone" TEXT,
    "amountPaid" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "createdByStaffId" TEXT,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscriptions_clientId_endDate_idx" ON "subscriptions"("clientId", "endDate");

-- CreateIndex
CREATE INDEX "sessions_clientId_checkedInAt_idx" ON "sessions"("clientId", "checkedInAt");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "staff_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "staff_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "clientAccountId" TEXT,
    "cardSequence" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clients_clientAccountId_key" ON "clients"("clientAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_cardSequence_key" ON "clients"("cardSequence");

-- CreateIndex
CREATE INDEX "clients_phone_isActive_idx" ON "clients"("phone", "isActive");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_clientAccountId_fkey" FOREIGN KEY ("clientAccountId") REFERENCES "client_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

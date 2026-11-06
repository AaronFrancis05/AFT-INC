-- CreateEnum
CREATE TYPE "idempotency_owner_kind" AS ENUM ('user', 'api_key');

-- CreateTable
CREATE TABLE "idempotency_record" (
    "id" UUID NOT NULL,
    "ownerKind" "idempotency_owner_kind" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT '',
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idempotency_record_expiresAt_idx" ON "idempotency_record"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_record_ownerKind_ownerId_organizationId_scope_k_key" ON "idempotency_record"("ownerKind", "ownerId", "organizationId", "scope", "key");


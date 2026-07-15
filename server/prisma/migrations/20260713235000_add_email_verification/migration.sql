-- Add the pending account state without altering existing active accounts.
ALTER TYPE "UserStatus" ADD VALUE 'PENDING_VERIFICATION';

-- CreateEnum
CREATE TYPE "ActionTokenPurpose" AS ENUM ('EMAIL_VERIFICATION');

-- CreateEnum
CREATE TYPE "AuthActionAttemptType" AS ENUM ('EMAIL_VERIFICATION_REQUEST', 'EMAIL_VERIFICATION_CONFIRM');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Backfill every existing account as verified before the new pending registration behavior takes effect.
UPDATE "User"
SET "emailVerifiedAt" = "createdAt"
WHERE "status" = 'ACTIVE' AND "emailVerifiedAt" IS NULL;

-- CreateTable
CREATE TABLE "ActionToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "ActionTokenPurpose" NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthActionAttempt" (
    "id" UUID NOT NULL,
    "type" "AuthActionAttemptType" NOT NULL,
    "emailHash" CHAR(64),
    "ipHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthActionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActionToken_tokenHash_key" ON "ActionToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ActionToken_userId_purpose_consumedAt_idx" ON "ActionToken"("userId", "purpose", "consumedAt");

-- CreateIndex
CREATE INDEX "ActionToken_expiresAt_idx" ON "ActionToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthActionAttempt_type_emailHash_createdAt_idx" ON "AuthActionAttempt"("type", "emailHash", "createdAt");

-- CreateIndex
CREATE INDEX "AuthActionAttempt_type_ipHash_createdAt_idx" ON "AuthActionAttempt"("type", "ipHash", "createdAt");

-- AddForeignKey
ALTER TABLE "ActionToken" ADD CONSTRAINT "ActionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

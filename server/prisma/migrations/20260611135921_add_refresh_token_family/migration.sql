-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "familyId" UUID;

-- Backfill
UPDATE "RefreshToken"
SET "familyId" = "id"
WHERE "familyId" IS NULL;

-- Enforce not null after backfill
ALTER TABLE "RefreshToken" ALTER COLUMN "familyId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_familyId_idx" ON "RefreshToken"("userId", "familyId");

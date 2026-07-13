CREATE TABLE "UserBlock" (
    "blockerId" UUID NOT NULL,
    "blockedUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("blockerId", "blockedUserId"),
    CONSTRAINT "UserBlock_no_self_block_check" CHECK ("blockerId" <> "blockedUserId")
);

CREATE INDEX "UserBlock_blockerId_idx" ON "UserBlock"("blockerId");
CREATE INDEX "UserBlock_blockedUserId_idx" ON "UserBlock"("blockedUserId");

ALTER TABLE "UserBlock"
  ADD CONSTRAINT "UserBlock_blockerId_fkey"
  FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserBlock"
  ADD CONSTRAINT "UserBlock_blockedUserId_fkey"
  FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

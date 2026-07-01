-- AlterTable
ALTER TABLE "Message"
ADD COLUMN "clientMessageId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_senderId_clientMessageId_key"
ON "Message"("conversationId", "senderId", "clientMessageId");

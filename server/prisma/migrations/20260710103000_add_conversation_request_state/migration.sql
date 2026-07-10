-- Persist per-recipient message-request choices without turning decline into a block.
CREATE TYPE "ConversationRequestState" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

ALTER TABLE "ConversationParticipant"
ADD COLUMN "requestState" "ConversationRequestState" NOT NULL DEFAULT 'PENDING';

CREATE INDEX "ConversationParticipant_userId_requestState_idx"
ON "ConversationParticipant"("userId", "requestState");

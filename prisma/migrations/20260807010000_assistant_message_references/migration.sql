-- Persist safe, provider-independent reference cards alongside assistant replies.
ALTER TABLE "AssistantMessage"
ADD COLUMN "references" JSONB;

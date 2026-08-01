-- Getting-started checklist: only the dismissal persists — the checklist's
-- step completion is derived from real rows (watches, payout states,
-- transactions, notification preferences) at render time.

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN "gettingStartedDismissedAt" TIMESTAMP(3);

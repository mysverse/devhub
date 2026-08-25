-- Give every incentive award the instant it is charged to a cap.
--
-- Caps and budgets were aggregated over createdAt. An award for 2026-W34 is
-- written by the Monday 01:00 UTC cron, which runs in W35, so the bucket was
-- always one week out of step with the award:
--
--   * the per-user weekly cap for a W34 award summed the spend created during
--     W34 — which is the awards FOR W33 — and never the award's own week;
--   * the three awards one run creates for the same week (throughput, streak,
--     leaderboard) never counted toward each other, because none of them
--     existed during the week they belong to. The per-user weekly cap has
--     therefore never actually bounded a week's awards at creation;
--   * at release the check used whichever week the cron happened to run in and
--     summed the whole group, so a developer with two weeks of due awards had
--     both charged to one week's cap, and one breach held all of them.
--
-- accountedAt makes the bucket a property of the award:
--
--   "YYYY-Www"   -> the last millisecond of that ISO week
--   "lifetime:N" -> createdAt (a milestone is earned when it is recorded)
--
-- to_date's ISO-week parse is the exact inverse of getWeekKey/getWeekBoundsFor:
-- '-1' picks the Monday, and +7 days -1ms lands on the last millisecond of the
-- Sunday, matching weekEnd to the millisecond. incentive-period.test.ts pins
-- the TypeScript side to the same instants.
--
-- The DEFAULT is deploy safety, not semantics. vercel.json runs
-- `pnpm build && prisma migrate deploy`, so this column exists while the OLD
-- code is still serving, and that code writes incentive awards from the Linear
-- webhook (milestones) at any hour. A NOT NULL column with no default would
-- make those inserts raise, and that path rethrows to force Linear redelivery —
-- a burst of webhook 500s on every deploy carrying this migration. Application
-- code always passes accountedAt explicitly.

-- AlterTable
ALTER TABLE "IncentiveAward" ADD COLUMN "accountedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill. Both statements are required: the DEFAULT above stamped every
-- existing row with the migration's own clock.
UPDATE "IncentiveAward"
SET "accountedAt" =
        (to_date("period" || '-1', 'IYYY-"W"IW-ID'))::timestamp
        + interval '7 days'
        - interval '1 millisecond'
WHERE "period" ~ '^\d{4}-W\d{2}$';

UPDATE "IncentiveAward"
SET "accountedAt" = "createdAt"
WHERE "period" !~ '^\d{4}-W\d{2}$';

-- CreateIndex
CREATE INDEX "IncentiveAward_currency_accountedAt_idx" ON "IncentiveAward"("currency", "accountedAt");

-- CreateIndex
CREATE INDEX "IncentiveAward_userId_currency_accountedAt_idx" ON "IncentiveAward"("userId", "currency", "accountedAt");

-- Record that an admin cleared a held incentive award, and who did it.
--
-- Approving a held award used to leave no trace beyond an IncentiveEvent with
-- no userId and no actor. The release path therefore re-ran the same cap and
-- budget guardrails against an award a human had already authorised, and could
-- move it straight back to HELD. Every round of that loop also restarted the
-- full dispute window, because the approval set releaseAt to now + 48h even
-- though the award had already served one. An award held by over_monthly_cap
-- could not escape until the month rolled over, and the developer watching it
-- saw "pending release" reappear with the clock reset and no explanation.
--
-- approvedAt is the flag the release path reads: an approved award skips caps
-- and budgets. It deliberately does NOT skip issue re-validation — an award
-- whose counted issues were reopened, cancelled or reassigned must still be
-- held, so approving it can never pay for work that no longer stands.
--
-- approvedById has no index, matching disputedById: it is read one award at a
-- time to name the approver, never filtered on.
--
-- IncentiveEvent.actorId carries the admin behind an admin-driven event, with
-- no foreign key on purpose — the record that someone approved an award must
-- outlive the account that approved it, the same way ActivationEvent.userId
-- does.

-- AlterTable
ALTER TABLE "IncentiveAward"
    ADD COLUMN "approvedAt" TIMESTAMP(3),
    ADD COLUMN "approvedById" TEXT;

-- AlterTable
ALTER TABLE "IncentiveEvent" ADD COLUMN "actorId" TEXT;

-- AddForeignKey
ALTER TABLE "IncentiveAward" ADD CONSTRAINT "IncentiveAward_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

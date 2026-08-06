-- A PPT whose proof comment was posted but failed the proof check was recorded
-- as MISSING_PROOF, which is the reason for "no proof comment exists at all".
-- The developer got told to post proof they had already posted, and nothing
-- said their comment had been read and rejected.
--
-- PROOF_NOT_QUALIFYING separates the two. It behaves identically to
-- MISSING_PROOF in the state machine (clears proof, holds an unpaid
-- transaction, developer-owned) and differs only in what it tells the
-- developer.

-- AlterEnum
-- The Postgres type is PptPayoutReason; PptReason is only the TypeScript
-- alias in ppt-reason-copy.ts. Dev mode uses `prisma db push` and never runs
-- this file, so the wrong name here would have passed every local gate and
-- failed on deploy.
ALTER TYPE "PptPayoutReason" ADD VALUE 'PROOF_NOT_QUALIFYING';

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
ALTER TYPE "PptReason" ADD VALUE 'PROOF_NOT_QUALIFYING';

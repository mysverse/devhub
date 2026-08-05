-- Display identity, split out from the compliance identity. preferredName is
-- the only profile name a human-facing surface may render; legalName is now
-- reserved for KYC, document signing, payout verification and courier labels.

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN "preferredName" TEXT;

-- Backfill from the better-auth OAuth name — which is exactly what
-- ensureUserProfile() used to write into legalName. Deliberately does NOT read
-- legalName: a legal name must never be promoted to a display name by default.
-- Idempotent (only fills NULLs), so a replayed deploy is a no-op.
UPDATE "UserProfile" p
SET "preferredName" = NULLIF(BTRIM(u."name"), '')
FROM "User" u
WHERE u."id" = p."id"
  AND p."preferredName" IS NULL;

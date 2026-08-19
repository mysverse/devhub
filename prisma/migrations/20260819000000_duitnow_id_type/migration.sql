-- Make the DuitNow proxy type an explicit, stored field.
--
-- A DuitNow ID is a proxy: a mobile number, NRIC, business registration
-- number, passport, or army/police number. To pay one, the bank asks for the
-- TYPE before the value — and the value cannot reveal it. A Touch 'n Go
-- eWallet account number is 12 digits, and so is an NRIC, and so are Maybank,
-- Affin, China Construction Bank, Kuwait Finance House, Standard Chartered,
-- Merchantrade, Boost, Setel and Instapay account numbers. There is no
-- distinguishing prefix, so any heuristic that infers the type misroutes
-- money. It is chosen by a person and stored here.
--
-- duitNowIdStatus is display-only and must never gate a payout: the backfill
-- below leaves every existing proxy user UNCONFIRMED by construction, so
-- gating on it would make every pending proxy payout unpayable on deploy day.

-- CreateEnum
CREATE TYPE "DuitNowIdType" AS ENUM ('MOBILE', 'NRIC', 'BUSINESS_REG', 'PASSPORT', 'ARMY_POLICE');

-- CreateEnum
CREATE TYPE "DuitNowIdStatus" AS ENUM ('UNCONFIRMED', 'CONFIRMED', 'RESOLVED', 'UNREACHABLE');

-- CreateEnum
CREATE TYPE "DuitNowIdIssue" AS ENUM ('NOT_FOUND', 'NAME_MISMATCH', 'WRONG_TYPE', 'REGISTERED_ELSEWHERE');

-- AlterTable
ALTER TABLE "UserProfile"
    ADD COLUMN "duitNowIdType" "DuitNowIdType",
    ADD COLUMN "duitNowIdStatus" "DuitNowIdStatus" NOT NULL DEFAULT 'UNCONFIRMED',
    ADD COLUMN "duitNowIdCheckedAt" TIMESTAMP(3),
    ADD COLUMN "duitNowIdIssue" "DuitNowIdIssue";

-- Backfill MOBILE only, and normalize the value while we are here.
--
-- Matching on '+60%' would be wrong: normalizeMalaysianPhone only entered the
-- write paths in bb783f2 (2026-03-23), 67 commits into the history, so earlier
-- rows hold whatever the developer typed — local 01X, dashed, or spaced. The
-- separator strip runs before the match for that reason. The rewrite is
-- lossless and produces exactly what the app writes on the next save;
-- duitnow-id.test.ts asserts the TypeScript normalizer agrees with it.
--
-- Every 12-digit value is deliberately left NULL. Adding a '^\d{12}$' -> NRIC
-- rule would stamp NRIC onto TnG and bank account numbers alike, turning an
-- unlabelled ambiguous value into a labelled, plausible-looking one that
-- nothing ever re-examines. Those rows are re-collected on next edit instead.
UPDATE "UserProfile"
SET "duitNowIdType" = 'MOBILE',
    "duitNowId" = '+60' || regexp_replace(
        regexp_replace("duitNowId", '[-\s]', '', 'g'),
        '^(\+?60|0)', ''
    )
WHERE regexp_replace("duitNowId", '[-\s]', '', 'g') ~ '^(\+?60|0)1[0-9]{8,9}$';

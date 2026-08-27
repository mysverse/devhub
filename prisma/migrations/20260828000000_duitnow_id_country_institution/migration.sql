-- Two facts about a DuitNow proxy ID that the payout screen needs and the
-- profile never recorded.
--
-- duitNowIdCountry: the issuing country of a PASSPORT proxy, as ISO 3166-1
-- alpha-2. The admin's bank asks for "Issuing Country" before it asks for the
-- passport number, so a passport proxy stored without one cannot be paid at
-- all. Alpha-2 rather than the alpha-3 the bank displays because everything
-- else in the codebase (countries.ts, welcome-pack shipping) is alpha-2 and
-- Intl.DisplayNames only names alpha-2; the "SGP - SINGAPORE" string the bank
-- wants is derived at read time.
--
-- duitNowIdInstitution: the BIC of the bank or e-wallet the developer says the
-- proxy is linked at. A DuitNow ID only works if it was explicitly linked in
-- one banking or e-wallet app, and nothing offline can tell whether that
-- happened. Making the developer name the app is the closest thing to a check
-- there is, and it gives the admin something to compare with what the bank
-- shows when the lookup comes back. It is a claim, never a result. It is a new
-- column rather than a reuse of bankName because bankName is the bank-account
-- branch and drives automated payout routing.
--
-- No backfill: neither fact has a source of truth anywhere in the database.
-- Existing proxy users are asked for both the next time they save the DuitNow
-- ID branch of their settings, and a passport row without a country renders
-- red on the admin payout card until then. Both columns are nullable with no
-- default, so the previous deployment runs unchanged against this schema
-- during the build-then-migrate window.

-- AlterTable
ALTER TABLE "UserProfile"
    ADD COLUMN "duitNowIdCountry" TEXT,
    ADD COLUMN "duitNowIdInstitution" TEXT;

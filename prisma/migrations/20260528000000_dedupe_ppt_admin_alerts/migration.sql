WITH ranked_admin_alerts AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY "stateId", COALESCE("reason"::TEXT, '')
      ORDER BY "createdAt", "id"
    ) AS row_number
  FROM "PptPayoutEvent"
  WHERE "type" = 'ADMIN_ALERT_SENT'
)
DELETE FROM "PptPayoutEvent" e
USING ranked_admin_alerts ranked
WHERE e.ctid = ranked.ctid
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "PptPayoutEvent_adminAlert_dedupe_key"
ON "PptPayoutEvent" (
  "stateId",
  COALESCE("reason"::TEXT, '')
)
WHERE "type" = 'ADMIN_ALERT_SENT';

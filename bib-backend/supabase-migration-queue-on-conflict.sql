-- Migration: restore queue upsert conflict target
-- Run this in the Supabase SQL editor if /queue/enqueue fails with:
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification"

-- Keep only one queue row per service/city before adding the unique index.
-- Active work is preserved first, then newer failed/done rows.
WITH ranked_queue AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY service_id, city
      ORDER BY
        CASE status
          WHEN 'processing' THEN 1
          WHEN 'pending' THEN 2
          WHEN 'failed' THEN 3
          WHEN 'done' THEN 4
          ELSE 5
        END,
        created_at DESC
    ) AS duplicate_rank
  FROM queue
)
DELETE FROM queue q
USING ranked_queue r
WHERE q.id = r.id
  AND r.duplicate_rank > 1;

-- Supabase/PostgREST needs a plain unique target for:
-- .upsert(..., { onConflict: 'service_id,city' })
CREATE UNIQUE INDEX IF NOT EXISTS queue_service_id_city_uidx
  ON queue(service_id, city);

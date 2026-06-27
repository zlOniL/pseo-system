-- Migration: remove hardcoded queue.site_id default and realign existing rows
-- Context: queue.site_id must mirror the linked service.site_id. A database
-- default can silently attach new queue rows to the wrong site when inserts omit
-- site_id.

ALTER TABLE queue
  ALTER COLUMN site_id DROP DEFAULT;

ALTER TABLE queue
  ALTER COLUMN site_id DROP NOT NULL;

UPDATE queue q
SET site_id = s.site_id
FROM services s
WHERE q.service_id = s.id
  AND q.site_id IS DISTINCT FROM s.site_id;

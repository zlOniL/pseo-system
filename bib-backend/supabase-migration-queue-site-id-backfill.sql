-- Migration: backfill queue.site_id from the linked service
-- Keeps queue site filtering aligned with the service that owns each item.

UPDATE queue q
SET site_id = s.site_id
FROM services s
WHERE q.service_id = s.id
  AND q.site_id IS DISTINCT FROM s.site_id;

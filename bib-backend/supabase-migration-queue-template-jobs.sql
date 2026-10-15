-- Run after the existing queue migrations.
-- Template creation uses the same queue as page generation, but is processed
-- by a dedicated serial worker.

ALTER TABLE queue
  ADD COLUMN IF NOT EXISTS job_type text NOT NULL DEFAULT 'page';

ALTER TABLE queue
  DROP CONSTRAINT IF EXISTS queue_job_type_check;

ALTER TABLE queue
  ADD CONSTRAINT queue_job_type_check
  CHECK (job_type IN ('page', 'template'));

ALTER TABLE queue
  ADD COLUMN IF NOT EXISTS payload jsonb;

ALTER TABLE queue
  ALTER COLUMN city DROP NOT NULL;

-- Pages and templates for the same service/city must not collide.
ALTER TABLE queue DROP CONSTRAINT IF EXISTS queue_service_id_city_key;
DROP INDEX IF EXISTS queue_service_id_city_uidx;
DROP INDEX IF EXISTS queue_service_city_site_uidx;
DROP INDEX IF EXISTS queue_service_city_type_uidx;

CREATE UNIQUE INDEX queue_service_city_type_uidx
  ON queue(service_id, city, job_type);

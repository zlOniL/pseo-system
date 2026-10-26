-- Allow only one active main-page generation per service.
-- Existing duplicate active jobs must be resolved before this index is applied.
CREATE UNIQUE INDEX IF NOT EXISTS queue_one_active_main_page_per_service_uidx
  ON queue (service_id)
  WHERE job_type = 'template'
    AND city IS NULL
    AND payload->>'is_main_page' = 'true'
    AND status IN ('pending', 'processing');

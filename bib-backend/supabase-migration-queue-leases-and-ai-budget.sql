-- A claim belongs to one worker. A restarted worker may only reclaim work that
-- has had no heartbeat for 20 minutes, and every provider request consumes budget.
ALTER TABLE queue ADD COLUMN IF NOT EXISTS claim_token uuid;
ALTER TABLE queue ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;
ALTER TABLE queue ADD COLUMN IF NOT EXISTS ai_call_count integer NOT NULL DEFAULT 0;

UPDATE queue
SET heartbeat_at = COALESCE(heartbeat_at, started_at)
WHERE status = 'processing' AND heartbeat_at IS NULL;

CREATE INDEX IF NOT EXISTS queue_processing_heartbeat_idx
  ON queue (heartbeat_at)
  WHERE status = 'processing';

CREATE OR REPLACE FUNCTION reserve_queue_ai_call(
  p_queue_id uuid,
  p_claim_token uuid,
  p_max_calls integer DEFAULT 40
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE queue
  SET ai_call_count = ai_call_count + 1,
      heartbeat_at = now()
  WHERE id = p_queue_id
    AND status = 'processing'
    AND claim_token = p_claim_token
    AND ai_call_count < p_max_calls;

  RETURN FOUND;
END;
$$;

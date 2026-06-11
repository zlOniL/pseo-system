-- Stores generated content split by section for audit/review workflows.
-- This table is populated after content generation and does not change the
-- existing publishing payloads stored in contents.html or contents.content_json.

CREATE TABLE IF NOT EXISTS content_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  output_format text NOT NULL CHECK (output_format IN ('html', 'whitelabel_json')),
  html text,
  content_json jsonb,
  word_count int NOT NULL DEFAULT 0,
  generation_status text NOT NULL DEFAULT 'done'
    CHECK (generation_status IN ('pending', 'generating', 'done', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, section_key)
);

CREATE INDEX IF NOT EXISTS content_sections_content_id_idx
  ON content_sections (content_id, sort_order);

CREATE INDEX IF NOT EXISTS content_sections_section_key_idx
  ON content_sections (section_key);

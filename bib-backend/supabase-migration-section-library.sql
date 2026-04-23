-- Migration: Section Library + Service Templates
-- Run this in the Supabase SQL editor

-- 1. Table: service_templates
--    Stores multiple AI-generated templates per service.
--    Replaces the single template_html / template_base_city columns on services.
CREATE TABLE IF NOT EXISTS service_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  service_id  uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  version     int  NOT NULL,
  html        text NOT NULL,
  base_city   text NOT NULL,
  images      jsonb NOT NULL DEFAULT '[]',
  video_url   text,
  UNIQUE (service_id, version)
);

CREATE INDEX IF NOT EXISTS idx_service_templates_service ON service_templates(service_id);

-- 2. Table: section_library
--    One row per section per version. html contains {{IMAGE_N}} placeholders (normalised).
CREATE TABLE IF NOT EXISTS section_library (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  service_id  uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  template_id uuid REFERENCES service_templates(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  version     int  NOT NULL,
  html        text NOT NULL,
  base_city   text NOT NULL,
  UNIQUE (service_id, section_key, version)
);

CREATE INDEX IF NOT EXISTS idx_section_library_service ON section_library(service_id, section_key);
CREATE INDEX IF NOT EXISTS idx_section_library_template ON section_library(template_id);

-- 3. Queue table: add template_id + expand mode to include 'library'
ALTER TABLE queue ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES service_templates(id) ON DELETE SET NULL;

-- Expand mode column to accept 'library' (if it has a check constraint, drop and re-add)
ALTER TABLE queue DROP CONSTRAINT IF EXISTS queue_mode_check;
ALTER TABLE queue ADD CONSTRAINT queue_mode_check CHECK (mode IN ('ai', 'template', 'library'));

-- 4. Contents: expand generation_mode to accept 'library'
ALTER TABLE contents DROP CONSTRAINT IF EXISTS contents_generation_mode_check;
ALTER TABLE contents ADD CONSTRAINT contents_generation_mode_check
  CHECK (generation_mode IN ('ai', 'template', 'library'));

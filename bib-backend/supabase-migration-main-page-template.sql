-- Migration: Main-page template flag + cascade fix
-- Run this in the Supabase SQL editor

-- 1. Ensure ON DELETE CASCADE on section_library.template_id
--    (re-creates the FK in case the table existed before the cascade was added)
ALTER TABLE section_library DROP CONSTRAINT IF EXISTS section_library_template_id_fkey;
ALTER TABLE section_library
  ADD CONSTRAINT section_library_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES service_templates(id) ON DELETE CASCADE;

-- 2. Allow base_city to be NULL (main page templates have no city)
ALTER TABLE service_templates ALTER COLUMN base_city DROP NOT NULL;

-- 3. Flag: true = página principal sem cidade, não contribui para a biblioteca de secções
ALTER TABLE service_templates
  ADD COLUMN IF NOT EXISTS is_main_page boolean NOT NULL DEFAULT false;

-- 4. Label: nome personalizado opcional para identificar o template
ALTER TABLE service_templates
  ADD COLUMN IF NOT EXISTS label text;

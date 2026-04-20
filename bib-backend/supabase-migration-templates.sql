-- Migration: add template columns to services table
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS template_html TEXT,
  ADD COLUMN IF NOT EXISTS template_base_city TEXT DEFAULT 'Lisboa';

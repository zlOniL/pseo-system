-- Migration: add seo_title and seo_description to services table
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text;

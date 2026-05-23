-- Migration: media library for Whitelabel service images
-- Run this in the Supabase SQL Editor.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'service-media',
  'service-media',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS media_assets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  site_id      uuid REFERENCES sites(id) ON DELETE SET NULL,
  bucket       text NOT NULL DEFAULT 'service-media',
  storage_path text NOT NULL,
  public_url   text NOT NULL,
  title        text NOT NULL,
  alt          text,
  mime_type    text NOT NULL,
  size_bytes   bigint NOT NULL DEFAULT 0,
  width        integer,
  height       integer,
  tags         jsonb NOT NULL DEFAULT '[]'::jsonb,
  source       text NOT NULL DEFAULT 'supabase_storage'
);

CREATE UNIQUE INDEX IF NOT EXISTS media_assets_bucket_path_uidx
  ON media_assets(bucket, storage_path);

CREATE INDEX IF NOT EXISTS media_assets_site_idx
  ON media_assets(site_id);

CREATE INDEX IF NOT EXISTS media_assets_created_at_idx
  ON media_assets(created_at DESC);

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS featured_image_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS featured_image_alt text;

CREATE INDEX IF NOT EXISTS services_featured_image_asset_idx
  ON services(featured_image_asset_id);

-- Migration: Multi-site + Whitelabel API integration
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.sites (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  name             text NOT NULL,
  domain           text NOT NULL,
  integration_type text NOT NULL DEFAULT 'wordpress'
                   CHECK (integration_type IN ('wordpress', 'whitelabel_api')),
  api_token        text,
  wordpress_base_url text,
  wordpress_secret   text,
  wordpress_proxy_base text,
  status           text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'archived')),
  UNIQUE (domain)
);

ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS domain text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS integration_type text DEFAULT 'wordpress';
UPDATE public.sites SET integration_type = 'wordpress' WHERE integration_type IS NULL;
ALTER TABLE public.sites ALTER COLUMN integration_type SET NOT NULL;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS api_token text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS wordpress_base_url text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS wordpress_secret text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS wordpress_proxy_base text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
UPDATE public.sites SET status = 'active' WHERE status IS NULL;
ALTER TABLE public.sites ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.sites DROP CONSTRAINT IF EXISTS sites_integration_type_check;
ALTER TABLE public.sites ADD CONSTRAINT sites_integration_type_check
  CHECK (integration_type IN ('wordpress', 'whitelabel_api'));

ALTER TABLE public.sites DROP CONSTRAINT IF EXISTS sites_status_check;
ALTER TABLE public.sites ADD CONSTRAINT sites_status_check
  CHECK (status IN ('active', 'archived'));

CREATE INDEX IF NOT EXISTS sites_status_idx ON public.sites(status);
CREATE INDEX IF NOT EXISTS sites_integration_type_idx ON public.sites(integration_type);

CREATE TABLE IF NOT EXISTS public.site_blueprints (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (name IN ('service-page', 'pseo-rules')),
  payload    jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, name)
);

CREATE INDEX IF NOT EXISTS site_blueprints_site_idx ON public.site_blueprints(site_id);

ALTER TABLE services ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE SET NULL;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE SET NULL;
ALTER TABLE queue ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE SET NULL;
ALTER TABLE service_templates ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE SET NULL;
ALTER TABLE section_library ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS services_site_id_idx ON services(site_id);
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_name_key;
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS services_site_name_uidx
  ON services(COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid), name);
CREATE UNIQUE INDEX IF NOT EXISTS services_site_slug_uidx
  ON services(COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);

CREATE INDEX IF NOT EXISTS contents_site_id_idx ON contents(site_id);
CREATE INDEX IF NOT EXISTS queue_site_id_idx ON queue(site_id);
CREATE INDEX IF NOT EXISTS service_templates_site_id_idx ON service_templates(site_id);
CREATE INDEX IF NOT EXISTS section_library_site_id_idx ON section_library(site_id);

ALTER TABLE service_templates ADD COLUMN IF NOT EXISTS output_format text NOT NULL DEFAULT 'html'
  CHECK (output_format IN ('html', 'whitelabel_json'));
ALTER TABLE service_templates ADD COLUMN IF NOT EXISTS content_json jsonb;
ALTER TABLE service_templates ALTER COLUMN html DROP NOT NULL;

ALTER TABLE section_library ADD COLUMN IF NOT EXISTS output_format text NOT NULL DEFAULT 'html'
  CHECK (output_format IN ('html', 'whitelabel_json'));
ALTER TABLE section_library ADD COLUMN IF NOT EXISTS content_json jsonb;
ALTER TABLE section_library ALTER COLUMN html DROP NOT NULL;

ALTER TABLE contents ADD COLUMN IF NOT EXISTS output_format text NOT NULL DEFAULT 'html'
  CHECK (output_format IN ('html', 'whitelabel_json'));
ALTER TABLE contents ADD COLUMN IF NOT EXISTS content_json jsonb;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS external_page_type text
  CHECK (external_page_type IS NULL OR external_page_type IN ('service', 'service_location', 'page'));
ALTER TABLE contents ADD COLUMN IF NOT EXISTS external_slug text;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS external_page_id bigint;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS external_page_url text;
ALTER TABLE contents ALTER COLUMN html DROP NOT NULL;

ALTER TABLE contents DROP CONSTRAINT IF EXISTS contents_generation_mode_check;
ALTER TABLE contents ADD CONSTRAINT contents_generation_mode_check
  CHECK (generation_mode IN ('ai', 'template', 'library'));

ALTER TABLE queue DROP CONSTRAINT IF EXISTS queue_service_id_city_key;
CREATE UNIQUE INDEX IF NOT EXISTS queue_service_city_site_uidx
  ON queue(service_id, city, COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- QueueService uses Supabase upsert with onConflict: 'service_id,city'.
-- Keep a plain unique index for that PostgREST conflict target.
WITH ranked_queue AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY service_id, city
      ORDER BY
        CASE status
          WHEN 'processing' THEN 1
          WHEN 'pending' THEN 2
          WHEN 'failed' THEN 3
          WHEN 'done' THEN 4
          ELSE 5
        END,
        created_at DESC
    ) AS duplicate_rank
  FROM queue
)
DELETE FROM queue q
USING ranked_queue r
WHERE q.id = r.id
  AND r.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS queue_service_id_city_uidx
  ON queue(service_id, city);

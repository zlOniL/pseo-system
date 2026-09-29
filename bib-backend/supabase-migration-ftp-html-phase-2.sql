-- Migration: FTP HTML data model and credential storage
-- Run this in the Supabase SQL editor after supabase-migration-ftp-html-integration-type.sql.

CREATE TABLE IF NOT EXISTS public.ftp_site_configs (
  site_id uuid PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  host text NOT NULL,
  port integer NOT NULL DEFAULT 21 CHECK (port BETWEEN 1 AND 65535),
  security_mode text NOT NULL DEFAULT 'plain'
    CHECK (security_mode IN ('plain', 'explicit_tls')),
  username text NOT NULL,
  password_encrypted text,
  remote_root text NOT NULL DEFAULT 'public_html'
    CHECK (remote_root <> '' AND remote_root NOT LIKE '/%' AND position('..' in remote_root) = 0),
  backup_root text NOT NULL DEFAULT 'backups/pseo'
    CHECK (backup_root <> '' AND backup_root NOT LIKE '/%' AND position('..' in backup_root) = 0),
  public_base_url text NOT NULL,
  passive_mode boolean NOT NULL DEFAULT true,
  connection_status text NOT NULL DEFAULT 'untested'
    CHECK (connection_status IN ('untested', 'ok', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ftp_remote_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  remote_path text NOT NULL
    CHECK (remote_path <> '' AND remote_path NOT LIKE '/%' AND position('..' in remote_path) = 0),
  public_url text,
  last_seen_hash text,
  last_seen_size bigint,
  last_seen_modified_at timestamptz,
  import_status text NOT NULL DEFAULT 'pending'
    CHECK (import_status IN ('pending', 'imported', 'manual_boundary_required', 'failed')),
  active_template_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, remote_path)
);

CREATE TABLE IF NOT EXISTS public.ftp_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remote_page_id uuid NOT NULL REFERENCES public.ftp_remote_pages(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  original_html text NOT NULL,
  document_prefix text NOT NULL,
  document_suffix text NOT NULL,
  source_hash text NOT NULL,
  source_encoding text NOT NULL DEFAULT 'utf-8',
  boundary_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  editable_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'invalid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (remote_page_id, version)
);

CREATE TABLE IF NOT EXISTS public.ftp_publish_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid REFERENCES public.contents(id) ON DELETE SET NULL,
  remote_page_id uuid REFERENCES public.ftp_remote_pages(id) ON DELETE SET NULL,
  status text NOT NULL
    CHECK (status IN (
      'preparing',
      'remote_checked',
      'backed_up',
      'uploaded',
      'swapped',
      'verified',
      'published',
      'conflict',
      'failed',
      'rolled_back'
    )),
  remote_hash_before text,
  generated_hash text,
  backup_path text,
  temporary_path text,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

ALTER TABLE public.ftp_remote_pages
  DROP CONSTRAINT IF EXISTS ftp_remote_pages_active_template_version_id_fkey;
ALTER TABLE public.ftp_remote_pages
  ADD CONSTRAINT ftp_remote_pages_active_template_version_id_fkey
  FOREIGN KEY (active_template_version_id)
  REFERENCES public.ftp_template_versions(id)
  ON DELETE SET NULL;

ALTER TABLE public.contents
  ADD COLUMN IF NOT EXISTS ftp_remote_page_id uuid REFERENCES public.ftp_remote_pages(id) ON DELETE SET NULL;
ALTER TABLE public.contents
  ADD COLUMN IF NOT EXISTS render_mode text NOT NULL DEFAULT 'fragment'
    CHECK (render_mode IN ('fragment', 'full_document'));
ALTER TABLE public.contents
  ADD COLUMN IF NOT EXISTS deployment_status text NOT NULL DEFAULT 'not_deployed'
    CHECK (deployment_status IN ('not_deployed', 'pending', 'published', 'conflict', 'failed', 'rolled_back'));
ALTER TABLE public.contents
  ADD COLUMN IF NOT EXISTS last_publish_run_id uuid REFERENCES public.ftp_publish_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ftp_remote_pages_site_idx ON public.ftp_remote_pages(site_id);
CREATE INDEX IF NOT EXISTS ftp_remote_pages_service_idx ON public.ftp_remote_pages(service_id);
CREATE INDEX IF NOT EXISTS ftp_template_versions_remote_page_idx ON public.ftp_template_versions(remote_page_id);
CREATE INDEX IF NOT EXISTS ftp_publish_runs_content_idx ON public.ftp_publish_runs(content_id);
CREATE INDEX IF NOT EXISTS ftp_publish_runs_remote_page_idx ON public.ftp_publish_runs(remote_page_id);
CREATE INDEX IF NOT EXISTS contents_ftp_remote_page_idx ON public.contents(ftp_remote_page_id);
CREATE INDEX IF NOT EXISTS contents_deployment_status_idx ON public.contents(deployment_status);

ALTER TABLE public.ftp_site_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ftp_remote_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ftp_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ftp_publish_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ftp_site_configs FROM anon, authenticated;
REVOKE ALL ON TABLE public.ftp_remote_pages FROM anon, authenticated;
REVOKE ALL ON TABLE public.ftp_template_versions FROM anon, authenticated;
REVOKE ALL ON TABLE public.ftp_publish_runs FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ftp_site_configs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ftp_remote_pages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ftp_template_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ftp_publish_runs TO service_role;

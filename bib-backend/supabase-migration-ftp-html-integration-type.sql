-- Migration: allow FTP HTML site integration type
-- Run this in the Supabase SQL editor before creating ftp_html sites.

ALTER TABLE public.sites DROP CONSTRAINT IF EXISTS sites_integration_type_check;
ALTER TABLE public.sites ADD CONSTRAINT sites_integration_type_check
  CHECK (integration_type IN ('wordpress', 'whitelabel_api', 'ftp_html'));

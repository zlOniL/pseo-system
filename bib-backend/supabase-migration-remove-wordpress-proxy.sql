-- Migration: remove deprecated WordPress proxy configuration
-- Run this in the Supabase SQL editor after deploying the direct WordPress publishing code.

ALTER TABLE public.sites DROP COLUMN IF EXISTS wordpress_proxy_base;
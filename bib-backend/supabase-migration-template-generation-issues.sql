-- Persists the generation report with the exact template version it belongs to.
ALTER TABLE public.service_templates
  ADD COLUMN IF NOT EXISTS generation_issues jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.service_templates
SET generation_issues = '[]'::jsonb
WHERE generation_issues IS NULL;

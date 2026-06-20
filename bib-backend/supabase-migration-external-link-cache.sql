-- Cache privado das referencias externas verificadas pela pipeline de geracao.
-- O backend usa apenas SUPABASE_SERVICE_ROLE_KEY; clientes publicos nao recebem acesso.

CREATE TABLE IF NOT EXISTS public.external_link_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL UNIQUE,
  final_url text NOT NULL,
  domain text NOT NULL,
  entity_name text NOT NULL,
  reference_type text NOT NULL
    CHECK (reference_type IN ('brand', 'local_authority', 'technical_authority')),
  target_module text NOT NULL
    CHECK (target_module IN (
      'modulo_4_servicos_realizados',
      'modulo_12_zonas_contexto_local',
      'modulo_15_mais_sobre_servico'
    )),
  page_title text,
  page_description text,
  http_status integer NOT NULL,
  relevance_score numeric(4,3) NOT NULL DEFAULT 0
    CHECK (relevance_score >= 0 AND relevance_score <= 1),
  is_official boolean NOT NULL DEFAULT false,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS external_link_cache_domain_idx
  ON public.external_link_cache(domain);
CREATE INDEX IF NOT EXISTS external_link_cache_verified_at_idx
  ON public.external_link_cache(verified_at DESC);

ALTER TABLE public.external_link_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.external_link_cache FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.external_link_cache TO service_role;

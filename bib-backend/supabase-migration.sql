-- BIB Programmatic SEO Engine — Tabela contents
-- Execute este SQL no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS contents (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz   DEFAULT now() NOT NULL,
  main_keyword  text          NOT NULL,
  service       text          NOT NULL,
  city          text          NOT NULL,
  neighborhood  text,
  html          text          NOT NULL,
  score         smallint,
  score_issues  jsonb,
  status        text          NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'approved', 'published')),
  wp_post_id    bigint,
  wp_post_url   text
);

-- Índices para as queries mais comuns
CREATE INDEX IF NOT EXISTS contents_status_idx ON contents (status);
CREATE INDEX IF NOT EXISTS contents_created_at_idx ON contents (created_at DESC);

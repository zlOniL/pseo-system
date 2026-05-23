-- ============================================================
-- BIB SEO Engine — Migration V2 (FEATURE_SCALE)
-- Execute no Supabase SQL Editor
-- Idempotente: seguro de executar múltiplas vezes
-- ============================================================

-- 1. Tabela services
CREATE TABLE IF NOT EXISTS services (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz DEFAULT now() NOT NULL,
  name             text        NOT NULL UNIQUE,
  slug             text        NOT NULL UNIQUE,
  video_url        text,
  images           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  related_services jsonb       NOT NULL DEFAULT '[]'::jsonb,
  service_notes    text,
  tone             text        NOT NULL DEFAULT 'profissional, confiável e direto',
  min_words        int         NOT NULL DEFAULT 5000,
  status           text        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'archived'))
);

CREATE INDEX IF NOT EXISTS services_name_idx   ON services (name);
CREATE INDEX IF NOT EXISTS services_status_idx ON services (status);

-- 2. Alterar tabela contents (existentes ficam com service_id=NULL e content_type='city_page')
ALTER TABLE contents ADD COLUMN IF NOT EXISTS service_id    uuid REFERENCES services(id);
ALTER TABLE contents ADD COLUMN IF NOT EXISTS content_type  text NOT NULL DEFAULT 'city_page'
  CHECK (content_type IN ('service_base', 'city_page'));

CREATE INDEX IF NOT EXISTS contents_service_id_idx ON contents (service_id);
CREATE INDEX IF NOT EXISTS contents_type_idx       ON contents (content_type);

-- 3. Tabela queue (depende de services e contents, portanto vai por último)
CREATE TABLE IF NOT EXISTS queue (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz DEFAULT now() NOT NULL,
  service_id  uuid        NOT NULL REFERENCES services(id),
  city        text        NOT NULL,
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  content_id  uuid        REFERENCES contents(id),
  error       text,
  started_at  timestamptz,
  finished_at timestamptz,
  attempts    smallint    NOT NULL DEFAULT 0,
  UNIQUE(service_id, city)
);

-- If queue already existed before this migration, CREATE TABLE IF NOT EXISTS
-- does not add the inline UNIQUE above. Ensure the upsert conflict target exists.
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

CREATE INDEX IF NOT EXISTS queue_status_idx  ON queue (status);
CREATE INDEX IF NOT EXISTS queue_service_idx ON queue (service_id);

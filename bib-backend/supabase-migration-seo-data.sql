-- Migração de dados: popula seo_title e seo_description a partir da const SEO_TEMPLATES
-- Aplica apenas quando o campo está NULL (não sobrescreve valores personalizados já guardados)
-- Placeholder de cidade: "Lisboa" — substituído dinamicamente no momento da publicação

UPDATE services SET
  seo_title       = 'Reparação de Janelas em Lisboa – Caixilharia SOS 24H/7',
  seo_description = 'Serviços de Reparação de Janelas em Lisboa 24h/7 - Instalação, Manutênção e Arranjo de Janelas em Alumínio, Vidros e PVC.'
WHERE slug = 'reparacao-de-janelas' AND seo_title IS NULL;

UPDATE services SET
  seo_title       = 'Reparação de Portas em Lisboa – Caixilharia SOS 24H/7',
  seo_description = 'Serviços de Reparação de Portas em Lisboa 24h/7 - Instalação, Manutênção e Arranjo de Portas em Alumínio, Vidros e PVC.'
WHERE slug = 'reparacao-de-portas' AND seo_title IS NULL;

UPDATE services SET
  seo_title       = 'Reparação de Estores em Lisboa – SOS Estores 24H/7',
  seo_description = 'Empresa de Reparação de Estores em Lisboa 24h/7 - Instalação, Manutênção e Arranjo de Estores - Sáb, Dom e Feriados.'
WHERE slug = 'reparacao-de-estores' AND seo_title IS NULL;

UPDATE services SET
  seo_title       = 'Reparação de Caldeiras em Lisboa - Assistência 24h/7',
  seo_description = 'Técnicos de Reparação de Caldeiras em Lisboa 24h/7 - Instalação, Manutênção e Arranjo de Caldeiras - Sáb, Dom e Feriados.'
WHERE slug = 'reparacao-de-caldeiras' AND seo_title IS NULL;

UPDATE services SET
  seo_title       = 'Reparação de Esquentadores em Lisboa - Assistência 24h/7',
  seo_description = 'Técnicos de Reparação de Esquentadores em Lisboa 24h/7 - Instalação, Manutênção e Arranjo de Esquentadores - Sáb, Dom e Feriados.'
WHERE slug = 'reparacao-de-esquentadores' AND seo_title IS NULL;

UPDATE services SET
  seo_title       = 'Reparação de Máquinas de Lavar Roupa em Lisboa 24h/7',
  seo_description = 'Técnicos de Reparação de Máquinas de Lavar Roupa em Lisboa 24h/7 - Assistência ao Domicílio 24h/7 - Sáb, Dom e Feriados.'
WHERE slug IN ('reparacao-de-maquina-de-lavar-roupa', 'reparacao-de-maquinas-de-lavar-roupa') AND seo_title IS NULL;

UPDATE services SET
  seo_title       = 'Vidraceiro em Lisboa – Vidros em Domicílio SOS 24H/7',
  seo_description = 'Buscando por Serviços de Vidraceiro em Lisboa? - Vidros Sob Medida com Urgência - Porta de Vidro, Janelas, Montras e Outros.'
WHERE slug = 'vidraceiro' AND seo_title IS NULL;

UPDATE services SET
  seo_title       = 'Eletricista em Lisboa – Serviços Elétricos SOS 24H/7',
  seo_description = 'Serviços de Eletricista em Lisboa 24h/7 - Profissionais em Instalação, Manutênção e Reparações Elétricas - Sáb, Dom e Feriados.'
WHERE slug = 'eletricista' AND seo_title IS NULL;

UPDATE services SET
  seo_title       = 'Canalizador em Lisboa – Instalação e Reparação SOS 24H/7',
  seo_description = 'Serviços de Canalizador em Lisboa 24h/7 - Instalação, Manutenção e Reparação de Canalização - Sáb, Dom e Feriados.'
WHERE slug = 'canalizador' AND seo_title IS NULL;

UPDATE services SET
  seo_title       = 'Desentupimentos em Lisboa - Serviços SOS 24H/7',
  seo_description = 'Serviços de desentupimentos em Lisboa 24h/7 - Alta Pressão e Mecanizados - Assistência Total - Sáb, Dom e Feriados.'
WHERE slug = 'desentupimentos' AND seo_title IS NULL;

UPDATE services SET
  seo_title       = 'Reparação de Autoclismos em Lisboa – Assistência 24H/7',
  seo_description = 'Serviço de Reparação de Autoclismos em Lisboa 24h/7 - Instalação, Manutênção e Reparação em Geral - Sáb, Dom e Feriados.'
WHERE slug = 'reparacao-de-autoclismos' AND seo_title IS NULL;

UPDATE services SET
  seo_title       = 'Reparação de Torneiras em Lisboa – Assistência SOS 24H/7',
  seo_description = 'Serviços de Reparação de Torneiras em Lisboa - Assistência em Geral 24H/7 - Sáb, Dom e Feriados. Todas as Marcas.'
WHERE slug = 'reparacao-de-torneiras' AND seo_title IS NULL;

UPDATE services SET
  seo_title       = 'Reparação de Termoacumuladores em Lisboa – Assistência 24H/7',
  seo_description = 'Serviço de Reparação de Termoacumuladores em Lisboa 24h/7 - Instalação, Manutênção e Reparação em Geral - Sáb, Dom e Feriados.'
WHERE slug = 'reparacao-de-termoacumuladores' AND seo_title IS NULL;

UPDATE services SET
  seo_title       = 'Reparação de Persianas em Lisboa – Assistência 24H/7',
  seo_description = 'Serviço de Reparação de Persianas em Lisboa 24h/7 - Instalação, Manutênção e Reparação em Geral - Sáb, Dom e Feriados.'
WHERE slug = 'reparacao-de-persianas' AND seo_title IS NULL;

UPDATE services SET
  seo_title       = 'Picheleiros em Lisboa – Assistência 24H/7',
  seo_description = 'Serviço de Picheleiros em Lisboa 24h/7 - Instalação, Manutênção e Reparação em Geral - Sáb, Dom e Feriados.'
WHERE slug = 'picheleiros' AND seo_title IS NULL;

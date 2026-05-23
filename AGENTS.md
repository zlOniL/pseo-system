# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Visão Geral

**BIB SEO Engine** — Sistema de geração programática de páginas SEO com IA. Gera HTML otimizado para SEO, valida a qualidade automaticamente e publica no WordPress. Suporta geração individual (V1) e geração em lote por cidade (V2).

Stack: **NestJS 11** (backend) + **Next.js 16 / React 19** (frontend) + **Supabase** (PostgreSQL) + **Google AI Studio / Gemini** (geração de conteúdo) + **WordPress** (publicação).

## Comandos

### Backend (`bib-backend/`)
```bash
npm run start:dev     # Dev com watch mode
npm run build         # Compilar TypeScript
npm run start:prod    # Produção
npm run lint          # ESLint + auto-fix
npm test              # Jest unit tests
npm run test:e2e      # Testes E2E
```

### Frontend (`bib-frontend/`)
```bash
npm run dev           # Dev server Next.js
npm run build         # Build de produção
npm run start         # Servir build
```

## Arquitetura

### Fluxo V1 — Geração Individual
```
POST /generate (service, city, keyword)
  → GenerationService: monta prompt (PAGE_GUIDE.md como system prompt)
  → AiService: chama Google AI via OpenRouter (Gemini 2.0 Flash)
  → ValidationService: score 0–100 (Estrutura 30% + SEO 40% + Conteúdo 30%)
  → ContentsService: persiste no Supabase (status: draft)
  → Frontend: exibe score, preview, issues
  → User aprova → WordpressService: publica no WP
```

### Fluxo V2 — Geração em Lote
```
POST /queue/enqueue (service_id + lista de cidades)
  → Cria rows na tabela queue (status: pending)
  → QueueWorker (polling background): processa um a um
  → Páginas salvas como draft em contents
  → User revisa em /contents e publica em lote
```

### Módulos do Backend
| Módulo | Caminho | Responsabilidade |
|---|---|---|
| `generation` | `src/generation/` | Orquestra o pipeline completo |
| `ai` | `src/ai/` | Chamadas à API Google AI (OpenRouter) |
| `validation` | `src/validation/` | Scoring de qualidade das páginas |
| `contents` | `src/contents/` | CRUD no Supabase |
| `wordpress` | `src/wordpress/` | Publicação via REST API do WP |
| `queue` | `src/queue/` | Fila de geração em lote + worker |
| `services` | `src/services/` | Base de serviços (V2) |
| `template-engine` | `src/template-engine/` | Processamento de templates HTML |
| `cities` | `src/cities/` | Dados de cidades/bairros + geração de links |
| `common` | `src/common/` | HTML assembler, slug utils, cliente Supabase |

### Rotas Frontend
| Rota | Função |
|---|---|
| `/generate` | Formulário de geração individual |
| `/contents` | Dashboard de revisão, aprovação e publicação |
| `/services` | Gestão de bases de serviço (V2) |
| `/services/:id/scale` | Interface de geração em lote |

### WordPress Plugin
- Ficheiro único: `wp-plugin/bib-seo-engine.php` (v1.6.0)
- Endpoints: `POST /wp-json/custom/v1/post`, `GET /wp-json/custom/v1/media`, `GET|POST /wp-json/custom/v1/wp-cats`

## Princípios de Design

- **Template Locked**: o HTML é fixo; a IA preenche apenas o conteúdo, nunca altera estrutura, classes CSS ou hierarquia de tags. Ver `PAGE_GUIDE.md` (system prompt enviado à IA).
- **Output da IA**: HTML puro — sem markdown, sem explicações, sem comentários.
- **Score mínimo**: páginas abaixo de 70 pontos devem ser regeneradas antes de publicar.

## Schema Supabase

**Tabela `contents`** — páginas geradas
- `id, service, city, neighborhood, main_keyword`
- `html, score, score_issues, status` (`draft` | `approved` | `published`)
- `wp_post_id, wp_post_url, video_url, images, related_services`

**Tabela `services`** — bases de serviço (V2)
- `id, name, slug, video_url, images` (JSONB), `related_services, service_notes, tone, min_words, status`

**Tabela `queue`** — fila de geração em lote (V2)
- `id, service_id, city, status` (`pending` | `processing` | `done` | `failed`)
- `content_id, error, attempts, started_at, finished_at`

Migrações: `bib-backend/supabase-migration.sql` (V1) e `bib-backend/supabase-migration-v2.sql` (V2).

## Variáveis de Ambiente (Backend)

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_AI_API_KEY
GOOGLE_AI_MODEL          # padrão: gemini-2.0-flash
WP_BASE_URL
WP_SECRET
WP_WHATSAPP_LINK
WP_PROXY_BASE            # opcional: proxy Vercel para bypass Imunify360
```

## Ficheiros de Documentação Importantes

- `PAGE_GUIDE.md` — System prompt completo enviado à IA (regras rígidas de estrutura)
- `SEO.md` — Mapeamentos de templates SEO por tipo de página
- `CITIES.md` — Dados de cidades e bairros para geo-targeting
- `FEATURE_SCALE.md` — Roadmap V2 com features de escala

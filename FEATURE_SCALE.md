# 🚀 BIB Programmatic SEO Engine — Programmatic SEO em Escala (V2)

## Problema Atual

O sistema atual é **linear e manual**: o utilizador preenche um formulário (serviço, cidade, vídeo, 8 imagens, serviços relacionados), a IA gera uma página, o utilizador avalia e publica. Para criar 200+ páginas de "Canalizadores em [cidade]", este processo teria de ser repetido 200 vezes — **inviável**.

## Objetivo

Transformar o sistema numa **engine de produção em escala**, onde:

1. O utilizador cria um **Serviço Base** uma única vez (com vídeo, imagens e configuração)
2. Seleciona cidades e **enfileira** a criação automática de páginas
3. A IA processa **em background** (sem depender da tela aberta)
4. O utilizador volta para **revisar, aprovar e publicar em massa**

---

## Visão Geral da Arquitetura

```
[Criar Serviço Base] → [Selecionar Cidades] → [Enfileirar Tasks]
                                                      ↓
                                              [Worker Background]
                                              
                                                      ↓
                                              [Gerar Página via IA]
                                                      ↓
                                              [Validar + Salvar]
                                              (status: draft)
                                                      ↓
                                              [Review + Approve]
                                                      ↓
                                              [Publicar em Massa]
                                              (WordPress)
```

---

## FASE 1 — Conceito de Serviço Base

### Conceito

Um **Serviço Base** representa toda a configuração reutilizável de um serviço. Ao criar "Canalizadores", o utilizador define **uma única vez**:

| Campo | Descrição | Obrigatório |
|-------|-----------|:-----------:|
| `name` | Nome do serviço (ex: "Canalizadores") | ✅ |
| `video_url` | URL do vídeo no WordPress | ✅ |
| `images` | Array de 1-8 URLs de imagens (ordem importa) | ✅ |
| `related_services` | Links para serviços complementares | ❌ |
| `service_notes` | Contexto técnico (ferramentas, marcas) | ❌ |
| `tone` | Tom do conteúdo | ❌ |
| `min_words` | Mínimo de palavras | ❌ |

Quando se geram páginas "Canalizadores em Lisboa", "Canalizadores em Cascais", etc., o sistema herda automaticamente o vídeo, imagens e configuração do Serviço Base — **sem reinserção manual**.

### Fluxo de Criação

```
1. Utilizador cria Serviço Base "Canalizadores"
   → Define vídeo, seleciona imagens (via modal WordPress)
   → Define serviços relacionados e notas técnicas
   
2. Gera uma "página base" do serviço SEM localidade
   → Útil para a página principal "Canalizadores" no site
   → Usa o flow existente de /generate mas pré-preenchido

3. Serviço Base fica disponível para geração em escala
```

### Tabela `services` (Nova)

```sql
CREATE TABLE IF NOT EXISTS services (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz   DEFAULT now() NOT NULL,
  name          text          NOT NULL UNIQUE,
  slug          text          NOT NULL UNIQUE,
  video_url     text,
  images        jsonb         DEFAULT '[]'::jsonb,
  related_services jsonb      DEFAULT '[]'::jsonb,
  service_notes text,
  tone          text          DEFAULT 'profissional, confiável e direto',
  min_words     int           DEFAULT 5000,
  status        text          NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'archived'))
);

CREATE INDEX IF NOT EXISTS services_name_idx ON services (name);
```

⚠️ A tabela `contents` existente ganha um campo `service_id uuid REFERENCES services(id)` para vincular as páginas geradas ao serviço base. Conteúdos existentes terão `service_id = NULL` (compatível).

### Backend — Novo Módulo `services/`

```
src/services/
├── services.module.ts
├── services.controller.ts
├── services.service.ts
└── dto/
    ├── create-service.dto.ts
    └── update-service.dto.ts
```

**Endpoints:**

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/services` | Criar Serviço Base |
| `GET` | `/services` | Listar serviços |
| `GET` | `/services/:id` | Detalhe do serviço |
| `PATCH` | `/services/:id` | Atualizar serviço |
| `DELETE` | `/services/:id` | Arquivar serviço |

### Frontend — Nova Página `/services`

- Lista de serviços criados (cards com nome, vídeo thumbnail, nº de imagens, nº de páginas geradas)
- Botão "+" para criar novo serviço
- Click no card abre detalhe com formulário de edição
- Do detalhe do serviço, botão **"Gerar Páginas por Cidade"** que leva ao fluxo de escala

---

## FASE 2 — Modal de Mídia WordPress

### Conceito

Ao invés de colar URLs manualmente, o utilizador abre um **modal** que lista toda a Media Library do WordPress com preview visual.

### WordPress Plugin — Novo Endpoint

Adicionar ao `bib-seo-engine.php`:

```php
// GET /wp-json/custom/v1/media?type=image&page=1&per_page=50
register_rest_route('custom/v1', '/media', [
    'methods'             => 'GET',
    'callback'            => 'bib_list_media',
    'permission_callback' => 'bib_authenticate',
]);

function bib_list_media(WP_REST_Request $request): WP_REST_Response {
    $type     = $request->get_param('type') ?? 'image';
    $page     = (int) ($request->get_param('page') ?? 1);
    $per_page = (int) ($request->get_param('per_page') ?? 50);
    $search   = $request->get_param('search') ?? '';

    $args = [
        'post_type'      => 'attachment',
        'post_status'    => 'inherit',
        'posts_per_page' => $per_page,
        'paged'          => $page,
        'orderby'        => 'date',
        'order'          => 'DESC',
    ];

    if ($type === 'video') {
        $args['post_mime_type'] = 'video';
    } else {
        $args['post_mime_type'] = 'image';
    }

    if (!empty($search)) {
        $args['s'] = $search;
    }

    $query = new WP_Query($args);
    $items = [];

    foreach ($query->posts as $post) {
        $item = [
            'id'        => $post->ID,
            'title'     => $post->post_title,
            'url'       => wp_get_attachment_url($post->ID),
            'mime_type' => $post->post_mime_type,
            'date'      => $post->post_date,
        ];

        if (strpos($post->post_mime_type, 'image') !== false) {
            $sizes = wp_get_attachment_image_src($post->ID, 'medium');
            $item['thumbnail'] = $sizes ? $sizes[0] : $item['url'];
        } else {
            $item['thumbnail'] = null;
        }

        $items[] = $item;
    }

    return new WP_REST_Response([
        'items'       => $items,
        'total'       => (int) $query->found_posts,
        'total_pages' => (int) $query->max_num_pages,
        'page'        => $page,
    ], 200);
}
```

### Backend — Proxy Endpoint

```
GET /wordpress/media?type=image&page=1&search=canalizador
```

O backend faz proxy para o WordPress (para não expor credenciais WP ao frontend):

```typescript
// src/wordpress/wordpress.controller.ts
@Get('media')
async listMedia(
  @Query('type') type: string,
  @Query('page') page: string,
  @Query('search') search: string,
) {
  return this.wordPressService.listMedia(type, Number(page) || 1, search);
}
```

### Frontend — Componente `MediaPickerModal`

```
app/_components/MediaPickerModal.tsx
```

**Comportamento:**

| Tipo | Seleção | UX |
|------|---------|-----|
| **Vídeo** | Seleção única (1 ficheiro) | Click seleciona, click novamente deseleciona. Botão "Confirmar" |
| **Imagens** | Seleção múltipla (1-8) | Click adiciona badge numérica (1, 2, 3...). A **ordem de click = ordem das imagens**. Click novamente remove e reordena. Botão "Confirmar (N selecionadas)" |

**Layout do modal:**
- Grid de thumbnails (4 colunas)
- Barra de pesquisa no topo
- Paginação ou scroll infinito
- Preview ampliado ao hover
- Badge numérica sobreposta nos selecionados (1, 2, 3... para imagens)
- Para vídeos: player preview inline

---

## FASE 3 — Sistema de Fila (Background Queue)

### Conceito

Fila **simples**, sem Redis, sem BullMQ. Apenas uma tabela `queue` no Supabase + loop encadeado no NestJS.
O worker é disparado apenas quando há trabalho (enqueue) ou no boot do servidor (retomar pendentes). Quando a fila esvazia, para automaticamente.

### Tabela `queue` (Nova)

```sql
CREATE TABLE IF NOT EXISTS queue (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz   DEFAULT now() NOT NULL,
  service_id    uuid          NOT NULL REFERENCES services(id),
  city          text          NOT NULL,
  status        text          NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  content_id    uuid          REFERENCES contents(id),
  error         text,
  started_at    timestamptz,
  finished_at   timestamptz,
  attempts      smallint      DEFAULT 0,
  
  UNIQUE(service_id, city)
);

CREATE INDEX IF NOT EXISTS queue_status_idx ON queue (status);
CREATE INDEX IF NOT EXISTS queue_service_idx ON queue (service_id);
```

### Backend — Novo Módulo `queue/`

```
src/queue/
├── queue.module.ts
├── queue.controller.ts
├── queue.service.ts
└── queue.worker.ts
```

#### `queue.service.ts` — CRUD da Fila

```typescript
@Injectable()
export class QueueService {
  async enqueue(serviceId: string, cities: string[]): Promise<QueueItem[]>
  async pickNext(): Promise<QueueItem | null>
  async markProcessing(id: string): Promise<void>
  async markDone(id: string, contentId: string): Promise<void>
  async markFailed(id: string, error: string): Promise<void>
  async findByService(serviceId: string): Promise<QueueItem[]>
  async getStats(): Promise<QueueStats>
}
```

#### `queue.worker.ts` — Worker com Loop Encadeado

O worker **não usa polling**. É disparado por evento (enqueue ou boot) e processa toda a fila sequencialmente. Quando não há mais items, para.

```typescript
@Injectable()
export class QueueWorker implements OnModuleInit {
  private isProcessing = false;

  // Ao iniciar o servidor, retoma items pendentes que ficaram na fila
  onModuleInit() {
    this.processQueue();
  }

  // Chamado pelo controller após enqueue — fire-and-forget
  async processQueue() {
    if (this.isProcessing) return; // Já está a correr
    this.isProcessing = true;

    try {
      while (true) {
        const item = await this.queue.pickNext();
        if (!item) break; // Fila vazia → para

        try {
          await this.queue.markProcessing(item.id);
          const service = await this.services.findById(item.service_id);

          const payload = {
            main_keyword: `${service.name} em ${item.city}`,
            service: service.name,
            city: item.city,
            video_url: service.video_url,
            images: service.images,
            related_services: service.related_services,
            service_notes: service.service_notes,
            tone: service.tone,
            min_words: service.min_words,
          };

          const content = await this.generation.generate(payload);
          await this.queue.markDone(item.id, content.id);
          this.logger.log(`✅ ${service.name} em ${item.city}`);
        } catch (err) {
          await this.queue.markFailed(item.id, (err as Error).message);
          this.logger.error(`❌ ${item.city}: ${(err as Error).message}`);
        }
      }
    } finally {
      this.isProcessing = false;
      this.logger.log('Fila vazia — worker parado.');
    }
  }
}
```

**Endpoints:**

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/queue/enqueue` | Enfileirar cidades para um serviço |
| `GET` | `/queue` | Listar toda a fila (com filtros) |
| `GET` | `/queue/stats` | Estatísticas (pending, processing, done, failed) |
| `GET` | `/queue/service/:serviceId` | Fila de um serviço específico |
| `DELETE` | `/queue/:id` | Remover da fila (se pending) |
| `POST` | `/queue/:id/retry` | Retentar um item falhado |

### `POST /queue/enqueue` — Payload

```json
{
  "service_id": "uuid-do-servico",
  "cities": ["Lisboa", "Cascais", "Sintra", "Amadora", "Oeiras"]
}
```

**Validações:**
- Ignorar cidades que já existem na fila para aquele serviço (UNIQUE constraint)
- Ignorar cidades que já têm conteúdo publicado para aquele serviço
- Retornar lista de items criados + lista de items ignorados (com motivo)

---

## FASE 4 — Frontend: Fluxo de Geração em Escala

### Nova Página `/services/:id/scale`

Tela central do Programmatic SEO:

```
┌─────────────────────────────────────────────────────────┐
│ ← Canalizadores                          [Serviço Base] │
├──────────────┬──────────────────────────────────────────┤
│              │                                          │
│  REGIÕES     │  FILA / PROGRESSO                       │
│              │                                          │
│  ☑ Lisboa    │  ┌─────────────────────────────────────┐ │
│  ☐ Porto     │  │ 📊 Pendentes: 45 | Processando: 1  │ │
│  ☐ Algarve   │  │    Concluídos: 12 | Falhados: 0    │ │
│  ☐ Braga     │  └─────────────────────────────────────┘ │
│              │                                          │
│  CIDADES     │  ✅ Canalizadores em Cascais      draft  │
│  (de Lisboa) │  ✅ Canalizadores em Oeiras       draft  │
│              │  ⏳ Canalizadores em Sintra   processing │
│  ☑ Cascais   │  ⏸ Canalizadores em Amadora     pending │
│  ☑ Oeiras    │  ⏸ Canalizadores em Almada      pending │
│  ☑ Sintra    │  ...                                     │
│  ☑ Amadora   │                                          │
│  ☐ Loures    │  [Selecionar Tudo] [Enfileirar 45]      │
│  ☐ ...       │                                          │
│              │                                          │
└──────────────┴──────────────────────────────────────────┘
```

- Checkbox por região (seleciona todas as cidades da região)
- Checkbox individual por cidade
- Indicador visual de cidades já geradas/em fila
- Polling a cada 10s para atualizar status
- Click numa task concluída abre `/contents/:id`

---

## FASE 5 — Publicação em Massa

### Backend — Novos Endpoints

```
POST /contents/bulk-approve
Body: { "ids": ["uuid1", "uuid2", ...] }

POST /contents/bulk-publish
Body: { "ids": ["uuid1", "uuid2", ...] }
```

### Frontend — Tabela de Conteúdos Melhorada

- **Filtros**: status (todos | draft | approved | published), serviço, cidade
- **Checkboxes** em cada row
- **Barra de ações bulk**:
  - "Aprovar N selecionados"
  - "Publicar N selecionados"
- **Indicador de progresso** durante bulk publish

---

## FASE 6 — Alterações na Tabela `contents`

### Migração SQL

```sql
ALTER TABLE contents ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES services(id);
ALTER TABLE contents ADD COLUMN IF NOT EXISTS content_type text 
  NOT NULL DEFAULT 'city_page'
  CHECK (content_type IN ('service_base', 'city_page'));

CREATE INDEX IF NOT EXISTS contents_service_id_idx ON contents (service_id);
CREATE INDEX IF NOT EXISTS contents_type_idx ON contents (content_type);
```

---

## Resumo de Arquivos

### Novos

| Camada | Arquivo | Descrição |
|--------|---------|-----------|
| Backend | `src/services/*` | Módulo CRUD de serviços |
| Backend | `src/queue/*` | Módulo de fila + worker |
| Frontend | `app/services/*` | Páginas de serviço |
| Frontend | `app/_components/MediaPickerModal.tsx` | Modal de mídia WP |
| WP Plugin | endpoint `/media` | Listar mídia |
| SQL | `supabase-migration-v2.sql` | Novas tabelas |

### Modificados

| Camada | Arquivo | Alteração |
|--------|---------|-----------|
| Backend | `app.module.ts` | Importar novos módulos |
| Backend | `contents.service.ts` | `service_id`, `content_type` |
| Backend | `contents.controller.ts` | Bulk endpoints |
| Backend | `wordpress.*` | Media proxy, bulk publish |
| Frontend | `contents/page.tsx` | Filtros, bulk actions |
| Frontend | `UnifiedLayout.tsx` | MediaPickerModal |
| Frontend | `layout.tsx` | Nav: "Serviços" |
| Frontend | `lib/api.ts` | Novos endpoints |

---

## Ordem de Implementação

1. SQL — Criar tabelas `services` e `queue`, alterar `contents`
2. Backend — ServicesModule (CRUD completo)
3. WP Plugin — Endpoint GET /media
4. Backend — Proxy media no WordPressService
5. Frontend — MediaPickerModal componente
6. Frontend — Páginas /services, /services/new, /services/[id]
7. Backend — CitiesController (expor API de cidades)
8. Backend — QueueModule + QueueWorker
9. Frontend — Tela /services/[id]/scale
10. Backend — Bulk approve/publish
11. Frontend — Melhorar /contents (filtros, checkboxes, bulk)
12. Integrar MediaPickerModal no UnifiedLayout existente

---

## Decisões de Simplicidade

| Aspecto | MVP | Futuro |
|---------|-----|--------|
| Fila | Loop encadeado + Supabase | BullMQ + Redis |
| Concorrência | 1 task por vez | Workers paralelos |
| Polling | Frontend 10s | SSE / WebSocket |
| Media cache | Sem cache | Cache local thumbnails |
| Rate limit IA | Delay natural | Rate limiter |
| Retry | Manual | Auto-retry com backoff |
| Monitoring | Console logs | Dashboard métricas |

---

**Fim do documento — Programmatic SEO em Escala V2**

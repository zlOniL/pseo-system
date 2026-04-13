# 🚀 FEATURE — Geração de Páginas por Template + Categorização WordPress

## 🎯 Objetivo

Adicionar uma nova funcionalidade ao sistema que permita gerar páginas SEO em escala **sem uso de IA**, utilizando templates HTML pré-definidos por serviço.

Essa feature tem como foco:

* Automatizar um processo manual atual (duplicação + edição no WordPress)
* Permitir geração em massa via `/scale`
* Manter compatibilidade com a arquitetura existente (fila, conteúdos, publicação)
* Garantir categorização automática correta no WordPress

---

# 🧱 Visão Geral da Feature

## Novo modo de geração:

O sistema passa a ter dois modos:

| Modo        | Descrição                              |
| ----------- | -------------------------------------- |
| 🤖 IA       | Geração completa via IA                |
| 📄 Template | Clone de template + replace de keyword |

---

## Fluxo Geral

```
/services → selecionar serviço
        ↓
/services/:id/scale
        ↓
Selecionar cidades/bairros
        ↓
Escolher modo:
   [Gerar com IA] ou [Gerar com Template]
        ↓
Criar fila
        ↓
Worker processa:
   → IA OU Template
        ↓
Salvar em contents (draft)
        ↓
Review → Approve → Publish
```

---

# 📁 Estrutura de Templates

## Nova pasta no backend:

```
/templates/
  ├── reparacao-de-janelas-em-lisboa.html
  ├── canalizadores-em-lisboa.html
  └── ...
```

## Regras:

* 1 template por serviço
* Nome baseado na keyword base
* HTML completo
* Estrutura 100% fixa (Template Locked)

---

# ⚙️ Engine de Geração por Template

## Novo módulo:

```
src/template-engine/
├── template-engine.module.ts
├── template-engine.service.ts
└── utils/
    ├── keyword-replacer.ts
    └── backlinks-builder.ts
```

---

## 1. Leitura do Template

```ts
loadTemplate(serviceSlug: string): string
```

* Busca arquivo em `/templates`
* Retorna HTML completo

---

## 2. Substituição de Keyword

### Regra:

Substituição simples baseada em:

```
"em {CidadeBase}" → "em {NovaLocalidade}"
```

### Exemplo:

```
Template: Reparação de Janelas em Lisboa
Output:   Reparação de Janelas em Ajuda
```

### Implementação:

```ts
replaceKeyword(html, baseCity, targetLocation)
```

⚠️ Apenas replace de string — sem IA

---

## 3. Bloco Dinâmico de Backlinks

## Problema

Templates não possuem bloco dinâmico nativo.

## Solução

Inserção dinâmica via placeholder:

```html
<div id="dynamic-neighborhood-links"></div>
```

---

## Fonte de dados

Arquivo: `CITIES.md`

Estrutura:

```
Lisboa
Lisboa - Ajuda - Alcântara - ...
```

---

## Lógica

```ts
getNeighborhoods(city: string): string[]
```

---

## Geração dos links

Formato:

```
/{slug-da-keyword}
```

Exemplo:

```
/reparacao-de-janelas-em-alcantara
/reparacao-de-janelas-em-alvalade
```

---

## Inserção no HTML

```ts
injectBacklinks(html, linksHtml)
```

---

# 🔁 Integração com Fila (Queue)

## Alteração no payload da fila

```json
{
  "service_id": "uuid",
  "city": "Ajuda",
  "mode": "template" // ou "ai"
}
```

---

## Worker

```ts
if (item.mode === 'template') {
  const html = await templateEngine.generate({
    service,
    city: item.city
  });
}
```

---

## Regras

* Processamento sequencial (igual IA)
* Compatível com sistema atual
* Sem paralelismo

---

# 🗄️ Alterações no Banco

## Tabela `queue`

Adicionar campo:

```sql
ALTER TABLE queue ADD COLUMN mode text 
CHECK (mode IN ('ai', 'template')) DEFAULT 'ai';
```

---

## Tabela `services`

Adicionar campo:

```sql
ALTER TABLE services ADD COLUMN wordpress_category text;
```

---

# 🧠 Categorização WordPress

## Problema

Atualmente páginas não são categorizadas automaticamente.

---

## Solução

Mover controle de categoria para o **Serviço Base**.

---

## Novo campo no serviço:

```
wordpress_category
```

Exemplo:

```
Janelas
Canalizadores
Desentupimentos
```

---

## Backend → WordPress

Ao publicar:

### Fluxo:

1. Buscar categoria no WP
2. Se não existir → criar
3. Associar post à categoria
4. Garantir vínculo com categoria pai "Blog"

---

## WordPress Plugin — Novos Endpoints

### Buscar categorias:

```http
GET /wp-json/custom/v1/categories
```

---

### Criar categoria:

```http
POST /wp-json/custom/v1/categories
Body:
{
  "name": "Janelas",
  "parent": "Blog"
}
```

---

## Backend Service

```ts
ensureCategoryExists(name: string): Promise<number>
```

Retorna:

```
category_id
```

---

## Publicação

```ts
POST /post
{
  title,
  content,
  categories: [blogId, categoryId]
}
```

---

# 🎨 Frontend

## 1. /scale (Atualização)

Adicionar:

```
[ Gerar com IA ]   [ Gerar com Template ]
```

---

## 2. Service Form

Adicionar campo:

```
Categoria WordPress (select)
```

### Comportamento:

* Lista categorias do WP
* Permite criar nova
* Salva no serviço

---

# 🔁 Compatibilidade com Sistema Atual

| Feature       | Impacto         |
| ------------- | --------------- |
| IA generation | Nenhum          |
| Queue         | Apenas extensão |
| Contents      | Reutilizado     |
| WordPress     | Melhorado       |
| Frontend      | Pequena mudança |

---

# ⚠️ Limitações (aceitas)

* Conteúdo duplicado (intencional)
* Replace simples (sem inteligência)
* Sem variação de texto
* Sem proteção SEO

---

# 🚀 Benefícios

* Geração extremamente rápida
* Zero custo de IA
* Automação de processo manual
* Escala imediata (500+ páginas)
* Integração total com fluxo existente

---

# 📌 Ordem de Implementação

1. Criar pasta `/templates`
2. Criar TemplateEngine (load + replace)
3. Criar parser de CITIES.md
4. Criar builder de backlinks
5. Adicionar placeholder no HTML
6. Integrar com queue (mode)
7. Atualizar worker
8. Criar campo wordpress_category
9. Criar endpoints WP categorias
10. Integrar categorização na publicação
11. Atualizar frontend (/scale + service form)

---

# 💥 Conclusão

Essa feature transforma o sistema em um **motor híbrido de geração**:

* IA → qualidade
* Template → velocidade e escala

Mantendo:

* arquitetura desacoplada
* controle no backend
* consistência estrutural

E adicionando:

* automação real de produção em massa
* padronização de publicação no WordPress

---

**Fim do documento — Feature Template + WP Categories**

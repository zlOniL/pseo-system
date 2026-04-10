# 🚀 BIB Programmatic SEO Engine — Plano de Desenvolvimento do MVP (V1)

## 🎯 Objetivo

Definir um plano técnico e incremental para construir o MVP desde a base até uma V1 funcional, priorizando:

* Entrega rápida de valor
* Simplicidade de implementação
* Escalabilidade futura

---

# 🧱 FASE 0 — SETUP INICIAL

## Objetivo

Preparar ambiente e stack base.

## Backend (NestJS)

* Criar projeto
* Configurar módulos básicos
* Setup ENV (OpenRouter, Supabase, WP)

## Frontend (Next.js)

* Criar projeto
* Setup layout base

## Supabase

* Criar projeto
* Configurar acesso via SDK

---

# 🧠 FASE 1 — GERAÇÃO DE CONTEÚDO (CORE)

## Objetivo

Gerar HTML a partir de input do usuário.

## Backend

### 1. Prompt Builder

Criar função:

```ts
buildPrompt(input)
```

Inputs:

* main_keyword
* service
* city

Composição:

* SYSTEM.md
* SKILL.md
* Input do usuário

---

### 2. Integração com IA (OpenRouter)

Criar service:

```ts
ai.service.ts
```

Responsável por:

* enviar prompt
* receber resposta
* tratar erro/timeout

---

### 3. Endpoint de geração

```http
POST /generate
```

Retorna:

* html

---

## Frontend

### Tela de geração

Campos:

* Serviço
* Cidade
* Palavra-chave

Ação:

* Botão “Gerar Página”

---

## Resultado da Fase

✔ Página HTML gerada
✔ Fluxo manual funcionando

---

# 🧪 FASE 2 — VALIDAÇÃO E SCORE

## Objetivo

Garantir qualidade mínima automática.

## Backend

### Engine de validação

Criar módulo:

```ts
validation/
```

Regras:

#### Estrutura

* H1 presente
* H2 obrigatórios
* ordem correta

#### SEO

* keyword no H1
* presença no conteúdo

#### Conteúdo

* mínimo de palavras

---

### Score

Retorno:

```json
{
  "score": 0-100,
  "issues": []
}
```

---

## Frontend

Mostrar:

* Score
* Lista de problemas

Ações:

* Aprovar
* Regenerar

---

## Resultado da Fase

✔ Conteúdo avaliado automaticamente
✔ Feedback claro para usuário

---

# 🔁 FASE 3 — REGENERAÇÃO

## Objetivo

Permitir melhoria do conteúdo sob demanda.

## Backend

### Endpoint

```http
POST /regenerate
```

Input:

* html atual
* feedback do usuário

Regras:

* considerar apenas SEO/estrutura

---

## Frontend

Campo:

* "O que melhorar?"

---

## Resultado da Fase

✔ Iteração rápida de conteúdo

---

# 📦 FASE 4 — INTEGRAÇÃO WORDPRESS

## Objetivo

Publicar páginas.

## WordPress Plugin

Endpoint:

```http
POST /wp-json/custom/v1/post
```

---

## Backend

Service:

```ts
wordpress.service.ts
```

---

## Frontend

Botão:

* "Publicar"

---

## Resultado da Fase

✔ Conteúdo no ar

---

# 🧠 FASE 5 — BANCO DE DADOS

## Objetivo

Persistir dados.

## Tabelas

### contents

* id
* html
* score
* status

---

## Resultado

✔ Histórico salvo

---

# 🔁 FASE 6 — FILA (BATCH GENERATION)

## Objetivo

Escalar geração.

## Banco

### jobs

* id
* status
* total
* processed

### tasks

* id
* job_id
* input
* status

---

## Backend

### Worker

Loop:

```ts
setInterval(...)
```

Processa:

* 1 task por vez

---

## Frontend

### Tela de Jobs

* progresso
* status

---

## Resultado

✔ Geração em massa
✔ Execução noturna possível

---

# 🎨 FASE 7 — UX DE REVISÃO

## Objetivo

Melhorar operação.

## Frontend

Lista:

* páginas geradas
* score

Ações:

* preview
* regenerar
* publicar

---

## Resultado

✔ Workflow completo

---

# 🚀 V1 FINAL

O sistema entrega:

* Geração de páginas SEO
* Validação automática
* Score
* Regeneração
* Publicação
* Geração em lote

---

# ⏱️ ORDEM DE IMPLEMENTAÇÃO

1. Prompt + geração
2. Endpoint /generate
3. Preview
4. Validação
5. Regeneração
6. WordPress
7. Banco
8. Fila

---

# 💥 CONCLUSÃO

Este plano permite sair de 0 → MVP funcional rapidamente,
sem comprometer a base do produto.

Foco:

* Simplicidade
* Controle
* Qualidade

---

**Fim do documento — MVP Development Plan V1**

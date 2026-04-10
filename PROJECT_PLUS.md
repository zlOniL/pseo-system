# 🧠 BIB Programmatic SEO Engine — Visão Geral do Projeto (V1)

## 🎯 Objetivo do Projeto

Construir uma engine de Programmatic SEO capaz de gerar páginas HTML otimizadas, escaláveis e consistentes, utilizando IA como ferramenta de preenchimento de conteúdo — sem permitir que a IA tenha controle estrutural.

---

## 🧱 Arquitetura Geral (DESACOPLADA)

O sistema é dividido em 5 pilares independentes:

---

### 1. Backend Core (NestJS)

Responsável por:

* Construção de prompts
* Integração com IA (OpenRouter)
* Validação e scoring
* Gerenciamento de fila (jobs/tasks)
* Regras de negócio

⚠️ NÃO depende do WordPress

---

### 2. Frontend (Next.js)

Responsável por:

* Iniciar geração de páginas
* Acompanhar progresso
* Revisar conteúdo

---

### 3. Banco de Dados (Supabase)

Responsável por:

* Persistência de jobs, tasks e conteúdos

---

### 4. Plugin WordPress (INTEGRAÇÃO)

Responsável por:

* Receber HTML via API
* Criar posts

Exemplo:

```http
POST /wp-json/custom/v1/post
```

⚠️ NÃO contém lógica de IA
⚠️ NÃO valida conteúdo
⚠️ NÃO gera páginas

👉 Atua apenas como ADAPTADOR

---

### 5. CMS (WordPress)

Responsável por:

* Exibir conteúdo

---

## 🔌 Princípio de Desacoplamento

O sistema é CMS-agnostic.

Isso permite:

* Substituir WordPress
* Integrar com outros CMS
* Escalar produto como SaaS

---

## 🧠 Princípios Fundamentais

### 🔒 Template Locked

* HTML fixo
* IA não altera estrutura

### 🎨 Identidade Visual Fixa

* CSS imutável

### 🧠 IA como Preenchedor

* Só escreve texto

### 🔁 Reescrita Controlada

* Similaridade ~75%

### 📈 SEO como Core

* Keyword no H1, H2, conteúdo

---

## 📦 Output

* HTML completo
* Pronto para CMS

---

## 🚀 Objetivo do MVP

* Validar geração
* Validar qualidade
* Validar escala

---

**Versão Atualizada com Arquitetura Desacoplada**

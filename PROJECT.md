# 🧠 BIB Programmatic SEO Engine — Visão Geral do Projeto (V1)

## 🎯 Objetivo do Projeto

Construir uma engine de Programmatic SEO capaz de gerar páginas HTML otimizadas, escaláveis e consistentes, utilizando IA como ferramenta de preenchimento de conteúdo — sem permitir que a IA tenha controle estrutural.

O sistema deve:

* Gerar páginas com alta qualidade SEO
* Manter consistência estrutural e visual
* Permitir escala (múltiplas cidades/bairros)
* Validar automaticamente o conteúdo gerado
* Integrar com CMS (WordPress inicialmente, mas desacoplado)

---

## 🧱 Arquitetura Geral

O sistema é dividido em 4 pilares principais:

### 1. Backend (NestJS)

Responsável por:

* Construção de prompts
* Integração com IA (OpenRouter)
* Validação e scoring
* Gerenciamento de fila (jobs/tasks)
* Regras de negócio

---

### 2. Frontend (Next.js)

Responsável por:

* Iniciar geração de páginas
* Acompanhar progresso de jobs
* Visualizar páginas geradas
* Aprovar, regenerar ou publicar conteúdo

---

### 3. Banco de Dados (Supabase)

Responsável por:

* Armazenamento de jobs, tasks e conteúdos
* Controle de status e progresso
* Base para futura escalabilidade

---

### 4. CMS (WordPress)

Responsável por:

* Publicação final das páginas
* Exibição do conteúdo

⚠️ Importante:
A arquitetura deve ser desacoplada do WordPress, permitindo integração futura com qualquer outro CMS.

---

## 🧠 Princípios Fundamentais

### 🔒 1. Template Locked (Estrutura fixa)

* A estrutura HTML NUNCA pode ser alterada pela IA
* A IA apenas substitui textos
* Ordem de seções é obrigatória

---

### 🎨 2. Identidade Visual Imutável

* Classes CSS não devem ser alteradas
* Estrutura visual deve permanecer idêntica
* CTAs devem manter posição fixa

---

### 🧠 3. IA como Preenchedor, não Criador

A IA:

* NÃO decide layout
* NÃO cria estrutura
* NÃO altera HTML

A IA:

* Preenche conteúdo textual
* Usa sinônimos e variações
* Adapta contexto (cidade/bairro)

---

### 🔁 4. Reescrita Controlada

* Similaridade alvo: ~75%
* Estrutura idêntica
* Conteúdo adaptado
* Uso de sinônimos e variações

---

### 📈 5. SEO como Core

Toda página deve seguir:

* Palavra-chave principal no H1
* Presença em H2 (com variações)
* Distribuição natural no texto
* Conteúdo relevante e contextual

---

## ⚙️ Tipos de Página

### 🏠 Home

* Lista serviços
* Inicia estrutura de links

---

### 🔧 Página de Serviço (Base)

* Foco no serviço
* Sem localidade na keyword principal

---

### 🌆 Serviço + Cidade

* Keyword principal: serviço + cidade
* Alta repetição estratégica
* Variações com sinônimos

---

### 🏘 Bairro

* Keyword: serviço + bairro
* Sempre associado a cidade

---

## 🧠 Sistema de Prompt

O sistema utiliza prompts modulares:

* `SYSTEM.md` → regras rígidas
* `SKILL.md` → comportamento da IA
* `EXAMPLES.md` → exemplos reais

---

## 🧪 Engine de Validação

Cada página gerada passa por:

### ✔ Estrutura

* Presença de H1, H2, seções
* Ordem correta

### ✔ SEO

* Keyword no H1
* Distribuição no texto

### ✔ Conteúdo

* Quantidade mínima
* Coerência

---

## 📊 Sistema de Score

Score de 0 a 100 baseado em:

* Estrutura (30%)
* SEO (40%)
* Conteúdo (30%)

---

## 🔁 Sistema de Fila (Batch Generation)

### Funcionamento:

1. Usuário envia lista de cidades/bairros
2. Sistema cria um JOB
3. Cada item vira uma TASK
4. Worker processa 1 por vez

---

### Regras:

* Execução sequencial (MVP)
* Ideal para execução noturna
* Cada página fica disponível após conclusão

---

## 🔁 Regeneração

* Fora da fila
* Executada sob demanda
* Pode receber feedback do usuário

⚠️ Restrições:

* Apenas melhorias de SEO/estrutura
* Ignorar mudanças visuais

---

## 📦 Output do Sistema

A saída da IA deve ser SEMPRE:

* HTML completo
* Estrutura intacta
* Pronto para publicação no WordPress

---

## 🚫 Restrições Críticas

A IA NÃO pode:

* Alterar estrutura HTML
* Remover seções
* Criar novos blocos
* Alterar identidade visual

---

## 🚀 Objetivo do MVP

Validar:

* Geração consistente de páginas
* Qualidade SEO automatizada
* Escalabilidade via batch
* Fluxo de revisão eficiente

---

## 🔮 Visão de Futuro (V2+)

* RAG para enriquecimento
* Geração paralela
* Integração multi-CMS
* IA mais avançada
* Automação de publicação

---

## 💥 Resumo

Este projeto não é apenas um gerador de conteúdo.

É uma **engine de produção de páginas SEO escaláveis**, onde:

* A IA executa
* O sistema controla
* A qualidade é validada automaticamente

---

**Fim do documento — Versão V1 (Base Estratégica)**

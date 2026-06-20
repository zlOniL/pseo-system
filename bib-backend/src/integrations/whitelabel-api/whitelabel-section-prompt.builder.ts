import { GenerateTemplateDto } from '../../services/dto/generate-template.dto';
import { Service } from '../../services/services.service';
import {
  HtmlSectionKey,
  SECTION_KEYS,
} from '../../service-templates/service-templates.types';
import { buildExternalSlug } from './whitelabel-json';
import {
  PromptContext,
  SERVICE_EXAMPLE_USAGE_RULE,
} from '../../prompt-context/prompt-context.types';
import { WHITELABEL_INLINE_LINK_RULES } from './whitelabel-link-rules';

export interface WhitelabelSectionPromptInput {
  service: Service;
  baseCity: string | null;
  isMainPage: boolean;
  blueprints: Record<string, unknown>;
  dto: GenerateTemplateDto;
  sectionKey: HtmlSectionKey;
  targetWords: number;
  minimumWords: number;
  maximumWords: number;
  generatedSummary?: string;
  promptContext?: PromptContext;
}

export interface WhitelabelSectionExpansionPromptInput extends WhitelabelSectionPromptInput {
  currentSection: unknown;
  currentWords: number;
}

function mainKeyword(input: {
  service: Service;
  baseCity: string | null;
  isMainPage: boolean;
}): string {
  return input.isMainPage
    ? input.service.name
    : `${input.service.name} em ${input.baseCity}`;
}

function geoRule(input: {
  baseCity: string | null;
  isMainPage: boolean;
}): string {
  if (input.isMainPage) {
    return `- Esta e uma pagina principal de servico, NAO e uma pagina local.
- Nao uses "em [Nome da Cidade]", "em {{CITY}}", "em ${input.baseCity ?? 'Lisboa'}" nem placeholders geograficos.
- Fora da secao contexto_local, nao menciones nomes de cidades, localidades ou bairros.
- Na secao contexto_local, segue a instrucao especifica do Modulo 12 e gera "Zonas de Atendimento" com Grande Lisboa, Margem Sul, Grande Porto, Braga e Algarve.
- Se os blueprints tiverem placeholders de cidade, ignora-os para esta pagina principal.`;
  }

  return `- Esta e uma pagina local.
- Usa a cidade base "${input.baseCity ?? ''}" quando houver cidade.
- Fora da secao contexto_local, evita bairros, ruas, monumentos ou locais especificos.
- Na secao contexto_local, segue a instrucao especifica do Modulo 12 e cria contexto local forte com freguesias, bairros, ruas, pracas, avenidas e referencias reais da localidade.`;
}

function sharedInput(input: {
  service: Service;
  baseCity: string | null;
  isMainPage: boolean;
  dto: GenerateTemplateDto;
}): Record<string, unknown> {
  return {
    service: input.service.name,
    main_keyword: mainKeyword(input),
    base_city: input.baseCity,
    is_main_page: input.isMainPage,
    tone: input.service.tone,
    min_words: input.service.min_words ?? 5000,
    service_notes: input.dto.service_notes ?? input.service.service_notes ?? '',
    related_services:
      input.dto.related_services ?? input.service.related_services ?? [],
  };
}

function sectionContract(
  sectionKey: HtmlSectionKey,
  input: WhitelabelSectionPromptInput,
): string {
  if (sectionKey === 'intro') {
    return `Retorna JSON valido neste formato:
{
  "section_key": "intro",
  "content": {
    "topbar": { "left": ["frase curta", "frase curta"] },
    "hero": {
      "badge": "string",
      "h1": "string",
      "intro": "texto introdutorio rico",
      "cta_label": "Pedir assistencia",
      "bullets_title": "O que inclui",
      "bullets": ["item", "item", "item"]
    },
    "form": {
      "title": "string",
      "description": "string"
    }
  }
}`;
  }

  if (sectionKey === 'perguntas_frequentes') {
    return `Retorna JSON valido neste formato:
{
  "section_key": "perguntas_frequentes",
  "content": [
    { "question": "pergunta", "answer": "resposta completa" }
  ]
}
Gera varias perguntas e respostas uteis.`;
  }

  const spec = articleSectionSpec(sectionKey, input);
  return `Retorna JSON valido neste formato:
{
  "section_key": "${sectionKey}",
  "content": [
    { "type": "heading", "text": "${spec.heading}" },
    { "type": "paragraph", "text": "paragrafo desenvolvido" },
    { "type": "callout", "text": "destaque util" },
    { "type": "list", "items": ["item", "item"] }
  ]
}
Usa apenas blocos suportados: heading, paragraph, callout, list, faq_list.
Objetivo obrigatorio desta secao:
${spec.instructions}`;
}

function articleSectionSpec(
  sectionKey: HtmlSectionKey,
  input: WhitelabelSectionPromptInput,
): {
  heading: string;
  instructions: string;
} {
  switch (sectionKey) {
    case 'assistencia_especializada':
      return {
        heading: 'Assistencia Especializada',
        instructions:
          '- Explicar por que o servico deve ser feito por tecnicos especializados.\n- Mostrar que a avaria pode ter varias causas.\n- Reforcar diagnostico tecnico, seguranca, durabilidade e evitar trocas desnecessarias.',
      };
    case 'tipos':
      return {
        heading: 'Tipos do Servico',
        instructions:
          '- Listar e explicar os principais tipos relacionados ao servico.\n- Usar subtitulos ou blocos de lista quando fizer sentido.\n- Adaptar sempre ao servico pedido.',
      };
    case 'servicos':
      return {
        heading: 'Servicos Realizados',
        instructions:
          '- Explicar de forma completa os servicos realizados.\n- Incluir servicos mais procurados, manutencao, assistencia urgente e diagnostico antes do orcamento.\n- Incluir marcas e componentes compativeis quando for util, sem inventar URLs.',
      };
    case 'avarias_comuns':
      return {
        heading: 'Principais Problemas que Resolvemos',
        instructions:
          '- Criar problemas/avarias reais do servico.\n- Para cada problema, explicar causa provavel, consequencia e solucao.\n- Evitar texto generico curto.',
      };
    case 'como_funciona':
      return {
        heading: 'Como Funciona o Nosso Servico',
        instructions:
          '- Explicar o passo a passo do atendimento.\n- Incluir contacto, fotos/videos, diagnostico no local, solucao, orcamento antecipado, reparacao e testes finais.',
      };
    case 'servico_24h':
      return {
        heading: 'Servico 24H/7',
        instructions:
          '- Focar urgencia, sabados, domingos e feriados.\n- Explicar avarias que nao podem esperar.\n- Reforcar piquetes moveis, diagnostico antes da intervencao e servico sem improvisos.',
      };
    case 'prevencao':
      return {
        heading: 'Manutencao e Prevencao',
        instructions:
          '- Explicar manutencao preventiva.\n- Mostrar sinais pequenos que devem ser resolvidos cedo.\n- Incluir acoes praticas para evitar custos maiores.',
      };
    case 'reparar_ou_substituir':
      return {
        heading: 'Reparar ou Substituir?',
        instructions:
          '- Ajudar o cliente a decidir.\n- Reforcar que reparar com seguranca e a primeira opcao quando viavel.\n- Explicar quando substituicao e mais adequada.',
      };
    case 'por_que_escolher':
      return {
        heading: 'Por Que Escolher a Empresa',
        instructions:
          '- Construir confianca comercial.\n- Incluir tecnicos qualificados, atendimento 24H/7, diagnostico, orcamento justo, materiais de qualidade, testes finais e transparencia.',
      };
    case 'integracao_servicos':
      return {
        heading: 'Integracao com Outros Servicos',
        instructions:
          '- Ligar o servico principal a servicos complementares.\n- Se houver related_services, usar apenas esses nomes e URLs.\n- Se nao houver, citar servicos naturalmente sem links.',
      };
    case 'contexto_local':
      return {
        heading: input.isMainPage
          ? 'Zonas de Atendimento'
          : `Contexto Local em ${input.baseCity ?? ''}`.trim(),
        instructions:
          '- Se for pagina principal, o heading deve ser exatamente "Zonas de Atendimento".\n- Para pagina principal, incluir Grande Lisboa, Margem Sul, Grande Porto, Braga e Algarve.\n- Para pagina principal, incluir links externos para Paginas Amarelas (https://www.pai.pt/) e Portal Autarquico (https://portalautarquico.dgal.gov.pt/).\n- Se for pagina local, o heading deve ser exatamente "Contexto Local em [Localidade]".\n- Para pagina local, criar contexto local forte com freguesias, bairros, ruas conhecidas, pracas, avenidas, pontos de referencia, zonas residenciais e comerciais, perfil do local, tipos de imoveis e necessidades provaveis do servico.\n- Para pagina local, incluir 2 backlinks externos locais relevantes apenas quando o URL for real e conhecido.\n- Nao misturar localidades.',
      };
    case 'contacte_empresa':
      return {
        heading: 'Contacte a Empresa',
        instructions:
          '- Criar CTA forte.\n- Repetir keyword e variacoes naturais.\n- Reforcar problemas resolvidos, tecnicos especializados, materiais, diagnostico, orcamento e servico 24H/7.',
      };
    case 'mais_sobre':
      return {
        heading: 'Mais Sobre o Servico',
        instructions:
          '- Fechamento SEO forte, explicativo e humano.\n- Falar sobre importancia do servico, pequenas avarias, agir cedo, manutencao e diagnostico.\n- Incluir Google.pt e ChatGPT.com apenas com URLs reais quando fizer sentido.',
      };
    case 'intro':
    case 'perguntas_frequentes':
      throw new Error(`Unexpected article section: ${sectionKey}`);
  }
}

export function buildWhitelabelPageMetadataPrompt(input: {
  service: Service;
  baseCity: string | null;
  isMainPage: boolean;
  blueprints: Record<string, unknown>;
  dto: GenerateTemplateDto;
  promptContext?: PromptContext;
}): { system: string; user: string } {
  const keyword = mainKeyword(input);
  const slug = buildExternalSlug(
    input.service.name,
    input.baseCity ?? undefined,
  );

  const system = `Es um especialista em SEO programatico e integracoes whitelabel.
Gera apenas JSON valido, sem markdown e sem comentarios.`;

  const user = `Cria apenas os metadados da pagina.

Contexto do site via blueprints:
${JSON.stringify(input.blueprints, null, 2)}
${promptContextRules(input.promptContext)}

Input:
${JSON.stringify(sharedInput(input), null, 2)}

Regras:
${geoRule(input)}
- O titulo principal deve ser "${keyword}".
- O slug deve ser "${slug}".
- Nao geres sections nesta chamada.

Retorna exatamente:
{
  "page": {
    "title": "${keyword}",
    "slug": "${slug}",
    "seo_title": "string ate 255 caracteres",
    "seo_description": "string ate 500 caracteres",
    "home_card_title": "string curta",
    "home_card_excerpt": "resumo curto",
    "home_card_icon": "1-3 letras",
    "related_pages_json": ["slug-relacionado"]
  }
}`;

  return { system, user };
}

export function buildWhitelabelSectionPrompt(
  input: WhitelabelSectionPromptInput,
): { system: string; user: string } {
  const system = `Es um especialista em SEO programatico e redacao em portugues europeu.
Gera apenas JSON valido, sem markdown e sem comentarios.
Nao geres HTML completo.`;

  const user = `Gera somente a secao "${input.sectionKey}" para uma pagina whitelabel.

Contexto do site via blueprints:
${JSON.stringify(input.blueprints, null, 2)}
${promptContextRules(input.promptContext)}

Input:
${JSON.stringify(sharedInput(input), null, 2)}

Regras gerais:
${geoRule(input)}
- Esta chamada deve gerar apenas a secao "${input.sectionKey}".
- Volume alvo desta secao: aproximadamente ${input.targetWords} palavras visiveis.
- Faixa aceitavel desta secao: entre ${input.minimumWords} e ${input.maximumWords} palavras visiveis.
- Nao ultrapasses ${input.maximumWords} palavras visiveis salvo se for indispensavel para cumprir o contrato da secao.
- Escreve conteudo especifico, tecnico, natural e util.
- Mantem portugues europeu.
- Evita repeticoes com secoes ja geradas.
- Nao inventes URLs.
- Nao uses markdown.
${WHITELABEL_INLINE_LINK_RULES}
${input.dto.feedback ? `\nFeedback geral a aplicar:\n${input.dto.feedback}` : ''}
${input.generatedSummary ? `\nResumo das secoes ja geradas para evitar repeticao:\n${input.generatedSummary}` : ''}

Contrato de saida:
${sectionContract(input.sectionKey, input)}`;

  return { system, user };
}

export function buildWhitelabelSectionExpansionPrompt(
  input: WhitelabelSectionExpansionPromptInput,
): { system: string; user: string } {
  const system = `Es um editor SEO senior.
Gera apenas JSON valido, sem markdown e sem comentarios.`;

  const user = `Expande e melhora somente a secao "${input.sectionKey}".

Input:
${JSON.stringify(sharedInput(input), null, 2)}
${promptContextRules(input.promptContext)}

Secao atual (${input.currentWords} palavras):
${JSON.stringify(input.currentSection, null, 2)}

Regras:
${geoRule(input)}
- A nova versao deve mirar ${input.targetWords} palavras visiveis.
- Aceita-se entre ${input.minimumWords} e ${input.maximumWords} palavras visiveis.
- Mantem o mesmo tipo de estrutura da secao.
- Nao removas informacoes uteis ja existentes.
- Acrescenta profundidade pratica, exemplos e detalhes tecnicos.
- Evita repeticoes obvias.
- Nao inventes URLs.
- Nao uses markdown.
${WHITELABEL_INLINE_LINK_RULES}

Contrato de saida:
${sectionContract(input.sectionKey, input)}`;

  return { system, user };
}

export function summarizeGeneratedSections(
  sections: Partial<Record<HtmlSectionKey, unknown>>,
): string {
  const lines: string[] = [];
  for (const key of SECTION_KEYS) {
    const section = sections[key];
    if (!section) continue;
    const text = JSON.stringify(section).replace(/\s+/g, ' ').slice(0, 500);
    lines.push(`${key}: ${text}`);
  }
  return lines.join('\n');
}

function promptContextRules(promptContext?: PromptContext): string {
  if (!promptContext) return '';

  const parts: string[] = [];
  if (promptContext.guardrailPrompt) {
    parts.push(`PROMPT GUARDRAIL GERAL:\n${promptContext.guardrailPrompt}`);
  }
  if (promptContext.serviceExamplePrompt) {
    parts.push(
      `${SERVICE_EXAMPLE_USAGE_RULE}\n\nPROMPT EXEMPLO DO SERVICO (${promptContext.servicePromptSlug}):\n${promptContext.serviceExamplePrompt}`,
    );
  }

  return parts.length ? `\n${parts.join('\n\n')}` : '';
}

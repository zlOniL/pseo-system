import { GenerateTemplateDto } from '../../services/dto/generate-template.dto';
import { Service } from '../../services/services.service';
import {
  SECTION_KEYS,
  SectionKey,
} from '../../service-templates/service-templates.types';
import { buildExternalSlug } from './whitelabel-json';
import {
  PromptContext,
  SERVICE_EXAMPLE_USAGE_RULE,
} from '../../prompt-context/prompt-context.types';

export interface WhitelabelSectionPromptInput {
  service: Service;
  baseCity: string | null;
  isMainPage: boolean;
  blueprints: Record<string, unknown>;
  dto: GenerateTemplateDto;
  sectionKey: SectionKey;
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
- Nao uses "em [Nome da Cidade]", "em {{CITY}}", "em ${input.baseCity ?? 'Lisboa'}", nomes de cidades, localidades, bairros ou qualquer placeholder geografico.
- Se os blueprints tiverem placeholders de cidade, ignora-os para esta pagina principal.`;
  }

  return `- Esta e uma pagina local.
- Usa a cidade base "${input.baseCity ?? ''}" quando houver cidade.
- Nao menciones bairros, ruas, monumentos ou locais especificos.`;
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

function sectionContract(sectionKey: SectionKey): string {
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

  return `Retorna JSON valido neste formato:
{
  "section_key": "${sectionKey}",
  "content": [
    { "type": "heading", "text": "titulo da secao" },
    { "type": "paragraph", "text": "paragrafo desenvolvido" },
    { "type": "callout", "text": "destaque util" },
    { "type": "list", "items": ["item", "item"] }
  ]
}
Usa apenas blocos suportados: heading, paragraph, callout, list, faq_list.`;
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
${input.dto.feedback ? `\nFeedback geral a aplicar:\n${input.dto.feedback}` : ''}
${input.generatedSummary ? `\nResumo das secoes ja geradas para evitar repeticao:\n${input.generatedSummary}` : ''}

Contrato de saida:
${sectionContract(input.sectionKey)}`;

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

Contrato de saida:
${sectionContract(input.sectionKey)}`;

  return { system, user };
}

export function summarizeGeneratedSections(
  sections: Partial<Record<SectionKey, unknown>>,
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

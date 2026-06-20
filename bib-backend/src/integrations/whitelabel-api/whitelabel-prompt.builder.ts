import { GenerateTemplateDto } from '../../services/dto/generate-template.dto';
import { Service } from '../../services/services.service';
import {
  WHITELABEL_MODULES,
  WHITELABEL_SECTION_KEYS,
} from '../../service-templates/service-templates.types';
import { buildExternalSlug } from './whitelabel-json';
import { WHITELABEL_INLINE_LINK_RULES } from './whitelabel-link-rules';
import { VerifiedExternalReference } from './external-link.types';

type WhitelabelPromptInput = {
  service: Service;
  baseCity: string | null;
  isMainPage: boolean;
  blueprints: Record<string, unknown>;
  dto: GenerateTemplateDto;
  externalReferences?: VerifiedExternalReference[];
};

export function buildWhitelabelPrompt(input: WhitelabelPromptInput): {
  system: string;
  user: string;
} {
  const { service, baseCity, isMainPage, blueprints, dto } = input;
  const mainKeyword = isMainPage
    ? service.name
    : `${service.name} em ${baseCity}`;
  const slug = buildExternalSlug(service.name, baseCity ?? undefined);
  const minWords = service.min_words ?? 5000;
  const geoRule = isMainPage
    ? `- Esta e uma pagina principal de servico, NAO e uma pagina local.
- Nao uses "em [Nome da Cidade]", "em {{CITY}}", "em ${baseCity ?? 'Lisboa'}", nomes de cidades, localidades, bairros ou qualquer placeholder geografico em nenhum campo.
- O h1, title, seo_title, hero.intro, article.blocks e o Modulo 13 devem falar apenas do servico em geral, sem segmentacao por cidade.
- Se os blueprints tiverem placeholders de cidade, ignora-os para esta pagina principal.`
    : `- Esta e uma pagina local. Usa a cidade base "${baseCity ?? ''}" nas secoes quando houver cidade; ela sera substituida pela library.
- Quando falares da localidade ou cobertura local, usa a expressao "conforme disponibilidade tecnica".`;

  const system = `Es um especialista em SEO programatico e redacao em portugues europeu.
Gera apenas JSON valido, sem markdown e sem comentarios.
O conteudo sera enviado para uma API whitelabel que renderiza textos num template de servico ja existente.
Nao geres HTML completo. Gera textos estruturados e blocos de artigo compativeis com os blueprints fornecidos.`;

  const moduleContract = WHITELABEL_MODULES.map((module) => {
    if (module.key === 'modulo_13_perguntas_frequentes') {
      return `"${module.key}": [
      {"type":"heading","level":2,"text":"${module.display_title}"},
      {"type":"faq_list","hide_title":true,"items":[{"question":"...","answer":"..."}]}
    ]`;
    }
    return `"${module.key}": [
      {"type":"heading","level":2,"text":"${module.display_title}"},
      {"type":"paragraph","text":"..."}
    ]`;
  }).join(',\n    ');

  const fixedOutline = WHITELABEL_MODULES.map((module) => module.title).join(
    '\n',
  );

  const user = `Cria um template textual para pagina de servico.

Contexto do site via blueprints:
${JSON.stringify(blueprints, null, 2)}

Input:
${JSON.stringify(
  {
    service: service.name,
    main_keyword: mainKeyword,
    base_city: baseCity,
    is_main_page: isMainPage,
    tone: service.tone,
    min_words: minWords,
    service_notes: dto.service_notes ?? service.service_notes ?? '',
    related_services: dto.related_services ?? service.related_services ?? [],
  },
  null,
  2,
)}

Contrato obrigatorio de saida:
{
  "page": {
    "title": "${mainKeyword}",
    "slug": "${slug}",
    "seo_title": "string ate 255 caracteres",
    "seo_description": "string ate 500 caracteres",
    "home_card_title": "string curta para pagina principal",
    "home_card_excerpt": "resumo curto",
    "home_card_icon": "1-3 letras",
    "related_pages_json": ["slugs-relacionados"]
  },
  "sections": {
    "intro": {
      "topbar": { "left": ["frase curta", "frase curta"] },
      "hero": {
        "badge": "string",
        "h1": "${mainKeyword}",
        "intro": "texto introdutorio rico",
        "cta_label": "Pedir assistencia",
        "bullets_title": "O que inclui",
        "bullets": ["item", "item", "item"]
      },
      "form": {
        "title": "string",
        "description": "string"
      }
    },
    ${moduleContract}
  }
}

Regras:
${geoRule}
- O contrato whitelabel e fixo: content_json.hero representa o Modulo 1; content_json.form e conversao e nao conta como modulo SEO; content_json.article.blocks deve renderizar os Modulos 2 a 15 exatamente nesta ordem.
- Ordem fixa obrigatoria dos modulos em article.blocks:
${fixedOutline}
- VOLUME MINIMO ABSOLUTO: o total de palavras visiveis nos textos deve atingir pelo menos ${minWords} palavras.
- A contagem considera hero.intro, bullets, form e todos os blocos dos Modulos 2 a 15, incluindo perguntas e respostas do Modulo 13.
- Nao entregues conteudo abaixo de ${minWords} palavras. Se necessario, desenvolve mais paragrafos, listas, callouts e explicacoes praticas em cada modulo.
- Cada modulo de artigo deve ter conteudo substancial, nao apenas um paragrafo curto. Distribui o volume por todos os modulos.
- Usa exatamente estas chaves de sections: ${WHITELABEL_SECTION_KEYS.join(', ')}.
- Cada modulo de artigo deve comecar com um heading visivel limpo, sem o texto "Modulo N". Exemplo: {"type":"heading","level":2,"text":"Assistencia Especializada"}.
- O Modulo 13 deve ser gerado dentro de "modulo_13_perguntas_frequentes" como bloco {"type":"faq_list","hide_title":true,"items":[...]} logo apos o heading "Perguntas Frequentes".
- A palavra "Modulo" e os numeros dos modulos sao apenas instrucoes internas. Nao os escrevas em nenhum heading, titulo, paragrafo, callout, lista ou FAQ.
- Nao uses "perguntas_frequentes", "faqs" ou qualquer campo separado para posicionar o FAQ. O sistema pode espelhar FAQs para schema, mas a posicao visual correta e sempre article.blocks no Modulo 13.
- Depois do Modulo 13, gera obrigatoriamente o Modulo 14 e o Modulo 15; nunca termines a pagina no FAQ.
- Usa links internos somente quando vierem de related_services ou quando o blueprint/instrucoes do servico pedirem.
- Links externos/backlinks devem respeitar os casos permitidos pelos blueprints e pelas instrucoes de servico.
- Menciona diagnostico antes do orcamento, orcamento justo e antecipado, materiais de qualidade e profissionais especializados, honestos e qualificados.
- Usa blocos suportados: heading, subheading, minor_heading, paragraph, callout, list, faq_list.
- Para list, usa {"type":"list","items":["..."]}.
- Para subtopicos dentro de modulo, usa {"type":"subheading","level":3,"text":"..."} ou {"type":"minor_heading","level":4,"text":"..."}.
- Gera texto natural, util e especifico do servico.
- Nao inventes URLs.
${WHITELABEL_INLINE_LINK_RULES}
${dto.feedback ? `\nFeedback a aplicar:\n${dto.feedback}` : ''}`;

  return { system, user };
}

export function buildWhitelabelShellPrompt(input: WhitelabelPromptInput): {
  system: string;
  user: string;
} {
  const { service, baseCity, isMainPage, blueprints, dto } = input;
  const mainKeyword = isMainPage
    ? service.name
    : `${service.name} em ${baseCity}`;
  const slug = buildExternalSlug(service.name, baseCity ?? undefined);
  const geoRule = buildGeoRule(baseCity, isMainPage);

  const system = `Es um especialista em SEO programatico e redacao em portugues europeu.
Gera apenas JSON valido, sem markdown e sem comentarios.
Nesta chamada gera apenas metadados, topbar, hero e form. Nao geres os Modulos 2 a 15.`;

  const user = `Cria a base textual de uma pagina de servico whitelabel.

Contexto do site via blueprints:
${JSON.stringify(blueprints, null, 2)}

Input:
${JSON.stringify(
  {
    service: service.name,
    main_keyword: mainKeyword,
    base_city: baseCity,
    is_main_page: isMainPage,
    tone: service.tone,
    service_notes: dto.service_notes ?? service.service_notes ?? '',
    related_services: dto.related_services ?? service.related_services ?? [],
  },
  null,
  2,
)}

Contrato obrigatorio de saida:
{
  "page": {
    "title": "${mainKeyword}",
    "slug": "${slug}",
    "seo_title": "string ate 255 caracteres",
    "seo_description": "string ate 500 caracteres",
    "home_card_title": "string curta para pagina principal",
    "home_card_excerpt": "resumo curto",
    "home_card_icon": "1-3 letras",
    "related_pages_json": ["slugs-relacionados"]
  },
  "intro": {
    "topbar": { "left": ["frase curta", "frase curta"] },
    "hero": {
      "badge": "string",
      "h1": "${mainKeyword}",
      "intro": "texto introdutorio forte com 180 a 280 palavras",
      "cta_label": "Pedir assistencia",
      "bullets_title": "O que inclui",
      "bullets": ["item", "item", "item"]
    },
    "form": {
      "title": "string",
      "description": "string"
    }
  }
}

Regras:
${geoRule}
- O hero representa o Modulo 1 - H1 / Topo da Pagina.
- O form e conversao e nao conta como modulo SEO numerado.
- Menciona diagnostico antes do orcamento, orcamento justo e antecipado, materiais de qualidade e profissionais especializados, honestos e qualificados.
- Usa links internos somente quando vierem de related_services ou quando o blueprint/instrucoes do servico pedirem.
- Links externos/backlinks devem respeitar os casos permitidos pelos blueprints e pelas instrucoes de servico.
${WHITELABEL_INLINE_LINK_RULES}
${dto.feedback ? `\nFeedback a aplicar:\n${dto.feedback}` : ''}`;

  return { system, user };
}

export function buildWhitelabelModulePrompt(
  input: WhitelabelPromptInput & {
    module: (typeof WHITELABEL_MODULES)[number];
    targetWords: number;
    attempt: number;
    previousWordCount?: number;
    previousIssue?: string;
  },
): { system: string; user: string } {
  const { service, baseCity, isMainPage, blueprints, dto, module } = input;
  const moduleReferences = (input.externalReferences ?? []).filter(
    (reference) => reference.target_module === module.key,
  );
  const mainKeyword = isMainPage
    ? service.name
    : `${service.name} em ${baseCity}`;
  const geoRule = buildGeoRule(baseCity, isMainPage);
  const faqContract =
    module.key === 'modulo_13_perguntas_frequentes'
      ? `[
  {"type":"heading","level":2,"text":"${module.display_title}"},
  {"type":"faq_list","hide_title":true,"items":[{"question":"...","answer":"..."}]}
]`
      : `[
  {"type":"heading","level":2,"text":"${module.display_title}"},
  {"type":"paragraph","text":"..."}
]`;
  const retryRule =
    input.attempt > 1
      ? `- A tentativa anterior deste modulo gerou apenas ${input.previousWordCount ?? 0} palavras.
- Problema detectado na tentativa anterior: ${input.previousIssue ?? 'conteudo insuficiente'}.
- Corrige apenas este modulo e respeita o contrato abaixo.`
      : '';
  const faqBoundaryRule =
    module.key === 'modulo_13_perguntas_frequentes'
      ? `- Este e o unico modulo onde podes gerar perguntas frequentes.
- Gera apenas o heading "Perguntas Frequentes" e um bloco faq_list com perguntas e respostas.`
      : `- Proibido gerar FAQ neste modulo.
- Nao escrevas "Perguntas Frequentes", "FAQ", perguntas e respostas em formato de FAQ, nem bloco faq_list.
- Se precisares responder duvidas, transforma isso em texto explicativo normal sem perguntas destacadas.
- O FAQ pertence exclusivamente ao Modulo 13.`;

  const system = `Es um especialista em SEO programatico e redacao em portugues europeu.
Gera apenas um JSON array valido, sem markdown e sem comentarios.
Nesta chamada gera exclusivamente um modulo de article.blocks.`;

  const user = `Gera exclusivamente este modulo da pagina de servico:
${module.title}

Contexto do site via blueprints:
${JSON.stringify(blueprints, null, 2)}

Input:
${JSON.stringify(
  {
    service: service.name,
    main_keyword: mainKeyword,
    base_city: baseCity,
    is_main_page: isMainPage,
    tone: service.tone,
    target_words_for_this_module: input.targetWords,
    service_notes: dto.service_notes ?? service.service_notes ?? '',
    related_services: dto.related_services ?? service.related_services ?? [],
  },
  null,
  2,
)}

Contrato obrigatorio de saida: retorna apenas um JSON array neste formato:
${faqContract}

Regras:
${geoRule}
- Este modulo deve ter pelo menos ${input.targetWords} palavras visiveis.
${retryRule}
${faqBoundaryRule}
- O primeiro bloco deve ser exatamente {"type":"heading","level":2,"text":"${module.display_title}"}.
- Usa o numero do modulo apenas para te orientares internamente. Nao escrevas "Modulo", "Modulo ${module.title.match(/\d+/)?.[0] ?? ''}" nem qualquer numeracao de modulo no texto visivel.
- Para subtopicos, usa {"type":"subheading","level":3,"text":"..."} ou {"type":"minor_heading","level":4,"text":"..."}.
- Usa blocos suportados: heading, subheading, minor_heading, paragraph, callout, list, faq_list.
- Para list, usa {"type":"list","items":["..."]}.
- Usa links internos somente quando vierem de related_services ou quando o blueprint/instrucoes do servico pedirem.
- Para links externos, usa SOMENTE as referencias verificadas fornecidas abaixo. Nao cries, completes nem alteres URLs.
- Se existirem referencias verificadas para este modulo, integra naturalmente todas elas em campos de texto que permitem links.
- Nao confundas referencias externas com related_services: related_services contem apenas links internos do proprio site.
- Menciona diagnostico antes do orcamento, orcamento justo e antecipado, materiais de qualidade e profissionais especializados, honestos e qualificados quando fizer sentido neste modulo.
- Nao inventes URLs.
- Nao uses HTML fora dos campos permitidos.
${WHITELABEL_INLINE_LINK_RULES}
${externalReferencesRules(moduleReferences)}
- Nao geres outros modulos.
${dto.feedback ? `\nFeedback geral a aplicar, sem alterar o modulo pedido:\n${dto.feedback}` : ''}`;

  return { system, user };
}

function externalReferencesRules(
  references: VerifiedExternalReference[],
): string {
  if (!references.length) {
    return `Referencias externas verificadas para este modulo: nenhuma.
- Nao insiras qualquer URL externa neste modulo.`;
  }

  return `Referencias externas verificadas e obrigatorias para este modulo:
${references
  .map(
    (reference, index) =>
      `${index + 1}. ${reference.entity} | ${reference.final_url} | tipo: ${reference.type}`,
  )
  .join('\n')}
- Insere exatamente um link contextual para cada referencia acima.
- Usa o URL exatamente como fornecido, com ancora descritiva e natural.
- A frase deve explicar por que a entidade, marca ou fonte e relevante; nao cries uma lista solta de links.`;
}

function buildGeoRule(baseCity: string | null, isMainPage: boolean): string {
  return isMainPage
    ? `- Esta e uma pagina principal de servico, NAO e uma pagina local.
- Nao uses "em [Nome da Cidade]", "em {{CITY}}", "em ${baseCity ?? 'Lisboa'}", nomes de cidades, localidades, bairros ou qualquer placeholder geografico em nenhum campo.
- O h1, title, seo_title, hero.intro, article.blocks e o Modulo 13 devem falar apenas do servico em geral, sem segmentacao por cidade.
- Se os blueprints tiverem placeholders de cidade, ignora-os para esta pagina principal.`
    : `- Esta e uma pagina local. Usa a cidade base "${baseCity ?? ''}" nas secoes quando houver cidade; ela sera substituida pela library.
- Quando falares da localidade ou cobertura local, usa a expressao "conforme disponibilidade tecnica".`;
}

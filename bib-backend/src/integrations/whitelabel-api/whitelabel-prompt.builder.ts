import { GenerateTemplateDto } from '../../services/dto/generate-template.dto';
import { Service } from '../../services/services.service';
import { SECTION_KEYS } from '../../service-templates/service-templates.types';
import { buildExternalSlug } from './whitelabel-json';
import {
  PromptContext,
  SERVICE_EXAMPLE_USAGE_RULE,
} from '../../prompt-context/prompt-context.types';

export function buildWhitelabelPrompt(input: {
  service: Service;
  baseCity: string | null;
  isMainPage: boolean;
  blueprints: Record<string, unknown>;
  dto: GenerateTemplateDto;
  promptContext?: PromptContext;
}): { system: string; user: string } {
  const { service, baseCity, isMainPage, blueprints, dto, promptContext } =
    input;
  const mainKeyword = isMainPage
    ? service.name
    : `${service.name} em ${baseCity}`;
  const slug = buildExternalSlug(service.name, baseCity ?? undefined);
  const minWords = service.min_words ?? 5000;
  const geoRule = isMainPage
    ? `- Esta e uma pagina principal de servico, NAO e uma pagina local.
- Nao uses "em [Nome da Cidade]", "em {{CITY}}", "em ${baseCity ?? 'Lisboa'}" nem placeholders geograficos.
- Fora da section contexto_local, nao menciones nomes de cidades, localidades ou bairros.
- Na section contexto_local, gera "Zonas de Atendimento" com Grande Lisboa, Margem Sul, Grande Porto, Braga e Algarve.
- O h1, title, seo_title, hero.intro e FAQs devem falar apenas do servico em geral, sem segmentacao por cidade.
- Se os blueprints tiverem placeholders de cidade, ignora-os para esta pagina principal.`
    : `- Esta e uma pagina local. Usa a cidade base "${baseCity ?? ''}" nas secoes quando houver cidade; ela sera substituida pela library.
- Fora da section contexto_local, evita bairros, ruas, monumentos ou locais especificos.
- Na section contexto_local, gera exatamente "Contexto Local em ${baseCity}" com freguesias, bairros, ruas conhecidas, pracas, avenidas, pontos de referencia, zonas residenciais e comerciais.`;

  const system = `És um especialista em SEO programático e redação em português europeu.
Gera apenas JSON válido, sem markdown e sem comentários.
O conteúdo será enviado para uma API whitelabel que renderiza textos num template de serviço já existente.
Não geres HTML completo. Gera textos estruturados e blocos de artigo compatíveis com os blueprints fornecidos.`;

  const user = `Cria um template textual para página de serviço.

Contexto do site via blueprints:
${JSON.stringify(blueprints, null, 2)}
${promptContextRules(promptContext)}

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

Contrato obrigatório de saída:
{
  "page": {
    "title": "${mainKeyword}",
    "slug": "${slug}",
    "seo_title": "string até 255 caracteres",
    "seo_description": "string até 500 caracteres",
    "home_card_title": "string curta para página principal",
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
        "intro": "texto introdutório rico",
        "cta_label": "Pedir assistência",
        "bullets_title": "O que inclui",
        "bullets": ["item", "item", "item"]
      },
      "form": {
        "title": "string",
        "description": "string"
      }
    },
    ${SECTION_KEYS.filter(
      (key) => key !== 'intro' && key !== 'perguntas_frequentes',
    )
      .map(
        (key) =>
          `"${key}": [{"type":"heading","text":"..."},{"type":"paragraph","text":"..."}]`,
      )
      .join(',\n    ')},
    "perguntas_frequentes": [{"question":"...","answer":"..."}]
  }
}

Regras:
${geoRule}
- VOLUME MINIMO ABSOLUTO: o total de palavras visiveis nos textos deve atingir pelo menos ${minWords} palavras.
- A contagem considera hero.intro, bullets, form, todos os article.blocks, perguntas e respostas das FAQs.
- Nao entregues conteudo abaixo de ${minWords} palavras. Se necessario, desenvolve mais paragrafos, listas, callouts e explicacoes praticas em cada section.
- Cada section de artigo deve ter conteudo substancial, nao apenas um paragrafo curto. Distribui o volume por todas as sections.
- Usa exatamente estas chaves de sections: ${SECTION_KEYS.join(', ')}.
- As chaves seguem obrigatoriamente os 15 modulos da pasta prompts, nesta ordem:
  1. intro = H1 / Topo da Pagina
  2. assistencia_especializada = Assistencia Especializada
  3. tipos = Tipos do Servico
  4. servicos = Servicos Realizados
  5. avarias_comuns = Principais Problemas / Avarias
  6. como_funciona = Como Funciona o Nosso Servico
  7. servico_24h = Servico 24H/7
  8. prevencao = Manutencao / Prevencao
  9. reparar_ou_substituir = Reparar ou Substituir
  10. por_que_escolher = Por Que Escolher a Empresa
  11. integracao_servicos = Integracao com Outros Servicos
  12. contexto_local = se is_main_page=true, heading exatamente "Zonas de Atendimento" e incluir Grande Lisboa, Margem Sul, Grande Porto, Braga, Algarve, Paginas Amarelas e Portal Autarquico; se for pagina local, heading exatamente "Contexto Local em ${baseCity}" com contexto local forte e backlinks locais reais
  13. perguntas_frequentes = Perguntas Frequentes
  14. contacte_empresa = Contacte a Empresa
  15. mais_sobre = Mais Sobre o Servico
- Cada seção de artigo deve começar com bloco {"type":"heading","text":"..."}.
- Usa blocos suportados: heading, paragraph, callout, list, faq_list.
- Para list, usa {"type":"list","items":["..."]}.
- Gera texto natural, útil e específico do serviço.
- Não uses HTML, exceto se o blueprint explicitamente permitir pequenos trechos inline.
- Não inventes URLs.
${dto.feedback ? `\nFeedback a aplicar:\n${dto.feedback}` : ''}`;

  return { system, user };
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

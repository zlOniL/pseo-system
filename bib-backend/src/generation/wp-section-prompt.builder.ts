import { GenerateDto } from './dto/generate.dto';
import {
  SECTION_KEYS,
  SectionKey,
} from '../service-templates/service-templates.types';
import {
  PromptContext,
  SERVICE_EXAMPLE_USAGE_RULE,
} from '../prompt-context/prompt-context.types';

export interface WpSectionPromptInput {
  dto: GenerateDto;
  sectionKey: SectionKey;
  targetWords: number;
  minimumWords: number;
  maximumWords: number;
  feedback?: string;
  generatedSummary?: string;
  promptContext?: PromptContext;
}

export interface WpSectionExpansionPromptInput extends WpSectionPromptInput {
  currentHtml: string;
  currentWords: number;
}

function keyword(input: GenerateDto): string {
  return input.main_keyword;
}

function cityLabel(input: GenerateDto): string {
  return input.city?.trim() ?? '';
}

function cityRules(input: GenerateDto): string {
  if (input.city?.trim()) {
    return `- Esta e uma pagina local para "${input.city}".
- Usa a cidade nos H1/H2/H3/listas quando fizer sentido.
- Nao menciones ruas, bairros, monumentos ou locais especificos.`;
  }

  return `- Esta e uma pagina principal de servico, sem localidade.
- Remove expressoes como "em {{CITY}}", "em [Cidade]" ou "em ${input.city ?? 'Lisboa'}".
- Nao menciones nomes de cidades, bairros, ruas ou monumentos.`;
}

function relatedServicesRules(input: GenerateDto): string {
  const related = input.related_services ?? [];
  if (!related.length) {
    return `- Nao ha servicos relacionados com URL.
- Em textos de integracao, nao uses tags <a> e nao inventes URLs.`;
  }

  return `- Servicos relacionados disponiveis: ${JSON.stringify(related)}.
- Usa apenas esses URLs quando precisares de links internos.
- Nao inventes URLs nem servicos extra.`;
}

function commonRules(
  input: GenerateDto,
  targetWords: number,
  minimumWords: number,
  maximumWords: number,
): string {
  return `Regras globais:
- Retorna apenas HTML valido. Sem markdown, sem explicacoes e sem cercas de codigo.
- Usa portugues europeu, tom ${input.tone ?? 'profissional, confiavel e direto'}.
- Palavra-chave principal: "${keyword(input)}".
- Servico: "${input.service}".
- Cidade: "${cityLabel(input)}".
${cityRules(input)}
${relatedServicesRules(input)}
- Todos os h1, h2, h3, p, li, strong e a devem ter style="color: #320000;" quando a tag permitir.
- Links devem usar style="color: #111 !important; font-weight: 600; text-decoration: underline;" target="_blank" rel="noopener noreferrer" quando forem externos.
- Usa <strong> para destacar keywords, problemas, tecnicas e servicos.
- Nao uses "voce"; usa "o cliente", "o utilizador", "a intervencao", etc.
- Nao inventes URLs externas. Se nao tiveres certeza, omite o link.
- Volume alvo desta secao: aproximadamente ${targetWords} palavras visiveis.
- Faixa aceitavel desta secao: entre ${minimumWords} e ${maximumWords} palavras visiveis.
- Nao ultrapasses ${maximumWords} palavras visiveis salvo se for indispensavel para cumprir a estrutura.
- Escreve paragrafos desenvolvidos, com 3-6 frases, evitando conteudo generico.`;
}

function sectionInstructions(
  input: GenerateDto,
  sectionKey: SectionKey,
): string {
  const city = cityLabel(input);
  const citySuffix = city ? ` em ${city}` : '';
  const service = input.service;
  const mainKeyword = keyword(input);

  switch (sectionKey) {
    case 'intro':
      return `Gera a abertura da pagina:
- Comeca com comentario <!-- BIB_META: descricao SEO com 140-160 caracteres, citando atendimento 24h -->.
- Depois gera <h1 style="color: #320000;">${mainKeyword}</h1>.
- Gera um paragrafo inicial com atendimento 24h e WhatsApp.
- Gera 9 paragrafos ricos de introducao.
- Se houver servicos relacionados, gera um paragrafo com links internos usando apenas os URLs fornecidos.
- Nao geres nenhum <h2> nesta secao.
- No fim inclui exatamente {{IMAGE_1}}.`;
    case 'procura_buscadores':
      return `Gera a secao completa:
<h2 style="color: #320000;">Procura em Buscadores por ${mainKeyword}</h2>
- Cria 8 H3s, todos relacionados a variacoes/intencoes da keyword.
- Cada H3 deve ter 2 paragrafos ricos.
- No fim inclui exatamente {{IMAGE_2}}.`;
    case 'avarias_comuns':
      return `Gera a secao completa:
<h2 style="color: #320000;">Avarias Comuns em ${service}${citySuffix}</h2>
- Cria 6 H3s sobre problemas reais do servico.
- Cada H3 deve ter 2 paragrafos ricos: causas e solucao profissional.
- Fecha com um paragrafo de autoridade e urgencia 24h.
- No fim inclui exatamente {{IMAGE_3}}.`;
    case 'servicos':
      return `Gera a secao completa:
<h2 style="color: #320000;">Servicos de ${service}${citySuffix}</h2>
- Cria 6 categorias com H3.
- Cada categoria deve ter 6 itens <strong style="color: #320000;">- servico long-tail${citySuffix}</strong>.
- Nao repitas itens.
- Fecha com paragrafo sobre diagnostico, profissionalismo e testes finais.
- No fim inclui exatamente {{IMAGE_4}}.`;
    case 'como_funciona':
      return `Gera a secao:
<h2 style="color: #320000;">Como Funciona o Servico de ${service}</h2>
- Dois paragrafos ricos: contacto/orcamento/diagnostico e execucao/testes/garantia.`;
    case 'tipos':
      return `Gera a secao:
<h2 style="color: #320000;">Tipos de ${service}</h2>
- Um paragrafo introdutorio.
- Uma lista <ul> com 5 itens tecnicos distintos.
- No fim inclui exatamente {{IMAGE_5}}.`;
    case 'prevencao':
      return `Gera a secao:
<h2 style="color: #320000;">Prevencao e Manutencao</h2>
- 6 paragrafos educativos e tecnicos.
- Uma lista <ul> com 6 acoes preventivas.
- Um paragrafo final com chamada para contacto preventivo.
- No fim inclui exatamente {{IMAGE_6}}.`;
    case 'sistemas':
      return `Gera a secao:
<h2 style="color: #320000;">Sistemas e Intervencoes que Fazemos como ${service}${citySuffix}</h2>
- 6 paragrafos tecnicos aprofundados.
- Menciona ferramentas, materiais, metodos e marcas reais apenas quando fizer sentido.
- Inclui normas tecnicas apenas se forem plausiveis para o servico.`;
    case 'servicos_especializados':
      return `Gera duas partes em sequencia:
1. <h2 style="color: #320000;">Servicos Especializados de ${service}${citySuffix}</h2>
- Um paragrafo introdutorio.
- Um bloco <div style="display: flex; flex-wrap: wrap; gap: 30px;"> com duas colunas.
- Cada coluna deve ter 14 itens <li><strong>keyword long-tail</strong></li>.
- No fim desta parte inclui exatamente {{IMAGE_7}}.
2. <h2 style="color: #320000;">Integracao com Outros Servicos de ${service}${citySuffix}</h2>
- 3 paragrafos ricos sobre como o servico se relaciona com outros elementos do imovel.
- Se houver servicos relacionados, cria uma lista com exatamente um <li> por servico relacionado, usando o URL real fornecido.
- Se nao houver servicos relacionados, nao cries lista.`;
    case 'perguntas_frequentes':
      return `Gera a secao:
<h2 style="color: #320000;">Perguntas Frequentes sobre ${mainKeyword}</h2>
- Exatamente 10 pares H3 + P.
- Cada resposta deve comecar com <strong style="color: #320000;">SIM.</strong> ou confirmacao equivalente.
- No fim inclui exatamente {{IMAGE_8}}.`;
    case 'pesquisas_relacionadas':
      return `Gera a secao:
<h2 style="color: #320000;">Pesquisas Relacionadas</h2>
- Uma lista <ul> com exatamente 30 itens long-tail relacionados ao servico e cidade, quando houver cidade.`;
    case 'conclusao':
      return `Gera a secao:
<h2 style="color: #320000;">Conclusao</h2>
- 8 a 10 paragrafos de encerramento com autoridade tecnica, SEO e CTA.`;
    case 'mais_sobre':
      return `Gera a secao:
<h2 style="color: #320000;">Mais sobre ${service}${citySuffix}</h2>
- 8 paragrafos de reforco semantico e comercial, sem soar como conclusao repetida.`;
  }
}

export function buildWpSectionPrompt(input: WpSectionPromptInput): {
  system: string;
  user: string;
} {
  const system = `Es um especialista em SEO programatico e redacao em portugues europeu.
Preenche apenas uma secao HTML fixa para uma pagina WordPress.
Retorna somente HTML valido.`;

  const user = `${commonRules(
    input.dto,
    input.targetWords,
    input.minimumWords,
    input.maximumWords,
  )}
${promptContextRules(input.promptContext)}

Secao solicitada: ${input.sectionKey}
${sectionInstructions(input.dto, input.sectionKey)}

Contexto tecnico do servico:
${input.dto.service_notes?.trim() || 'Sem notas adicionais.'}

${input.feedback ? `Feedback geral a aplicar:\n${input.feedback}\n` : ''}
${input.generatedSummary ? `Resumo das secoes ja geradas para evitar repeticao:\n${input.generatedSummary}\n` : ''}

Retorna apenas o HTML desta secao.`;

  return { system, user };
}

export function buildWpSectionExpansionPrompt(
  input: WpSectionExpansionPromptInput,
): { system: string; user: string } {
  const system = `Es um editor SEO senior.
Expande uma secao HTML mantendo a mesma estrutura visual.
Retorna somente HTML valido.`;

  const user = `${commonRules(
    input.dto,
    input.targetWords,
    input.minimumWords,
    input.maximumWords,
  )}
${promptContextRules(input.promptContext)}

Secao solicitada: ${input.sectionKey}
Palavras atuais estimadas: ${input.currentWords}

HTML atual:
${input.currentHtml}

Regras:
- Reescreve e expande a mesma secao.
- Mantem o H2/H3/listas principais da secao.
- Nao removas placeholders {{IMAGE_N}} se existirem.
- Nao alteres a secao para outro tema.
- Nova versao deve mirar ${input.targetWords} palavras visiveis.
- Aceita-se entre ${input.minimumWords} e ${input.maximumWords} palavras visiveis.

Retorna apenas o HTML expandido desta secao.`;

  return { system, user };
}

export function summarizeWpSections(
  sections: Partial<Record<SectionKey, string>>,
): string {
  const lines: string[] = [];
  for (const key of SECTION_KEYS) {
    const html = sections[key];
    if (!html) continue;
    const text = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);
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

  return parts.length ? `\n${parts.join('\n\n')}\n` : '';
}

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
- Fora da secao contexto_local, evita ruas, bairros, monumentos ou locais especificos.
- Na secao contexto_local, segue a instrucao especifica do Modulo 12 e cria contexto local forte com freguesias, bairros, ruas, pracas, avenidas e referencias reais da localidade.`;
  }

  return `- Esta e uma pagina principal de servico, sem localidade.
- Remove expressoes como "em {{CITY}}", "em [Cidade]" ou "em ${input.city ?? 'Lisboa'}".
- Fora da secao contexto_local, nao menciones nomes de cidades, bairros, ruas ou monumentos.
- Na secao contexto_local, segue a instrucao especifica do Modulo 12 e gera "Zonas de Atendimento" com Grande Lisboa, Margem Sul, Grande Porto, Braga e Algarve.`;
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
      return `Gera o Modulo 1 - H1 / Topo da Pagina:
- Comeca com comentario <!-- BIB_META: descricao SEO com 140-160 caracteres, citando atendimento 24h -->.
- Depois gera <h1 style="color: #320000;">${mainKeyword} | Tecnicos Especializados 24H/7</h1>.
- Explica que a empresa e especializada no servico, com atendimento 24h/7, incluindo sabados, domingos e feriados.
- Menciona casas, apartamentos, lojas, escritorios, condominios, alojamentos locais, empresas e espacos comerciais.
- Reforca diagnostico antes do orcamento, orcamento justo e antecipado, materiais de qualidade, profissionais especializados e piquetes moveis por localidade.
- Termina com chamada para contacto.
- Se houver servicos relacionados, gera um paragrafo com links internos usando apenas os URLs fornecidos.
- Nao geres nenhum <h2> nesta secao.
- No fim inclui exatamente {{IMAGE_1}}.`;
    case 'assistencia_especializada':
      return `Gera a secao completa:
<h2 style="color: #320000;">Assistencia Especializada de ${service}${citySuffix}</h2>
- Explica por que o servico deve ser feito por tecnicos especializados.
- Mostra que a avaria pode ter varias causas e que nao se deve trocar pecas ou intervir sem diagnostico.
- Reforca diagnostico tecnico, seguranca, durabilidade, prevencao de avarias maiores e evitar trocas desnecessarias.
- No fim inclui exatamente {{IMAGE_2}}.`;
    case 'tipos':
      return `Gera a secao completa:
<h2 style="color: #320000;">Tipos de ${service}${citySuffix}</h2>
- Lista e explica os principais tipos relacionados ao servico.
- Cria varios H3s, cada um com 2 a 4 paragrafos curtos e especificos.
- Adapta os tipos ao servico pedido, sem importar problemas de outros servicos.
- No fim inclui exatamente {{IMAGE_3}}.`;
    case 'servicos':
      return `Gera a secao completa:
<h2 style="color: #320000;">Servicos Realizados de ${service}${citySuffix}</h2>
- Explica de forma completa os servicos realizados dentro desta area.
- Inclui os servicos mais procurados, manutencao, assistencia urgente e diagnostico antes do orcamento.
- Inclui uma subseccao <h3 style="color: #320000;">Marcas e componentes compativeis</h3>.
- Usa links externos apenas para sites oficiais de marcas quando tiveres certeza do URL.
- No fim inclui exatamente {{IMAGE_4}}.`;
    case 'avarias_comuns':
      return `Gera a secao completa:
<h2 style="color: #320000;">Principais Problemas que Resolvemos em ${service}${citySuffix}</h2>
- Cria varios H3s com problemas/avarias reais do servico.
- Cada problema deve ter causa provavel, consequencia, solucao e pelo menos 2 a 3 paragrafos curtos.
- Fecha com posicionamento de autoridade e chamada para contacto.`;
    case 'como_funciona':
      return `Gera a secao:
<h2 style="color: #320000;">Como Funciona o Nosso Servico de ${service}${citySuffix}</h2>
- Explica passo a passo: contacto, fotos/videos, deslocacao, diagnostico no local, solucao, orcamento justo e antecipado, autorizacao, reparacao e testes finais.`;
    case 'servico_24h':
      return `Gera a secao:
<h2 style="color: #320000;">Servico de ${service}${citySuffix} 24H/7</h2>
- Foca urgencia, atendimento 24H/7, sabados, domingos e feriados.
- Explica situacoes que nao podem esperar no servico especifico.
- Reforca piquetes moveis, diagnostico antes da intervencao e servico sem improvisos.
- No fim inclui exatamente {{IMAGE_5}}.`;
    case 'prevencao':
      return `Gera a secao:
<h2 style="color: #320000;">Manutencao e Prevencao de ${service}${citySuffix}</h2>
- Explica a importancia da manutencao preventiva e os sinais pequenos que devem ser resolvidos cedo.
- Mostra como a manutencao reduz urgencias, evita custos maiores e prolonga a vida util.
- Inclui lista de acoes preventivas concretas.
- No fim inclui exatamente {{IMAGE_6}}.`;
    case 'reparar_ou_substituir':
      return `Gera a secao:
<h2 style="color: #320000;">Reparar ou Substituir ${service}${citySuffix}?</h2>
- Ajuda o cliente a tomar decisao.
- Explica que nem sempre e preciso substituir tudo.
- Reforca que reparar com seguranca e a primeira opcao quando for tecnicamente viavel.
- Quando a substituicao for mais adequada, explica criterios como seguranca, custo, idade, estado geral e durabilidade.`;
    case 'por_que_escolher':
      return `Gera a secao:
<h2 style="color: #320000;">Por Que Escolher a Empresa para ${service}${citySuffix}</h2>
- Secao comercial e de confianca.
- Inclui tecnicos qualificados, atendimento 24H/7, diagnostico antes do orcamento, orcamento justo e antecipado, materiais de qualidade, piquetes moveis, explicacao clara, testes finais, seguranca e durabilidade.`;
    case 'integracao_servicos':
      return `Gera a secao:
<h2 style="color: #320000;">Integracao com Outros Servicos de ${service}${citySuffix}</h2>
- Liga o servico principal a servicos complementares.
- Se houver servicos relacionados, cria uma lista com exatamente um <li> por servico relacionado, usando o URL real fornecido.
- Se nao houver servicos relacionados, cita servicos complementares naturalmente, sem links e sem inventar URLs.
- No fim inclui exatamente {{IMAGE_7}}.`;
    case 'contexto_local':
      return `Gera a secao:
<h2 style="color: #320000;">${city ? `Contexto Local em ${city}` : 'Zonas de Atendimento'}</h2>
- Se houver cidade, este modulo DEVE chamar-se exatamente "Contexto Local em ${city}".
- Se nao houver cidade, este modulo DEVE chamar-se exatamente "Zonas de Atendimento".
- Para pagina principal, incluir grandes regioes: Grande Lisboa, Margem Sul, Grande Porto, Braga e Algarve.
- Para pagina principal, inserir links externos para Paginas Amarelas (https://www.pai.pt/) e Portal Autarquico (https://portalautarquico.dgal.gov.pt/).
- Para pagina local, criar contexto local forte mencionando cidade/localidade, freguesias, bairros, ruas conhecidas, pracas, avenidas, pontos de referencia, zonas residenciais e comerciais, perfil do local, tipos de imoveis e necessidades provaveis do servico naquela zona.
- Para pagina local, inserir 2 backlinks externos locais relevantes quando tiveres certeza do URL, como camara municipal, junta de freguesia, turismo local, diretorio local, Portal Autarquico, biblioteca municipal ou site oficial local.
- Nao mistures localidades.`;
    case 'perguntas_frequentes':
      return `Gera a secao:
<h2 style="color: #320000;">Perguntas Frequentes sobre ${mainKeyword}</h2>
- Perguntas frequentes completas sobre atendimento 24H/7, orcamento, diagnostico, avarias, reparacao no local, empresas, condominios, reparar/substituir e perguntas especificas do servico.
- Cada resposta deve comecar com <strong style="color: #320000;">SIM.</strong> ou confirmacao equivalente.
- No fim inclui exatamente {{IMAGE_8}}.`;
    case 'contacte_empresa':
      return `Gera a secao:
<h2 style="color: #320000;">Contacte a Empresa para ${service}${citySuffix}</h2>
- Chamada para acao forte.
- Repete a keyword principal e variacoes naturais.
- Reforca principais problemas resolvidos, tecnicos especializados, materiais de qualidade, diagnostico antes do orcamento, orcamento justo e antecipado, servico 24H/7, sabados, domingos e feriados.`;
    case 'mais_sobre':
      return `Gera a secao:
<h2 style="color: #320000;">Mais Sobre ${service}${citySuffix}</h2>
- Fechamento SEO forte, explicativo e humano.
- Fala sobre importancia do servico, pequenas avarias, agir cedo, manutencao, diagnostico, seguranca, transparencia e melhor resultado.
- Inclui links externos para Google.pt e ChatGPT.com quando fizer sentido e com URLs reais.`;
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

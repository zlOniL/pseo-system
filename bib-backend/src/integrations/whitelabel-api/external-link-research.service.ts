import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AiService } from '../../ai/ai.service';
import { SupabaseService } from '../../common/supabase.service';
import {
  ExternalReferenceCandidate,
  ExternalReferenceModule,
  ExternalReferenceType,
  VerifiedExternalReference,
} from './external-link.types';
import { validateModuleExternalLinks } from './external-link-validation';

type CachedLinkRow = {
  url: string;
  final_url: string;
  domain: string;
  entity_name: string;
  reference_type: ExternalReferenceType;
  target_module: ExternalReferenceModule;
  page_title: string | null;
  page_description: string | null;
  http_status: number;
  relevance_score: number;
  is_official: boolean;
  verified_at: string;
};

type HttpVerification = {
  finalUrl: string;
  status: number;
  title: string | null;
  description: string | null;
};

const ALLOWED_TYPES = new Set<ExternalReferenceType>([
  'brand',
  'local_authority',
  'technical_authority',
]);

const ALLOWED_MODULES = new Set<ExternalReferenceModule>([
  'modulo_4_servicos_realizados',
  'modulo_12_zonas_contexto_local',
  'modulo_15_mais_sobre_servico',
]);

@Injectable()
export class ExternalLinkResearchService {
  private readonly logger = new Logger(ExternalLinkResearchService.name);
  private readonly requestTimeoutMs = 7000;
  private readonly cacheDays = 30;

  constructor(
    private readonly ai: AiService,
    private readonly supabase: SupabaseService,
  ) {}

  async research(input: {
    service: string;
    city: string | null;
    isMainPage: boolean;
    serviceNotes?: string | null;
  }): Promise<VerifiedExternalReference[]> {
    const totalStartedAt = Date.now();
    if (/^(false|0)$/i.test(process.env.EXTERNAL_LINK_RESEARCH_ENABLED ?? '')) {
      this.logger.log(
        `[PERF] link_research_done service=${input.service} city=${input.city ?? 'main'} status=disabled duration_ms=0`,
      );
      return [];
    }

    this.logger.log(
      `[PERF] link_research_start service=${input.service} city=${input.city ?? 'main'}`,
    );
    const candidates: ExternalReferenceCandidate[] = [];
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const candidateAiStartedAt = Date.now();
      const batch = await this.generateCandidates(input);
      this.logger.log(
        `[PERF] link_candidates_ai attempt=${attempt}/2 returned=${batch.length} duration_ms=${Date.now() - candidateAiStartedAt}`,
      );
      for (const candidate of batch) {
        if (!candidates.some((item) => item.url === candidate.url)) {
          candidates.push(candidate);
        }
      }
      if (candidates.length >= 6) break;
    }
    const reachable: VerifiedExternalReference[] = [];

    for (const candidate of candidates.slice(0, 10)) {
      const candidateStartedAt = Date.now();
      const cached = await this.readFreshCache(candidate);
      if (cached) {
        reachable.push(cached);
        this.logger.log(
          `[PERF] link_candidate_verified entity=${candidate.entity} source=cache status=ok duration_ms=${Date.now() - candidateStartedAt}`,
        );
        continue;
      }

      const verified = await this.verifyCandidate(candidate);
      this.logger.log(
        `[PERF] link_candidate_verified entity=${candidate.entity} source=http status=${verified ? 'ok' : 'rejected'} duration_ms=${Date.now() - candidateStartedAt}`,
      );
      if (!verified) continue;
      reachable.push(verified);
    }

    this.logger.log(
      `External link research candidates=${candidates.length} reachable=${reachable.length} service=${input.service}`,
    );

    const semanticStartedAt = Date.now();
    const assessed = await this.assessSemantics(input, reachable);
    const balanced = this.balanceReferences(assessed);
    this.logger.log(
      `[PERF] link_semantic_validation candidates=${reachable.length} approved=${assessed.length} selected=${balanced.length} duration_ms=${Date.now() - semanticStartedAt}`,
    );
    this.logger.log(
      `External link research semantic=${assessed.length} selected=${balanced.length} service=${input.service}`,
    );
    const cacheWriteStartedAt = Date.now();
    await Promise.all(balanced.map((reference) => this.writeCache(reference)));
    this.logger.log(
      `[PERF] link_cache_write count=${balanced.length} duration_ms=${Date.now() - cacheWriteStartedAt}`,
    );
    const configuredMinimum = Number(
      process.env.EXTERNAL_LINK_MIN_REFERENCES ?? 2,
    );
    const minimum = Number.isFinite(configuredMinimum)
      ? Math.max(0, Math.floor(configuredMinimum))
      : 2;
    if (balanced.length < minimum) {
      const message = `A pesquisa automatica encontrou apenas ${balanced.length}/${minimum} referencias externas validas para ${input.service}.`;
      if (/^(true|1)$/i.test(process.env.EXTERNAL_LINK_STRICT ?? '')) {
        throw new BadRequestException(message);
      }
      this.logger.warn(`${message} A geracao continuara em modo nao estrito.`);
    }
    this.logger.log(
      `[PERF] link_research_done service=${input.service} city=${input.city ?? 'main'} candidates=${candidates.length} reachable=${reachable.length} selected=${balanced.length} duration_ms=${Date.now() - totalStartedAt}`,
    );
    return balanced;
  }

  async rewriteLocalModule(input: {
    service: string;
    city: string;
    serviceNotes?: string | null;
    blocks: Array<Record<string, unknown>>;
  }): Promise<Array<Record<string, unknown>>> {
    const rewriteStartedAt = Date.now();
    this.logger.log(
      `[PERF] local_module_rewrite_start service=${input.service} city=${input.city}`,
    );
    const references = (
      await this.research({
        service: input.service,
        city: input.city,
        isMainPage: false,
        serviceNotes: input.serviceNotes,
      })
    ).filter(
      (reference) =>
        reference.target_module === 'modulo_12_zonas_contexto_local',
    );
    if (!references.length) {
      throw new BadRequestException(
        `Nao foram encontradas referencias locais verificadas para ${input.city}.`,
      );
    }

    const rewriteAiStartedAt = Date.now();
    const raw = await this.ai.generateText(
      'Es um editor SEO senior. Retorna apenas um JSON array valido, sem markdown. Preserva a estrutura e o volume do modulo recebido.',
      `Atualiza exclusivamente o modulo de contexto local para ${input.city}.

JSON atual:
${JSON.stringify(input.blocks, null, 2)}

Referencias externas verificadas obrigatorias:
${references.map((item) => `- ${item.entity}: ${item.final_url}`).join('\n')}

Regras:
- Remove todos os links externos existentes antes de inserir os fornecidos.
- Integra exatamente um link natural para cada referencia verificada.
- Usa os URLs exatamente como fornecidos.
- Formato: <a href="URL" target="_blank" rel="noopener">ancora descritiva</a>.
- Mantem o primeiro heading e os tipos de blocos existentes.
- Nao menciones outra cidade e nao cries qualquer URL.`,
    );
    this.logger.log(
      `[PERF] local_module_rewrite_ai city=${input.city} references=${references.length} duration_ms=${Date.now() - rewriteAiStartedAt}`,
    );
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new BadRequestException(
        'A IA nao devolveu um array para o contexto local.',
      );
    }
    const blocks = parsed.filter(
      (block): block is Record<string, unknown> =>
        Boolean(block) && typeof block === 'object' && !Array.isArray(block),
    );
    const validationStartedAt = Date.now();
    const validation = validateModuleExternalLinks(
      'modulo_12_zonas_contexto_local',
      blocks,
      references,
    );
    this.logger.log(
      `[PERF] local_module_link_validation city=${input.city} valid=${validation.valid} duration_ms=${Date.now() - validationStartedAt}`,
    );
    if (!validation.valid) {
      throw new BadRequestException(
        `O contexto local regenerado nao passou na validacao de links: ${validation.issue}`,
      );
    }
    this.logger.log(
      `[PERF] local_module_rewrite_done city=${input.city} blocks=${blocks.length} duration_ms=${Date.now() - rewriteStartedAt}`,
    );
    return blocks;
  }

  private async generateCandidates(input: {
    service: string;
    city: string | null;
    isMainPage: boolean;
    serviceNotes?: string | null;
  }): Promise<ExternalReferenceCandidate[]> {
    const locationInstruction = input.isMainPage
      ? 'A pagina e principal e nao possui cidade. Procura entidades nacionais ou gerais relevantes.'
      : `A pagina e local para ${input.city}. Procura entidades oficiais dessa localidade.`;
    const rewriteAiStartedAt = Date.now();
    const raw = await this.ai.generateText(
      `Es um investigador de referencias externas para conteudo SEO em Portugal.
Retorna apenas JSON valido. Propoe somente URLs HTTPS que acreditas serem reais, oficiais e diretamente relevantes.
Nao cries links internos nem inventes caminhos profundos: prefere a homepage oficial da entidade.`,
      `Pesquisa com base no teu conhecimento referencias para uma pagina sobre "${input.service}".
${locationInstruction}
Notas do servico: ${input.serviceNotes ?? 'sem notas adicionais'}

Devolve entre 5 e 10 candidatos neste formato:
[
  {
    "entity": "nome da entidade",
    "url": "https://dominio-oficial.pt/",
    "type": "brand | local_authority | technical_authority",
    "target_module": "modulo_4_servicos_realizados | modulo_12_zonas_contexto_local | modulo_15_mais_sobre_servico",
    "rationale": "porque esta referencia acrescenta contexto"
  }
]

Distribuicao pretendida:
- 2 ou 3 marcas/fabricantes realmente ligados ao servico no modulo_4_servicos_realizados.
- ${input.isMainPage ? '2 entidades portuguesas oficiais ou diretorios institucionais' : '3 entidades oficiais ou uteis da localidade indicada'} no modulo_12_zonas_contexto_local.
- 1 ou 2 entidades tecnicas, reguladoras ou associacoes setoriais no modulo_15_mais_sobre_servico.
- Nao uses Google, ChatGPT, Wikipedia, redes sociais, agregadores de baixa qualidade ou concorrentes diretos.`,
    );
    this.logger.log(
      `[PERF] link_candidate_research_ai service=${input.service} city=${input.city ?? 'main'} duration_ms=${Date.now() - rewriteAiStartedAt}`,
    );

    return this.parseCandidates(raw);
  }

  private parseCandidates(raw: string): ExternalReferenceCandidate[] {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      const seen = new Set<string>();
      return parsed.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const value = item as Record<string, unknown>;
        const entity =
          typeof value.entity === 'string' ? value.entity.trim() : '';
        const url = this.normalizeUrl(
          typeof value.url === 'string' ? value.url : '',
        );
        const type = value.type as ExternalReferenceType;
        const targetModule = value.target_module as ExternalReferenceModule;
        if (
          !entity ||
          !url ||
          seen.has(url) ||
          !ALLOWED_TYPES.has(type) ||
          !ALLOWED_MODULES.has(targetModule)
        ) {
          return [];
        }
        seen.add(url);
        return [
          {
            entity,
            url,
            type,
            target_module: targetModule,
            rationale:
              typeof value.rationale === 'string'
                ? value.rationale.trim() || undefined
                : undefined,
          },
        ];
      });
    } catch (error) {
      this.logger.warn(
        `Could not parse external link candidates: ${(error as Error).message}`,
      );
      return [];
    }
  }

  private async verifyCandidate(
    candidate: ExternalReferenceCandidate,
  ): Promise<VerifiedExternalReference | null> {
    const errors: string[] = [];
    for (const url of this.hostnameVariants(candidate.url)) {
      const variantStartedAt = Date.now();
      try {
        const result = await this.verifyHttp(url);
        this.logger.log(
          `[PERF] link_http_variant host=${new URL(url).hostname} status=${result.status} duration_ms=${Date.now() - variantStartedAt}`,
        );
        return {
          ...candidate,
          final_url: result.finalUrl,
          domain: new URL(result.finalUrl).hostname.toLowerCase(),
          page_title: result.title,
          page_description: result.description,
          http_status: result.status,
          relevance_score: 0,
          is_official: false,
        };
      } catch (error) {
        this.logger.warn(
          `[PERF] link_http_variant host=${new URL(url).hostname} status=failed duration_ms=${Date.now() - variantStartedAt} error=${(error as Error).message}`,
        );
        errors.push(`${new URL(url).hostname}: ${(error as Error).message}`);
      }
    }
    this.logger.warn(
      `Rejected external link ${candidate.url}: ${errors.join('; ')}`,
    );
    return null;
  }

  private async verifyHttp(url: string): Promise<HttpVerification> {
    let current = new URL(url);
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      await this.assertPublicUrl(current);
      const response = await this.requestForVerification(current);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location)
          throw new Error(`redirect ${response.status} without location`);
        current = new URL(location, current);
        continue;
      }

      if (
        !response.ok &&
        ![401, 403, 500, 502, 503, 504].includes(response.status)
      ) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      const html = contentType.includes('text/html')
        ? await this.readHtmlPreview(response)
        : '';
      return {
        finalUrl: current.toString(),
        status: response.status,
        title: this.extractMeta(html, 'title'),
        description: this.extractMeta(html, 'description'),
      };
    }
    throw new Error('too many redirects');
  }

  private async requestForVerification(url: URL): Promise<Response> {
    let head: Response | null = null;
    try {
      head = await this.fetchWithRetry(url, 'HEAD');
      if (head.status >= 300 && head.status < 400) return head;
    } catch {
      // Some institutional servers reject HEAD or fail its TLS connection.
    }

    try {
      const get = await this.fetchWithRetry(url, 'GET');
      if (
        get.ok ||
        [401, 403].includes(get.status) ||
        (get.status >= 300 && get.status < 400)
      ) {
        return get;
      }
      if (head && (head.ok || [401, 403].includes(head.status))) return head;
      return get;
    } catch (error) {
      if (head && (head.ok || [401, 403].includes(head.status))) return head;
      throw error;
    }
  }

  private async fetchWithRetry(
    url: URL,
    method: 'HEAD' | 'GET',
  ): Promise<Response> {
    let lastError: Error | null = null;
    let lastResponse: Response | null = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await fetch(url, {
          method,
          redirect: 'manual',
          signal: AbortSignal.timeout(this.requestTimeoutMs),
          headers: {
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.6',
            'User-Agent':
              'Mozilla/5.0 (compatible; BIBSEO-LinkVerifier/1.0; +https://bibseo.local)',
          },
        });
        if (![408, 425, 429, 500, 502, 503, 504].includes(response.status)) {
          return response;
        }
        lastResponse = response;
        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        lastError = error as Error;
      }
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
      }
    }
    if (lastResponse) return lastResponse;
    throw lastError ?? new Error(`${method} request failed`);
  }

  private async readHtmlPreview(response: Response): Promise<string> {
    if (!response.body) return '';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    const maximum = 131_072;
    try {
      while (total < maximum) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        const remaining = maximum - total;
        const chunk =
          value.byteLength > remaining ? value.slice(0, remaining) : value;
        chunks.push(chunk);
        total += chunk.byteLength;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(merged);
  }

  private hostnameVariants(value: string): string[] {
    const original = new URL(value);
    const alternate = new URL(value);
    alternate.hostname = original.hostname.startsWith('www.')
      ? original.hostname.slice(4)
      : `www.${original.hostname}`;
    return [...new Set([original.toString(), alternate.toString()])];
  }

  private async assertPublicUrl(url: URL): Promise<void> {
    if (url.protocol !== 'https:') throw new Error('only HTTPS is allowed');
    if (url.username || url.password)
      throw new Error('URL credentials are not allowed');
    if (url.port && url.port !== '443') throw new Error('non-standard port');
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      throw new Error('private hostname');
    }

    const addresses = isIP(hostname)
      ? [{ address: hostname }]
      : await lookup(hostname, { all: true, verbatim: true });
    if (
      !addresses.length ||
      addresses.some(({ address }) => this.isPrivateIp(address))
    ) {
      throw new Error('private or unresolved address');
    }
  }

  private isPrivateIp(address: string): boolean {
    const normalized = address.toLowerCase();
    if (normalized.includes(':')) {
      return (
        normalized === '::1' ||
        normalized === '::' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        normalized.startsWith('fe8') ||
        normalized.startsWith('fe9') ||
        normalized.startsWith('fea') ||
        normalized.startsWith('feb') ||
        normalized.startsWith('ff') ||
        normalized.startsWith('2001:db8:') ||
        normalized.startsWith('::ffff:127.') ||
        normalized.startsWith('::ffff:10.') ||
        normalized.startsWith('::ffff:192.168.')
      );
    }
    const parts = normalized.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
      return true;
    return (
      parts[0] === 0 ||
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
      parts[0] >= 224
    );
  }

  private extractMeta(
    html: string,
    kind: 'title' | 'description',
  ): string | null {
    if (!html) return null;
    const match =
      kind === 'title'
        ? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
        : (html.match(
            /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["'][^>]*>/i,
          ) ??
          html.match(
            /<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*>/i,
          ));
    return match?.[1]
      ? match[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 500)
      : null;
  }

  private async assessSemantics(
    context: { service: string; city: string | null; isMainPage: boolean },
    candidates: VerifiedExternalReference[],
  ): Promise<VerifiedExternalReference[]> {
    if (!candidates.length) return [];
    try {
      const rewriteAiStartedAt = Date.now();
    const raw = await this.ai.generateText(
        'Avalias referencias externas para SEO. Retorna apenas JSON valido e rejeita entidades irrelevantes, concorrentes e dominios que nao parecem oficiais.',
        `Contexto: servico "${context.service}"; localidade "${context.city ?? 'pagina principal sem cidade'}".

Candidatos tecnicamente acessiveis:
${JSON.stringify(
  candidates.map((candidate) => ({
    url: candidate.final_url,
    entity: candidate.entity,
    type: candidate.type,
    title: candidate.page_title,
    description: candidate.page_description,
  })),
  null,
  2,
)}

Retorna exatamente:
[{"url":"...","valid":true,"official":true,"relevance":0.95}]

Regras: relevance entre 0 e 1; valid apenas quando o destino corresponde a entidade e acrescenta contexto ao servico ou localidade; official apenas para site proprio da marca, municipio, organismo, associacao ou entidade referenciada.`,
      );
      this.logger.log(
        `[PERF] link_semantic_assessment_ai service=${context.service} city=${context.city ?? 'main'} candidates=${candidates.length} duration_ms=${Date.now() - rewriteAiStartedAt}`,
      );
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error('semantic assessment did not return an array');
      }
      const assessments = parsed.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      );
      const byUrl = new Map(
        assessments.map((item) => [
          this.normalizeUrl(typeof item.url === 'string' ? item.url : ''),
          item,
        ]),
      );
      const accepted = candidates.flatMap((candidate) => {
        const assessment =
          byUrl.get(this.normalizeUrl(candidate.final_url)) ??
          byUrl.get(this.normalizeUrl(candidate.url));
        const score = Number(assessment?.relevance ?? 0);
        if (
          assessment?.valid !== true ||
          !Number.isFinite(score) ||
          score < 0.65
        ) {
          return [];
        }
        return [
          {
            ...candidate,
            relevance_score: Math.min(1, Math.max(0, score)),
            is_official: assessment.official === true,
          },
        ];
      });
      return accepted.length > 0
        ? accepted
        : this.plausibleSemanticFallback(candidates);
    } catch (error) {
      this.logger.warn(
        `Semantic link assessment failed: ${(error as Error).message}`,
      );
      return this.plausibleSemanticFallback(candidates);
    }
  }

  private plausibleSemanticFallback(
    candidates: VerifiedExternalReference[],
  ): VerifiedExternalReference[] {
    return candidates.flatMap((candidate) =>
      this.isPlausiblyOfficial(candidate)
        ? [
            {
              ...candidate,
              relevance_score: 0.65,
              is_official: true,
            },
          ]
        : [],
    );
  }

  private isPlausiblyOfficial(candidate: VerifiedExternalReference): boolean {
    const domain = candidate.domain
      .replace(/^www\./, '')
      .split('.')[0]
      .replace(/[^a-z0-9]/g, '');
    const entity = candidate.entity
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    return (
      domain.length >= 3 &&
      (entity.includes(domain) ||
        domain.includes(entity.slice(0, Math.min(entity.length, 12))) ||
        candidate.domain.endsWith('.gov.pt'))
    );
  }

  private balanceReferences(
    references: VerifiedExternalReference[],
  ): VerifiedExternalReference[] {
    const limits = new Map<ExternalReferenceModule, number>([
      ['modulo_4_servicos_realizados', 2],
      ['modulo_12_zonas_contexto_local', 2],
      ['modulo_15_mais_sobre_servico', 1],
    ]);
    return [...references]
      .sort(
        (a, b) =>
          Number(b.is_official) - Number(a.is_official) ||
          b.relevance_score - a.relevance_score,
      )
      .filter(
        (reference, _index, all) =>
          all.findIndex((item) => item.domain === reference.domain) === _index,
      )
      .filter((reference) => {
        const remaining = limits.get(reference.target_module) ?? 0;
        if (remaining <= 0) return false;
        limits.set(reference.target_module, remaining - 1);
        return true;
      });
  }

  private async readFreshCache(
    candidate: ExternalReferenceCandidate,
  ): Promise<VerifiedExternalReference | null> {
    try {
      const cutoff = new Date(
        Date.now() - this.cacheDays * 86_400_000,
      ).toISOString();
      const result = await this.supabase
        .getClient()
        .from('external_link_cache')
        .select('*')
        .eq('url', candidate.url)
        .gte('verified_at', cutoff)
        .maybeSingle();
      const data = result.data as CachedLinkRow | null;
      const error = result.error as { message: string } | null;
      if (error || !data) return null;
      const row = data;
      return {
        ...candidate,
        final_url: row.final_url,
        domain: row.domain,
        entity: candidate.entity || row.entity_name,
        type: candidate.type,
        target_module: candidate.target_module,
        page_title: row.page_title,
        page_description: row.page_description,
        http_status: row.http_status,
        relevance_score: row.relevance_score,
        is_official: row.is_official,
      };
    } catch {
      return null;
    }
  }

  private async writeCache(
    reference: VerifiedExternalReference,
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .getClient()
        .from('external_link_cache')
        .upsert(
          {
            url: reference.url,
            final_url: reference.final_url,
            domain: reference.domain,
            entity_name: reference.entity,
            reference_type: reference.type,
            target_module: reference.target_module,
            page_title: reference.page_title,
            page_description: reference.page_description,
            http_status: reference.http_status,
            relevance_score: reference.relevance_score,
            is_official: reference.is_official,
            verified_at: new Date().toISOString(),
          },
          { onConflict: 'url' },
        );
      if (error)
        this.logger.debug(`External link cache unavailable: ${error.message}`);
    } catch {
      // The pipeline remains functional before the optional cache migration is applied.
    }
  }

  private normalizeUrl(value: string): string {
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'https:') return '';
      url.hash = '';
      return url.toString();
    } catch {
      return '';
    }
  }
}

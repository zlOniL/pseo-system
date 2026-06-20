import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { ValidationService } from '../validation/validation.service';
import { ContentsService, Content } from '../contents/contents.service';
import { ContentSectionsService } from '../contents/content-sections.service';
import { CitiesService } from '../cities/cities.service';
import { buildPrompt } from './prompt.builder';
import { slugify } from '../common/slug';
import { injectImages } from '../common/image-injector';
import { parseHtmlSections } from '../service-templates/html-section-parser';
import { GenerateDto } from './dto/generate.dto';
import { RegenerateDto } from './dto/regenerate.dto';
import { SitesService } from '../sites/sites.service';
import { WhitelabelContentService } from '../integrations/whitelabel-api/whitelabel-content.service';
import { buildExternalSlug } from '../integrations/whitelabel-api/whitelabel-json';
import { formatWhitelabelGenerationIssue } from '../integrations/whitelabel-api/whitelabel.types';
import { Service } from '../services/services.service';
import { PromptContextService } from '../prompt-context/prompt-context.service';
import { PromptContext } from '../prompt-context/prompt-context.types';
import { runWithConcurrency } from '../common/run-with-concurrency';
import {
  HtmlSectionKey,
  SECTION_KEYS,
  SectionKey,
} from '../service-templates/service-templates.types';
import {
  buildWpSectionExpansionPrompt,
  buildWpSectionPrompt,
} from './wp-section-prompt.builder';
import {
  finalMaximumWords,
  finalMinimumWords,
  getSectionVolumeConfig,
  sectionMaximumWords,
  sectionMinimumWords,
  sectionTargetWords,
} from './section-volume-policy';

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly ai: AiService,
    private readonly validation: ValidationService,
    private readonly contents: ContentsService,
    private readonly contentSections: ContentSectionsService,
    private readonly cities: CitiesService,
    private readonly sites: SitesService,
    private readonly whitelabelContent: WhitelabelContentService,
    private readonly promptContext: PromptContextService,
  ) {}

  async generate(dto: GenerateDto): Promise<Content> {
    const totalStartedAt = Date.now();
    this.logger.log(
      `[PERF] page_generation_start service=${dto.service} city=${dto.city ?? 'main'}`,
    );
    const site = dto.site_id ? await this.sites.findById(dto.site_id) : null;
    if (!site) {
      throw new BadRequestException(
        'Selecione um site antes de gerar conteudo.',
      );
    }
    this.logger.log(
      `Generate route using site ${site.name} (${site.integration_type})`,
    );
    if (site.integration_type === 'whitelabel_api') {
      const content = await this.generateWhitelabel(dto, site);
      this.logger.log(
        `[PERF] page_generation_done format=whitelabel_json service=${dto.service} city=${dto.city ?? 'main'} duration_ms=${Date.now() - totalStartedAt}`,
      );
      return content;
    }

    const htmlStartedAt = Date.now();
    const { html, metaDescription } = await this.buildHtml(dto);
    this.logger.log(
      `[PERF] page_html_ready service=${dto.service} duration_ms=${Date.now() - htmlStartedAt}`,
    );
    const minWords = dto.min_words ?? 5000;
    const result = this.validation.validate(
      html,
      dto.main_keyword,
      finalMinimumWords(minWords),
    );
    const content = await this.contents.save(
      dto,
      html,
      result,
      metaDescription,
    );
    await this.persistHtmlSections(content.id, html);
    this.logger.log(
      `[PERF] page_generation_done format=html service=${dto.service} city=${dto.city ?? 'main'} duration_ms=${Date.now() - totalStartedAt}`,
    );
    return content;
  }

  async regenerate(dto: RegenerateDto): Promise<Content> {
    const totalStartedAt = Date.now();
    const existing = await this.contents.findById(dto.content_id);
    dto.site_id = dto.site_id ?? existing.site_id ?? undefined;
    dto.service_id = dto.service_id ?? existing.service_id ?? undefined;

    const site = dto.site_id ? await this.sites.findById(dto.site_id) : null;
    if (site?.integration_type === 'whitelabel_api') {
      return this.regenerateWhitelabel(dto, site);
    }

    const { html, metaDescription } = await this.buildHtml(dto, dto.feedback);
    const minWords = dto.min_words ?? 5000;
    const result = this.validation.validate(
      html,
      dto.main_keyword,
      finalMinimumWords(minWords),
    );
    const content = await this.contents.update(
      dto.content_id,
      html,
      result,
      {
        video_url: dto.video_url,
        images: dto.images,
        related_services: dto.related_services,
      },
      metaDescription,
    );
    await this.persistHtmlSections(content.id, html);
    this.logger.log(
      `[PERF] page_generation_done format=html service=${dto.service} city=${dto.city ?? 'main'} duration_ms=${Date.now() - totalStartedAt}`,
    );
    return content;
  }

  /** Returns raw HTML (with {{IMAGE_N}} still present) before image injection. */
  async buildHtmlRaw(
    dto: GenerateDto,
    feedback?: string,
  ): Promise<{ html: string; metaDescription: string }> {
    const raw = this.isHtmlSectionGenerationEnabled()
      ? await this.generateHtmlRawBySections(dto, feedback)
      : await this.generateHtmlRawMonolithic(dto, feedback);

    const metaMatch = raw.match(/<!--\s*BIB_META:\s*([\s\S]*?)\s*-->/);
    const metaDescription = metaMatch ? metaMatch[1].trim() : '';
    let html = raw.replace(/<!--\s*BIB_META:[\s\S]*?-->\s*/g, '');

    // When no city, strip any leftover {{CITY}} placeholders the AI may have missed
    if (!dto.city) {
      html = html
        .replace(/\s+em\s+\{\{CITY\}\}/gi, '')
        .replace(/\{\{CITY\}\}/gi, '');
    }

    if (dto.skip_backlinks) {
      html = html
        .replace(/<h2[^>]*>[^<]*Atendemos[^<]*<\/h2>[\s\S]*$/i, '')
        .trimEnd();
    } else {
      const serviceSlug = slugify(dto.service);
      const site = dto.site_id
        ? await this.sites.findById(dto.site_id).catch(() => null)
        : null;
      const wpBase =
        site?.integration_type === 'wordpress'
          ? this.sites.wordpressBase(site)
          : (process.env.WP_BASE_URL ?? '').replace(/\/$/, '');
      const atendemosTambemHtml = this.cities.buildAtendemosTambem(
        dto.city ?? '',
        dto.service,
        serviceSlug,
        wpBase,
      );
      html = this.replaceAtendemosTambem(html, atendemosTambemHtml);
    }

    return { html, metaDescription };
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async generateHtmlRawMonolithic(
    dto: GenerateDto,
    feedback?: string,
  ): Promise<string> {
    const promptContext = this.promptContext.resolve({ service: dto.service });
    const { system, user } = buildPrompt(dto, feedback, promptContext);
    return this.ai.generateText(system, user);
  }

  private isHtmlSectionGenerationEnabled(): boolean {
    if (/^(false|0)$/i.test(process.env.SECTION_GENERATION_ENABLED ?? '')) {
      return false;
    }

    const formats = (
      process.env.SECTION_GENERATION_FORMATS ?? 'html,whitelabel_json'
    )
      .split(',')
      .map((format) => format.trim())
      .filter(Boolean);

    return formats.includes('html');
  }

  private async generateHtmlRawBySections(
    dto: GenerateDto,
    feedback?: string,
  ): Promise<string> {
    const totalStartedAt = Date.now();
    const minWords = dto.min_words ?? 5000;
    this.logger.log(
      `[PERF] html_sections_start service=${dto.service} sections=${SECTION_KEYS.length} concurrency=${getSectionVolumeConfig().sectionConcurrency}`,
    );

    const sections = {} as Partial<Record<HtmlSectionKey, string>>;
    const promptContext = this.promptContext.resolve({ service: dto.service });
    const config = getSectionVolumeConfig();

    await runWithConcurrency(
      SECTION_KEYS,
      config.sectionConcurrency,
      async (sectionKey) => {
        const targetWords = sectionTargetWords(sectionKey, minWords, config);
        const minimumWords = sectionMinimumWords(sectionKey, minWords, config);
        const maximumWords = sectionMaximumWords(sectionKey, minWords, config);
        const startedAt = Date.now();
        const html = await this.generateWpSectionWithRepair({
          dto,
          feedback,
          sectionKey,
          targetWords,
          minimumWords,
          maximumWords,
          generatedSummary: this.parallelSectionSummary(sectionKey),
          promptContext,
        });
        sections[sectionKey] = html;
        this.logger.log(
          `Generated WP section ${sectionKey} (${this.countVisibleWords(html)} words) in ${Date.now() - startedAt}ms`,
        );
      },
    );

    this.logger.log(
      `[PERF] html_initial_sections_done service=${dto.service} duration_ms=${Date.now() - totalStartedAt}`,
    );
    const expansionStartedAt = Date.now();
    const expanded = await this.expandWpShortSectionsIfNeeded(
      dto,
      sections,
      minWords,
      feedback,
    );

    this.logger.log(
      `[PERF] html_expansion_done service=${dto.service} duration_ms=${Date.now() - expansionStartedAt}`,
    );
    const html = SECTION_KEYS.map((key) => expanded[key])
      .filter(Boolean)
      .join('\n\n');
    const finalWords = this.countVisibleWords(html);
    const minimumFinalWords = finalMinimumWords(minWords, config);
    const maximumFinalWords = finalMaximumWords(minWords, config);
    if (finalWords < minimumFinalWords) {
      throw new BadRequestException(
        `A IA gerou ${finalWords}/${minimumFinalWords} palavras apos expansao por secoes.`,
      );
    }
    if (finalWords > maximumFinalWords) {
      this.logger.warn(
        `WP section generation above target range (${finalWords}/${maximumFinalWords}) for ${dto.service}`,
      );
    }

    this.logger.log(
      `[PERF] html_sections_done service=${dto.service} words=${finalWords} duration_ms=${Date.now() - totalStartedAt}`,
    );
    return html;
  }

  private async generateWpSection(input: {
    dto: GenerateDto;
    feedback?: string;
    sectionKey: HtmlSectionKey;
    targetWords: number;
    minimumWords: number;
    maximumWords: number;
    generatedSummary?: string;
    promptContext?: PromptContext;
  }): Promise<string> {
    const { system, user } = buildWpSectionPrompt(input);
    const raw = await this.ai.generateText(system, user);
    return this.cleanSectionHtml(raw, input.sectionKey);
  }

  private async generateWpSectionWithRepair(input: {
    dto: GenerateDto;
    feedback?: string;
    sectionKey: HtmlSectionKey;
    targetWords: number;
    minimumWords: number;
    maximumWords: number;
    generatedSummary?: string;
    promptContext?: PromptContext;
  }): Promise<string> {
    const config = getSectionVolumeConfig();
    const minimumWords = input.minimumWords;
    let html = await this.generateWpSection(input);
    let words = this.countVisibleWords(html);

    for (
      let attempt = 1;
      words < minimumWords && attempt <= config.repairAttempts;
      attempt += 1
    ) {
      const repairStartedAt = Date.now();
      this.logger.warn(
        `WP section ${input.sectionKey} below target (${words}/${minimumWords}); repair attempt ${attempt}/${config.repairAttempts}`,
      );
      const { system, user } = buildWpSectionExpansionPrompt({
        ...input,
        currentHtml: html,
        currentWords: words,
      });
      const raw = await this.ai.generateText(system, user);
      html = this.cleanSectionHtml(raw, input.sectionKey);
      words = this.countVisibleWords(html);
      this.logger.log(
        `[PERF] html_section_repair section=${input.sectionKey} attempt=${attempt}/${config.repairAttempts} words=${words}/${minimumWords} duration_ms=${Date.now() - repairStartedAt}`,
      );
    }

    return html;
  }

  private async expandWpShortSectionsIfNeeded(
    dto: GenerateDto,
    sections: Partial<Record<HtmlSectionKey, string>>,
    minWords: number,
    feedback?: string,
  ): Promise<Partial<Record<HtmlSectionKey, string>>> {
    const config = getSectionVolumeConfig();
    const maxRounds = config.finalExpansionRounds;
    const maxSectionsPerRound = config.maxSectionsPerExpansionRound;
    let current = { ...sections };

    for (let round = 1; round <= maxRounds; round += 1) {
      const roundStartedAt = Date.now();
      const totalWords = this.countVisibleWords(
        SECTION_KEYS.map((key) => current[key]).join('\n\n'),
      );
      const minimumFinalWords = finalMinimumWords(minWords, config);
      if (totalWords >= minimumFinalWords) return current;

      this.logger.warn(
        `WP section generation below target range (${totalWords}/${minimumFinalWords}); expansion round ${round}/${maxRounds}`,
      );

      const deficit = minimumFinalWords - totalWords;
      const candidates = this.expansionCandidates(
        current,
        minWords,
        deficit,
        maxSectionsPerRound,
      ).slice(0, maxSectionsPerRound);
      if (candidates.length === 0) return current;

      const promptContext = this.promptContext.resolve({ service: dto.service });
      const expansions = await runWithConcurrency(
        candidates,
        config.sectionConcurrency,
        async (candidate) => {
          const currentHtml = current[candidate.sectionKey] ?? '';
          const minimumWords = sectionMinimumWords(
            candidate.sectionKey,
            minWords,
            config,
          );
          const maximumWords = sectionMaximumWords(
            candidate.sectionKey,
            minWords,
            config,
          );
          const { system, user } = buildWpSectionExpansionPrompt({
            dto,
            feedback,
            sectionKey: candidate.sectionKey,
            targetWords: candidate.targetWords,
            minimumWords,
            maximumWords,
            currentHtml,
            currentWords: candidate.currentWords,
            promptContext,
          });
          const raw = await this.ai.generateText(system, user);
          const expanded = this.cleanSectionHtml(raw, candidate.sectionKey);
          this.logger.log(
            `Expanded WP section ${candidate.sectionKey}: ${candidate.currentWords} -> ${this.countVisibleWords(expanded)} words`,
          );
          return { sectionKey: candidate.sectionKey, expanded };
        },
      );

      for (const expansion of expansions) {
        current[expansion.sectionKey] = expansion.expanded;
      }
      this.logger.log(
        `[PERF] html_expansion_round round=${round}/${maxRounds} sections=${expansions.length} duration_ms=${Date.now() - roundStartedAt}`,
      );
    }

    return current;
  }

  private parallelSectionSummary(sectionKey: HtmlSectionKey): string {
    const otherSections = SECTION_KEYS.filter((key) => key !== sectionKey);
    return [
      'As secoes desta pagina sao geradas em paralelo.',
      `Esta chamada deve focar apenas em "${sectionKey}".`,
      `Evita antecipar ou repetir em profundidade os temas reservados para: ${otherSections.join(', ')}.`,
    ].join('\n');
  }

  private expansionCandidates(
    sections: Partial<Record<HtmlSectionKey, string>>,
    minWords: number,
    deficit: number,
    maxSectionsPerRound: number,
  ): Array<{
    sectionKey: HtmlSectionKey;
    currentWords: number;
    targetWords: number;
    deficit: number;
    priority: number;
  }> {
    const priority: HtmlSectionKey[] = [
      'intro',
      'avarias_comuns',
      'assistencia_especializada',
      'prevencao',
      'tipos',
      'servicos',
      'servico_24h',
      'reparar_ou_substituir',
      'por_que_escolher',
      'integracao_servicos',
      'contexto_local',
      'perguntas_frequentes',
      'contacte_empresa',
      'mais_sobre',
      'como_funciona',
    ];

    return priority
      .map((sectionKey, index) => {
        const currentWords = this.countVisibleWords(sections[sectionKey] ?? '');
        const targetWords = Math.max(
          sectionTargetWords(sectionKey, minWords),
          currentWords + Math.ceil(deficit / Math.max(1, maxSectionsPerRound)),
        );
        return {
          sectionKey,
          currentWords,
          targetWords,
          deficit: Math.max(0, targetWords - currentWords),
          priority: index,
        };
      })
      .filter((candidate) => candidate.deficit > 0)
      .sort((a, b) => b.deficit - a.deficit || a.priority - b.priority);
  }

  private cleanSectionHtml(raw: string, sectionKey: HtmlSectionKey): string {
    let html = raw
      .replace(/^```[a-z0-9_-]*\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    html = html
      .replace(/<!DOCTYPE[\s\S]*?<body[^>]*>/i, '')
      .replace(/<\/body>[\s\S]*$/i, '')
      .replace(/<\/?html[^>]*>/gi, '')
      .trim();

    return `<!-- BIB_SECTION:${sectionKey} -->\n${html}\n<!-- /BIB_SECTION:${sectionKey} -->`;
  }

  private countVisibleWords(html: string): number {
    const text = html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\{\{IMAGE_\d+\}\}/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return text.match(/[\p{L}\p{N}]+(?:[.'’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  }

  private async buildHtml(
    dto: GenerateDto,
    feedback?: string,
  ): Promise<{ html: string; metaDescription: string }> {
    const { html: rawHtml, metaDescription } = await this.buildHtmlRaw(
      dto,
      feedback,
    );
    const html = injectImages(
      rawHtml,
      dto.images ?? [],
      dto.main_keyword,
      dto.service,
      dto.city ?? '',
    );
    return { html, metaDescription };
  }

  private async generateWhitelabel(
    dto: GenerateDto,
    site: Awaited<ReturnType<SitesService['findById']>>,
  ): Promise<Content> {
    const service = this.buildSyntheticService(dto);
    const baseCity = dto.city ?? null;
    const generated = await this.whitelabelContent.generateTemplate({
      service,
      site,
      dto: {
        base_city: baseCity ?? undefined,
        service_notes: dto.service_notes,
        related_services: dto.related_services,
      },
      baseCity,
      isMainPage: !baseCity,
    });

    const validationResult = {
      score: 100,
      issues: generated.issues.map(formatWhitelabelGenerationIssue),
      breakdown: { structure: 30, seo: 40, content: 30 },
    };
    const content = await this.contents.save(
      {
        ...dto,
        site_id: site.id,
        service_id: dto.service_id,
        output_format: 'whitelabel_json',
        content_json: generated.contentJson,
        external_page_type: baseCity ? 'service_location' : 'service',
        external_slug: buildExternalSlug(dto.service, baseCity ?? undefined),
      },
      null,
      validationResult,
      generated.generated.page.seo_description,
      'ai',
    );
    await this.persistJsonSections(content.id, generated.sections);
    return content;
  }

  private async regenerateWhitelabel(
    dto: RegenerateDto,
    site: Awaited<ReturnType<SitesService['findById']>>,
  ): Promise<Content> {
    const service = this.buildSyntheticService(dto);
    const baseCity = dto.city || null;
    const generated = await this.whitelabelContent.generateTemplate({
      service,
      site,
      dto: {
        base_city: baseCity ?? undefined,
        service_notes: dto.service_notes,
        related_services: dto.related_services,
        feedback: dto.feedback,
      },
      baseCity,
      isMainPage: !baseCity,
    });

    const validationResult = {
      score: 100,
      issues: generated.issues.map(formatWhitelabelGenerationIssue),
      breakdown: { structure: 30, seo: 40, content: 30 },
    };

    return this.contents.updateWhitelabel(
      dto.content_id,
      generated.contentJson,
      validationResult,
      {
        video_url: dto.video_url,
        images: dto.images,
        related_services: dto.related_services,
        external_page_type: baseCity ? 'service_location' : 'service',
        external_slug: buildExternalSlug(dto.service, baseCity ?? undefined),
      },
      generated.generated.page.seo_description,
    );
  }

  private buildSyntheticService(dto: GenerateDto): Service {
    return {
      id: dto.service_id ?? '',
      created_at: new Date().toISOString(),
      site_id: dto.site_id ?? null,
      name: dto.service,
      slug: slugify(dto.service),
      video_url: dto.video_url ?? null,
      images: dto.images ?? [],
      related_services: dto.related_services ?? [],
      service_notes: dto.service_notes ?? null,
      tone: dto.tone ?? '',
      min_words: dto.min_words ?? 5000,
      status: 'active',
      wordpress_category: dto.wordpress_category ?? null,
      featured_image_asset_id: null,
      featured_image_alt: null,
      featured_image_url: null,
      template_html: null,
      template_base_city: null,
      seo_title: null,
      seo_description: null,
    };
  }

  private replaceAtendemosTambem(html: string, replacement: string): string {
    const regex = /<h2[^>]*>[^<]*Atendemos[^<]*<\/h2>[\s\S]*?(?=<h2)/i;
    if (regex.test(html)) {
      return html.replace(regex, replacement);
    }
    const perguntasMatch = /<h2[^>]*>[^<]*Perguntas Frequentes/i;
    if (perguntasMatch.test(html)) {
      return html.replace(
        perguntasMatch,
        replacement + '\n\n<h2 style="color: #320000;">Perguntas Frequentes',
      );
    }
    const contacteMatch = /<h2[^>]*>[^<]*Contacte a Empresa/i;
    if (contacteMatch.test(html)) {
      return html.replace(
        contacteMatch,
        replacement + '\n\n<h2 style="color: #320000;">Contacte a Empresa',
      );
    }
    return html + '\n\n' + replacement;
  }

  private async persistHtmlSections(
    contentId: string,
    html: string,
  ): Promise<void> {
    try {
      const { sections } = parseHtmlSections(html);
      await this.contentSections.replaceHtmlSections(contentId, sections);
    } catch (err) {
      this.logger.warn(
        `Could not persist HTML sections for content ${contentId}: ${(err as Error).message}`,
      );
    }
  }

  private async persistJsonSections(
    contentId: string,
    sections: Map<SectionKey, unknown>,
  ): Promise<void> {
    try {
      await this.contentSections.replaceJsonSections(contentId, sections);
    } catch (err) {
      this.logger.warn(
        `Could not persist JSON sections for content ${contentId}: ${(err as Error).message}`,
      );
    }
  }
}

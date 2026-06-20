import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AiService } from '../../ai/ai.service';
import { Service } from '../../services/services.service';
import { GenerateTemplateDto } from '../../services/dto/generate-template.dto';
import { Site, SitesService } from '../../sites/sites.service';
import {
  SectionKey,
  SectionLibraryRow,
  WHITELABEL_MODULES,
  WHITELABEL_SECTION_KEYS,
} from '../../service-templates/service-templates.types';
import {
  buildWhitelabelModulePrompt,
  buildWhitelabelShellPrompt,
} from './whitelabel-prompt.builder';
import {
  buildExternalSlug,
  countTextWords,
  extractSectionMap,
  generatedToContentJson,
  parseGeneratedModuleBlocks,
  parseGeneratedShell,
  removeMainPageGeoPlaceholders,
  replaceInJson,
} from './whitelabel-json';
import {
  WhitelabelContentJson,
  WhitelabelGenerationIssue,
  WhitelabelGeneratedPage,
} from './whitelabel.types';
import { WhitelabelApiClient } from './whitelabel-api.client';
import { ExternalLinkResearchService } from './external-link-research.service';
import { VerifiedExternalReference } from './external-link.types';
import { validateModuleExternalLinks } from './external-link-validation';
import { runWithConcurrency } from '../../common/run-with-concurrency';

type ModuleGenerationResult = {
  sectionKey: (typeof WHITELABEL_MODULES)[number]['key'];
  blocks: Array<Record<string, unknown>> | null;
  issue?: WhitelabelGenerationIssue;
};

@Injectable()
export class WhitelabelContentService {
  private readonly logger = new Logger(WhitelabelContentService.name);
  private readonly maxWordCountAttempts = 3;

  constructor(
    private readonly ai: AiService,
    private readonly sites: SitesService,
    private readonly client: WhitelabelApiClient,
    private readonly externalLinks: ExternalLinkResearchService,
  ) {}

  async getBlueprintContext(site: Site): Promise<Record<string, unknown>> {
    const startedAt = Date.now();
    const cached = await this.sites.getBlueprints(site.id);
    if (cached['service-page'] && cached['pseo-rules']) {
      this.logger.log(
        `[PERF] whitelabel_blueprints source=cache site=${site.id} duration_ms=${Date.now() - startedAt}`,
      );
      return cached;
    }

    const servicePage = await this.client.fetchBlueprint(site, 'service-page');
    const pseoRules = await this.client.fetchBlueprint(site, 'pseo-rules');
    await this.sites.saveBlueprint(site.id, 'service-page', servicePage);
    await this.sites.saveBlueprint(site.id, 'pseo-rules', pseoRules);
    this.logger.log(
      `[PERF] whitelabel_blueprints source=api site=${site.id} duration_ms=${Date.now() - startedAt}`,
    );
    return { 'service-page': servicePage, 'pseo-rules': pseoRules };
  }

  async generateTemplate(input: {
    service: Service;
    site: Site;
    dto: GenerateTemplateDto;
    baseCity: string | null;
    isMainPage: boolean;
  }): Promise<{
    generated: WhitelabelGeneratedPage;
    contentJson: WhitelabelContentJson;
    sections: Map<SectionKey, unknown>;
    issues: WhitelabelGenerationIssue[];
  }> {
    const totalStartedAt = Date.now();
    this.logger.log(
      `[PERF] whitelabel_generation_start service=${input.service.name} city=${input.baseCity ?? 'main'} concurrency=${this.moduleConcurrency()}`,
    );
    const issues: WhitelabelGenerationIssue[] = [];
    let blueprints: Record<string, unknown> = {};
    try {
      blueprints = await this.getBlueprintContext(input.site);
    } catch (error) {
      const message = (error as Error).message;
      issues.push({
        section_key: 'blueprints',
        severity: 'warning',
        code: 'generation_error',
        message: `Blueprints indisponiveis; geracao continuou sem esse contexto: ${message}`,
        attempts: 1,
      });
      this.logger.warn(`Blueprint context skipped: ${message}`);
    }
    const minWords = input.service.min_words ?? 5000;
    let externalReferences: VerifiedExternalReference[] = [];
    const linksStartedAt = Date.now();
    try {
      externalReferences = await this.externalLinks.research({
        service: input.service.name,
        city: input.baseCity,
        isMainPage: input.isMainPage,
        serviceNotes: input.dto.service_notes ?? input.service.service_notes,
      });
    } catch (error) {
      const message = (error as Error).message;
      issues.push({
        section_key: 'external_link_research',
        severity: 'warning',
        code: 'external_links',
        message: `Pesquisa de links externos ignorada: ${message}`,
        attempts: 1,
      });
      this.logger.warn(`External link research skipped: ${message}`);
    }
    this.logger.log(
      `[PERF] whitelabel_link_research_done service=${input.service.name} references=${externalReferences.length} duration_ms=${Date.now() - linksStartedAt}`,
    );

    let shell: ReturnType<typeof parseGeneratedShell>;
    const shellStartedAt = Date.now();
    try {
      shell = await this.generateShell(input, blueprints);
    } catch (error) {
      const lastError = error as Error;
      issues.push({
        section_key: 'intro',
        severity: 'warning',
        code: this.classifyModuleError(lastError),
        message: `Base da pagina substituida por fallback apos 3 tentativas: ${lastError.message}`,
        attempts: this.maxWordCountAttempts,
      });
      shell = this.fallbackShell(input);
      this.logger.warn(`Whitelabel shell fallback used: ${lastError.message}`);
    }
    this.logger.log(
      `[PERF] whitelabel_shell_done service=${input.service.name} duration_ms=${Date.now() - shellStartedAt}`,
    );
    const generated: WhitelabelGeneratedPage = {
      page: shell.page,
      sections: {
        intro: shell.intro,
      } as WhitelabelGeneratedPage['sections'],
    };

    const moduleTargetWords = this.targetWordsPerModule(minWords);

    const modulesStartedAt = Date.now();
    const moduleResults = await runWithConcurrency(
      WHITELABEL_MODULES,
      this.moduleConcurrency(),
      (module) =>
        this.generateModule({
          ...input,
          blueprints,
          module,
          targetWords: moduleTargetWords,
          externalReferences,
        }),
    );
    this.logger.log(
      `[PERF] whitelabel_modules_done service=${input.service.name} modules=${WHITELABEL_MODULES.length} duration_ms=${Date.now() - modulesStartedAt}`,
    );
    for (const result of moduleResults) {
      if (result.blocks) generated.sections[result.sectionKey] = result.blocks;
      if (result.issue) issues.push(result.issue);
    }

    const normalized = input.isMainPage
      ? (removeMainPageGeoPlaceholders(generated) as WhitelabelGeneratedPage)
      : generated;
    const contentJson = generatedToContentJson(normalized, { tolerant: true });
    const wordCount = countTextWords(contentJson);

    if (wordCount < minWords) {
      issues.push({
        section_key: 'page',
        severity: 'warning',
        code: 'final_word_count',
        message: `Conteudo final abaixo do minimo configurado (${wordCount}/${minWords} palavras).`,
        attempts: 1,
      });
    }

    const sections = extractSectionMap(normalized);
    this.logger.log(
      `[PERF] whitelabel_generation_done service=${input.service.name} city=${input.baseCity ?? 'main'} words=${wordCount} issues=${issues.length} duration_ms=${Date.now() - totalStartedAt}`,
    );
    return { generated: normalized, contentJson, sections, issues };
  }

  private async generateShell(
    input: {
      service: Service;
      site: Site;
      dto: GenerateTemplateDto;
      baseCity: string | null;
      isMainPage: boolean;
    },
    blueprints: Record<string, unknown>,
  ): Promise<ReturnType<typeof parseGeneratedShell>> {
    const { system, user } = buildWhitelabelShellPrompt({
      service: input.service,
      baseCity: input.baseCity,
      isMainPage: input.isMainPage,
      blueprints,
      dto: input.dto,
    });

    let lastError: Error | null = null;
    for (
      let attempt = 1;
      attempt <= this.maxWordCountAttempts;
      attempt += 1
    ) {
      const attemptStartedAt = Date.now();
      try {
        const raw = await this.ai.generateText(system, user);
        const parsed = parseGeneratedShell(raw);
        this.logger.log(
          `[PERF] whitelabel_shell_attempt attempt=${attempt}/${this.maxWordCountAttempts} status=ok duration_ms=${Date.now() - attemptStartedAt}`,
        );
        return parsed;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `[PERF] whitelabel_shell_attempt attempt=${attempt}/${this.maxWordCountAttempts} status=failed duration_ms=${Date.now() - attemptStartedAt} error=${lastError.message}`,
        );
      }
    }
    throw lastError ?? new Error('Base da pagina nao foi gerada.');
  }

  private fallbackShell(input: {
    service: Service;
    baseCity: string | null;
    isMainPage: boolean;
  }): ReturnType<typeof parseGeneratedShell> {
    const title = input.isMainPage
      ? input.service.name
      : `${input.service.name} em ${input.baseCity}`;
    return {
      page: {
        title,
        slug: buildExternalSlug(
          input.service.name,
          input.baseCity ?? undefined,
        ),
        seo_title: title,
        seo_description: `Assistencia de ${title} com atendimento profissional.`,
      },
      intro: {
        hero: {
          title,
          description: `Servico profissional de ${title}.`,
        },
      },
    };
  }

  private async generateModule(input: {
    service: Service;
    site: Site;
    dto: GenerateTemplateDto;
    baseCity: string | null;
    isMainPage: boolean;
    blueprints: Record<string, unknown>;
    module: (typeof WHITELABEL_MODULES)[number];
    targetWords: number;
    externalReferences: VerifiedExternalReference[];
  }): Promise<ModuleGenerationResult> {
    const moduleStartedAt = Date.now();
    this.logger.log(
      `[PERF] whitelabel_module_start section=${input.module.key} target_words=${input.targetWords}`,
    );
    let lastWordCount = 0;
    let lastError: Error | null = null;
    let previousIssue: string | undefined;
    let lastValidBlocks: Array<Record<string, unknown>> | null = null;
    let lastIssueCode: WhitelabelGenerationIssue['code'] = 'generation_error';

    for (let attempt = 1; attempt <= this.maxWordCountAttempts; attempt += 1) {
      const attemptStartedAt = Date.now();
      try {
        const { system, user } = buildWhitelabelModulePrompt({
          service: input.service,
          baseCity: input.baseCity,
          isMainPage: input.isMainPage,
          blueprints: input.blueprints,
          dto: input.dto,
          module: input.module,
          targetWords: input.targetWords,
          attempt,
          previousWordCount: lastWordCount,
          previousIssue,
          externalReferences: input.externalReferences,
        });

        const raw = await this.ai.generateText(system, user);
        const blocks = parseGeneratedModuleBlocks(raw, input.module.title);
        lastValidBlocks = blocks;
        const structureIssue = this.validateModuleBoundaries(
          input.module.key,
          blocks,
        );
        if (structureIssue) {
          previousIssue = structureIssue;
          lastIssueCode = 'structure';
          lastError = new Error(structureIssue);
          this.logger.warn(
            `${input.module.title} structure issue attempt ${attempt}/${this.maxWordCountAttempts}: ${structureIssue}`,
          );
          continue;
        }

        const linkValidationStartedAt = Date.now();
        const linkValidation = validateModuleExternalLinks(
          input.module.key,
          blocks,
          input.externalReferences,
        );
        this.logger.log(
          `[PERF] whitelabel_link_validation section=${input.module.key} valid=${linkValidation.valid} external_urls=${linkValidation.externalUrls?.length ?? 0} duration_ms=${Date.now() - linkValidationStartedAt}`,
        );
        if (!linkValidation.valid) {
          previousIssue = linkValidation.issue;
          lastError = new Error(linkValidation.issue);
          lastIssueCode = 'external_links';
          this.logger.warn(
            `${input.module.title} external link issue attempt ${attempt}/${this.maxWordCountAttempts}: ${linkValidation.issue}`,
          );
          continue;
        }

        lastWordCount = countTextWords(blocks);

        if (lastWordCount >= input.targetWords) {
          this.logger.log(
            `[PERF] whitelabel_module_done section=${input.module.key} status=ok attempt=${attempt} words=${lastWordCount}/${input.targetWords} attempt_duration_ms=${Date.now() - attemptStartedAt} total_duration_ms=${Date.now() - moduleStartedAt}`,
          );
          return { sectionKey: input.module.key, blocks };
        }

        this.logger.warn(
          `${input.module.title} below target (${lastWordCount}/${input.targetWords}); attempt ${attempt}/${this.maxWordCountAttempts}`,
        );
        previousIssue = `conteudo abaixo do minimo do modulo (${lastWordCount}/${input.targetWords})`;
        lastIssueCode = 'word_count';
      } catch (err) {
        lastError = err as Error;
        previousIssue = lastError.message;
        lastIssueCode = this.classifyModuleError(lastError);
        this.logger.warn(
          `[PERF] whitelabel_module_attempt section=${input.module.key} status=failed attempt=${attempt}/${this.maxWordCountAttempts} duration_ms=${Date.now() - attemptStartedAt} error=${lastError.message}`,
        );
      }
    }

    if (lastValidBlocks) {
      this.logger.warn(
        `[PERF] whitelabel_module_done section=${input.module.key} status=warning attempts=${this.maxWordCountAttempts} total_duration_ms=${Date.now() - moduleStartedAt} reason=${lastIssueCode}`,
      );
      return {
        sectionKey: input.module.key,
        blocks: lastValidBlocks,
        issue: {
          section_key: input.module.key,
          severity: 'warning',
          code: lastIssueCode,
          message:
            previousIssue ??
            `Secao mantida com ${lastWordCount}/${input.targetWords} palavras.`,
          attempts: this.maxWordCountAttempts,
        },
      };
    }

    const fatal = ['rate_limit', 'invalid_json', 'invalid_blocks'].includes(
      lastIssueCode,
    );
    this.logger.error(
      `[PERF] whitelabel_module_done section=${input.module.key} status=${fatal ? 'failed' : 'fallback'} attempts=${this.maxWordCountAttempts} total_duration_ms=${Date.now() - moduleStartedAt} reason=${lastIssueCode}`,
    );
    return {
      sectionKey: input.module.key,
      blocks: fatal
        ? null
        : [
            {
              type: 'heading',
              level: 2,
              text: input.module.display_title,
            },
          ],
      issue: {
        section_key: input.module.key,
        severity: fatal ? 'error' : 'warning',
        code: lastIssueCode,
        message:
          lastError?.message ??
          `${input.module.title} nao produziu conteudo utilizavel.`,
        attempts: this.maxWordCountAttempts,
      },
    };
  }

  private moduleConcurrency(): number {
    const configured = Math.floor(
      Number(process.env.WHITELABEL_GENERATION_CONCURRENCY),
    );
    return Number.isFinite(configured) && configured > 0 ? configured : 5;
  }

  private classifyModuleError(
    error: Error,
  ): WhitelabelGenerationIssue['code'] {
    const message = error.message.toLowerCase();
    if (/\b429\b|rate.?limit|limite|esgotad/.test(message)) {
      return 'rate_limit';
    }
    if (/json invalido|invalid json/.test(message)) return 'invalid_json';
    if (/nao e um array de blocos|not an array/.test(message)) {
      return 'invalid_blocks';
    }
    return 'generation_error';
  }

  private validateModuleBoundaries(
    moduleKey: string,
    blocks: Array<Record<string, unknown>>,
  ): string | null {
    if (moduleKey === 'modulo_13_perguntas_frequentes') {
      return blocks.some((block) => block.type === 'faq_list')
        ? null
        : 'Modulo 13 sem bloco faq_list.';
    }

    if (blocks.some((block) => block.type === 'faq_list')) {
      return 'FAQ gerado fora do Modulo 13.';
    }

    const headingTexts = blocks
      .filter((block) =>
        ['heading', 'subheading', 'minor_heading'].includes(
          typeof block.type === 'string' ? block.type : '',
        ),
      )
      .map((block) => {
        if (typeof block.text === 'string') return block.text.trim();
        if (typeof block.title === 'string') return block.title.trim();
        return '';
      })
      .filter(Boolean);

    if (headingTexts.some((text) => /perguntas\s+frequentes|faq/i.test(text))) {
      return 'Titulo de Perguntas Frequentes gerado fora do Modulo 13.';
    }

    return null;
  }

  private targetWordsPerModule(minWords: number): number {
    const visibleHeroReserve = 350;
    return Math.max(
      260,
      Math.ceil((minWords - visibleHeroReserve) / WHITELABEL_MODULES.length) +
        75,
    );
  }

  async assembleFromLibrary(input: {
    service: Service;
    city: string;
    rows: Map<SectionKey, SectionLibraryRow>;
  }): Promise<{ contentJson: WhitelabelContentJson; externalSlug: string }> {
    const sections = {} as WhitelabelGeneratedPage['sections'];

    for (const key of WHITELABEL_SECTION_KEYS) {
      const row = input.rows.get(key);
      if (!row) continue;
      sections[key] = replaceInJson(
        row.content_json,
        row.base_city,
        input.city,
      );
    }

    const localKey = 'modulo_12_zonas_contexto_local';
    const localBlocks = sections[localKey];
    if (Array.isArray(localBlocks)) {
      sections[localKey] = await this.externalLinks.rewriteLocalModule({
        service: input.service.name,
        city: input.city,
        serviceNotes: input.service.service_notes,
        blocks: localBlocks.filter(
          (block): block is Record<string, unknown> =>
            Boolean(block) &&
            typeof block === 'object' &&
            !Array.isArray(block),
        ),
      });
    }

    const generated: WhitelabelGeneratedPage = {
      page: {
        title: `${input.service.name} em ${input.city}`,
        slug: buildExternalSlug(input.service.name, input.city),
        seo_title: `${input.service.name} em ${input.city} 24 Horas`,
        seo_description: `Assistencia de ${input.service.name} em ${input.city} com atendimento rapido e equipa especializada.`,
      },
      sections,
    };

    return {
      contentJson: generatedToContentJson(generated),
      externalSlug: generated.page.slug,
    };
  }
}

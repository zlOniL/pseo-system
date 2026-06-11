import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AiService } from '../../ai/ai.service';
import { Service } from '../../services/services.service';
import { GenerateTemplateDto } from '../../services/dto/generate-template.dto';
import { Site, SitesService } from '../../sites/sites.service';
import {
  SectionKey,
  SECTION_KEYS,
  SectionLibraryRow,
} from '../../service-templates/service-templates.types';
import { buildWhitelabelPrompt } from './whitelabel-prompt.builder';
import {
  buildWhitelabelPageMetadataPrompt,
  buildWhitelabelSectionExpansionPrompt,
  buildWhitelabelSectionPrompt,
} from './whitelabel-section-prompt.builder';
import {
  buildExternalSlug,
  countTextWords,
  extractSectionMap,
  generatedToContentJson,
  parseGeneratedPage,
  removeMainPageGeoPlaceholders,
  replaceInJson,
  stripJsonMarkdown,
} from './whitelabel-json';
import {
  WhitelabelContentJson,
  WhitelabelGeneratedPage,
} from './whitelabel.types';
import { WhitelabelApiClient } from './whitelabel-api.client';
import { PromptContextService } from '../../prompt-context/prompt-context.service';
import { PromptContext } from '../../prompt-context/prompt-context.types';
import {
  finalMaximumWords,
  finalMinimumWords,
  getSectionVolumeConfig,
  sectionMaximumWords,
  sectionMinimumWords,
  sectionTargetWords,
} from '../../generation/section-volume-policy';
import { runWithConcurrency } from '../../common/run-with-concurrency';

@Injectable()
export class WhitelabelContentService {
  private readonly logger = new Logger(WhitelabelContentService.name);
  private readonly maxWordCountAttempts = 3;

  constructor(
    private readonly ai: AiService,
    private readonly sites: SitesService,
    private readonly client: WhitelabelApiClient,
    private readonly promptContext: PromptContextService,
  ) {}

  async getBlueprintContext(site: Site): Promise<Record<string, unknown>> {
    const cached = await this.sites.getBlueprints(site.id);
    if (cached['service-page'] && cached['pseo-rules']) return cached;

    const servicePage = await this.client.fetchBlueprint(site, 'service-page');
    const pseoRules = await this.client.fetchBlueprint(site, 'pseo-rules');
    await this.sites.saveBlueprint(site.id, 'service-page', servicePage);
    await this.sites.saveBlueprint(site.id, 'pseo-rules', pseoRules);
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
  }> {
    const blueprints = await this.getBlueprintContext(input.site);
    const minWords = input.service.min_words ?? 5000;
    const promptContext = this.promptContext.resolve({
      service: input.service.name,
    });

    if (this.isSectionGenerationEnabled()) {
      return this.generateTemplateBySections(
        input,
        blueprints,
        minWords,
        promptContext,
      );
    }

    let lastWordCount = 0;

    for (let attempt = 1; attempt <= this.maxWordCountAttempts; attempt += 1) {
      const retryFeedback =
        attempt === 1
          ? undefined
          : `A tentativa anterior gerou apenas ${lastWordCount} palavras, abaixo do minimo obrigatorio de ${minWords}. Reescreve e expande o conteudo para atingir pelo menos ${minWords} palavras visiveis, mantendo JSON valido e a mesma estrutura.`;

      const { system, user } = buildWhitelabelPrompt({
        service: input.service,
        baseCity: input.baseCity,
        isMainPage: input.isMainPage,
        blueprints,
        promptContext,
        dto: {
          ...input.dto,
          feedback:
            [input.dto.feedback, retryFeedback].filter(Boolean).join('\n\n') ||
            undefined,
        },
      });

      const raw = await this.ai.generateText(system, user);
      const parsed = parseGeneratedPage(raw);
      const generated = input.isMainPage
        ? (removeMainPageGeoPlaceholders(parsed) as WhitelabelGeneratedPage)
        : parsed;
      const contentJson = generatedToContentJson(generated);
      lastWordCount = countTextWords(contentJson);

      if (lastWordCount >= minWords) {
        const sections = extractSectionMap(generated);
        return { generated, contentJson, sections };
      }

      this.logger.warn(
        `Whitelabel content below min_words (${lastWordCount}/${minWords}) for ${input.service.name}; attempt ${attempt}/${this.maxWordCountAttempts}`,
      );
    }

    throw new BadRequestException(
      `A IA nao atingiu o minimo de palavras configurado (${lastWordCount}/${minWords}) apos ${this.maxWordCountAttempts} tentativas.`,
    );
  }

  private isSectionGenerationEnabled(): boolean {
    if (/^(false|0)$/i.test(process.env.SECTION_GENERATION_ENABLED ?? '')) {
      return false;
    }

    const formats = (
      process.env.SECTION_GENERATION_FORMATS ?? 'html,whitelabel_json'
    )
      .split(',')
      .map((format) => format.trim())
      .filter(Boolean);

    return formats.includes('whitelabel_json');
  }

  private async generateTemplateBySections(
    input: {
      service: Service;
      site: Site;
      dto: GenerateTemplateDto;
      baseCity: string | null;
      isMainPage: boolean;
    },
    blueprints: Record<string, unknown>,
    minWords: number,
    promptContext: PromptContext,
  ): Promise<{
    generated: WhitelabelGeneratedPage;
    contentJson: WhitelabelContentJson;
    sections: Map<SectionKey, unknown>;
  }> {
    this.logger.log(
      `Generating whitelabel content by sections for ${input.service.name}`,
    );

    const page = await this.generatePageMetadata(
      input,
      blueprints,
      promptContext,
    );
    const sections = {} as Partial<Record<SectionKey, unknown>>;
    const config = getSectionVolumeConfig();

    await runWithConcurrency(
      SECTION_KEYS,
      config.sectionConcurrency,
      async (sectionKey) => {
        const targetWords = sectionTargetWords(sectionKey, minWords, config);
        const minimumWords = sectionMinimumWords(sectionKey, minWords, config);
        const maximumWords = sectionMaximumWords(sectionKey, minWords, config);
        const startedAt = Date.now();
        const section = await this.generateSectionWithRepair({
          ...input,
          blueprints,
          sectionKey,
          targetWords,
          minimumWords,
          maximumWords,
          generatedSummary: this.parallelSectionSummary(sectionKey),
          promptContext,
        });
        sections[sectionKey] = section;
        this.logger.log(
          `Generated whitelabel section ${sectionKey} (${countTextWords(section)} words) in ${Date.now() - startedAt}ms`,
        );
      },
    );

    let generated: WhitelabelGeneratedPage = {
      page,
      sections: sections as Record<SectionKey, unknown>,
    };

    generated = input.isMainPage
      ? (removeMainPageGeoPlaceholders(generated) as WhitelabelGeneratedPage)
      : generated;

    generated = await this.expandShortSectionsIfNeeded(
      input,
      blueprints,
      generated,
      minWords,
      promptContext,
    );

    const contentJson = generatedToContentJson(generated);
    const finalWordCount = countTextWords(contentJson);

    const minimumFinalWords = finalMinimumWords(minWords, config);
    const maximumFinalWords = finalMaximumWords(minWords, config);
    if (finalWordCount < minimumFinalWords) {
      throw new BadRequestException(
        `A IA gerou ${finalWordCount}/${minimumFinalWords} palavras apos expansao por secoes.`,
      );
    }
    if (finalWordCount > maximumFinalWords) {
      this.logger.warn(
        `Whitelabel section generation above target range (${finalWordCount}/${maximumFinalWords}) for ${input.service.name}`,
      );
    }

    return {
      generated,
      contentJson,
      sections: extractSectionMap(generated),
    };
  }

  private async generatePageMetadata(
    input: {
      service: Service;
      dto: GenerateTemplateDto;
      baseCity: string | null;
      isMainPage: boolean;
    },
    blueprints: Record<string, unknown>,
    promptContext: PromptContext,
  ): Promise<WhitelabelGeneratedPage['page']> {
    const { system, user } = buildWhitelabelPageMetadataPrompt({
      ...input,
      blueprints,
      promptContext,
    });
    const raw = await this.ai.generateText(system, user);
    const parsed = this.parseJsonPayload<{
      page?: WhitelabelGeneratedPage['page'];
    }>(raw);
    const page = parsed.page;
    if (!page?.title || !page.slug) {
      throw new BadRequestException(
        `A IA retornou metadados invalidos para whitelabel: ${raw.slice(0, 500)}`,
      );
    }
    return page;
  }

  private async generateSection(input: {
    service: Service;
    dto: GenerateTemplateDto;
    baseCity: string | null;
    isMainPage: boolean;
    blueprints: Record<string, unknown>;
    sectionKey: SectionKey;
    targetWords: number;
    minimumWords: number;
    maximumWords: number;
    generatedSummary?: string;
    promptContext?: PromptContext;
  }): Promise<unknown> {
    const { system, user } = buildWhitelabelSectionPrompt(input);
    const raw = await this.ai.generateText(system, user);
    return this.parseSectionPayload(raw, input.sectionKey);
  }

  private async generateSectionWithRepair(input: {
    service: Service;
    dto: GenerateTemplateDto;
    baseCity: string | null;
    isMainPage: boolean;
    blueprints: Record<string, unknown>;
    sectionKey: SectionKey;
    targetWords: number;
    minimumWords: number;
    maximumWords: number;
    generatedSummary?: string;
    promptContext?: PromptContext;
  }): Promise<unknown> {
    const config = getSectionVolumeConfig();
    const minimumWords = input.minimumWords;
    let section = await this.generateSection(input);
    let words = countTextWords(section);

    for (
      let attempt = 1;
      words < minimumWords && attempt <= config.repairAttempts;
      attempt += 1
    ) {
      this.logger.warn(
        `Whitelabel section ${input.sectionKey} below target (${words}/${minimumWords}); repair attempt ${attempt}/${config.repairAttempts}`,
      );
      const { system, user } = buildWhitelabelSectionExpansionPrompt({
        ...input,
        currentSection: section,
        currentWords: words,
      });
      const raw = await this.ai.generateText(system, user);
      section = this.parseSectionPayload(raw, input.sectionKey);
      words = countTextWords(section);
    }

    return section;
  }

  private async expandShortSectionsIfNeeded(
    input: {
      service: Service;
      dto: GenerateTemplateDto;
      baseCity: string | null;
      isMainPage: boolean;
    },
    blueprints: Record<string, unknown>,
    generated: WhitelabelGeneratedPage,
    minWords: number,
    promptContext: PromptContext,
  ): Promise<WhitelabelGeneratedPage> {
    const config = getSectionVolumeConfig();
    const maxRounds = config.finalExpansionRounds;
    const maxSectionsPerRound = config.maxSectionsPerExpansionRound;
    let current = generated;

    for (let round = 1; round <= maxRounds; round += 1) {
      const contentJson = generatedToContentJson(current);
      const totalWords = countTextWords(contentJson);
      const minimumFinalWords = finalMinimumWords(minWords, config);
      if (totalWords >= minimumFinalWords) return current;

      this.logger.warn(
        `Whitelabel section generation below target range (${totalWords}/${minimumFinalWords}); expansion round ${round}/${maxRounds}`,
      );

      const deficit = minimumFinalWords - totalWords;
      const candidates = this.expansionCandidates(
        current,
        minWords,
        deficit,
        maxSectionsPerRound,
      ).slice(0, maxSectionsPerRound);

      if (candidates.length === 0) return current;

      const nextSections = { ...current.sections };
      const expansions = await runWithConcurrency(
        candidates,
        config.sectionConcurrency,
        async (candidate) => {
          const section = current.sections[candidate.sectionKey];
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
          const { system, user } = buildWhitelabelSectionExpansionPrompt({
            ...input,
            blueprints,
            sectionKey: candidate.sectionKey,
            targetWords: candidate.targetWords,
            minimumWords,
            maximumWords,
            currentSection: section,
            currentWords: candidate.currentWords,
            promptContext,
          });
          const raw = await this.ai.generateText(system, user);
          const expanded = this.parseSectionPayload(raw, candidate.sectionKey);
          this.logger.log(
            `Expanded whitelabel section ${candidate.sectionKey}: ${candidate.currentWords} -> ${countTextWords(expanded)} words`,
          );
          return { sectionKey: candidate.sectionKey, expanded };
        },
      );

      for (const expansion of expansions) {
        nextSections[expansion.sectionKey] = expansion.expanded;
      }

      current = {
        ...current,
        sections: nextSections,
      };
    }

    return current;
  }

  private parallelSectionSummary(sectionKey: SectionKey): string {
    const otherSections = SECTION_KEYS.filter((key) => key !== sectionKey);
    return [
      'As secoes desta pagina sao geradas em paralelo.',
      `Esta chamada deve focar apenas em "${sectionKey}".`,
      `Evita antecipar ou repetir em profundidade os temas reservados para: ${otherSections.join(', ')}.`,
    ].join('\n');
  }

  private expansionCandidates(
    generated: WhitelabelGeneratedPage,
    minWords: number,
    deficit: number,
    maxSectionsPerRound: number,
  ): Array<{
    sectionKey: SectionKey;
    currentWords: number;
    targetWords: number;
    deficit: number;
    priority: number;
  }> {
    const priority: SectionKey[] = [
      'intro',
      'procura_buscadores',
      'avarias_comuns',
      'prevencao',
      'sistemas',
      'servicos_especializados',
      'perguntas_frequentes',
      'conclusao',
      'mais_sobre',
      'servicos',
      'como_funciona',
      'tipos',
      'pesquisas_relacionadas',
    ];

    return priority
      .map((sectionKey, index) => {
        const currentWords = countTextWords(generated.sections[sectionKey]);
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

  private parseSectionPayload(raw: string, sectionKey: SectionKey): unknown {
    const parsed = this.parseJsonPayload<{
      section_key?: string;
      content?: unknown;
    }>(raw);

    if (parsed.section_key && parsed.section_key !== sectionKey) {
      throw new BadRequestException(
        `A IA retornou section_key "${parsed.section_key}" quando era esperado "${sectionKey}".`,
      );
    }

    const content = parsed.content ?? parsed;
    if (content === null || content === undefined) {
      throw new BadRequestException(
        `A IA retornou secao vazia para "${sectionKey}".`,
      );
    }

    return content;
  }

  private parseJsonPayload<T>(raw: string): T {
    const cleaned = this.extractJsonPayload(stripJsonMarkdown(raw));
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new BadRequestException(
        `A IA retornou JSON invalido. Trecho recebido: ${cleaned.slice(0, 500)}`,
      );
    }
  }

  private extractJsonPayload(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) return trimmed;
    if (trimmed.startsWith('[')) return trimmed;
    const firstObject = trimmed.indexOf('{');
    const lastObject = trimmed.lastIndexOf('}');
    if (firstObject >= 0 && lastObject > firstObject) {
      return trimmed.slice(firstObject, lastObject + 1);
    }
    const firstArray = trimmed.indexOf('[');
    const lastArray = trimmed.lastIndexOf(']');
    if (firstArray >= 0 && lastArray > firstArray) {
      return trimmed.slice(firstArray, lastArray + 1);
    }
    return trimmed;
  }

  assembleFromLibrary(input: {
    service: Service;
    city: string;
    rows: Map<SectionKey, SectionLibraryRow>;
  }): { contentJson: WhitelabelContentJson; externalSlug: string } {
    const sections = {} as WhitelabelGeneratedPage['sections'];

    for (const key of SECTION_KEYS) {
      const row = input.rows.get(key);
      if (!row) continue;
      sections[key] = replaceInJson(
        row.content_json,
        row.base_city,
        input.city,
      );
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

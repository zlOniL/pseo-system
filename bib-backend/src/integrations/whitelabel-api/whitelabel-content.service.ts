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
  WhitelabelGeneratedPage,
} from './whitelabel.types';
import { WhitelabelApiClient } from './whitelabel-api.client';

@Injectable()
export class WhitelabelContentService {
  private readonly logger = new Logger(WhitelabelContentService.name);
  private readonly maxWordCountAttempts = 3;

  constructor(
    private readonly ai: AiService,
    private readonly sites: SitesService,
    private readonly client: WhitelabelApiClient,
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

    const shell = await this.generateShell(input, blueprints);
    const generated: WhitelabelGeneratedPage = {
      page: shell.page,
      sections: {
        intro: shell.intro,
      } as WhitelabelGeneratedPage['sections'],
    };

    const moduleTargetWords = this.targetWordsPerModule(minWords);

    for (const module of WHITELABEL_MODULES) {
      generated.sections[module.key] = await this.generateModule({
        ...input,
        blueprints,
        module,
        targetWords: moduleTargetWords,
      });
    }

    const normalized = input.isMainPage
      ? (removeMainPageGeoPlaceholders(generated) as WhitelabelGeneratedPage)
      : generated;
    const contentJson = generatedToContentJson(normalized);
    const wordCount = countTextWords(contentJson);

    if (wordCount < minWords) {
      throw new BadRequestException(
        `Conteudo whitelabel gerado por modulos ficou abaixo do minimo configurado (${wordCount}/${minWords}). Aumente targetWordsPerModule ou regere o template.`,
      );
    }

    const sections = extractSectionMap(normalized);
    return { generated: normalized, contentJson, sections };
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

    const raw = await this.ai.generateText(system, user);
    return parseGeneratedShell(raw);
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
  }): Promise<Array<Record<string, unknown>>> {
    let lastWordCount = 0;
    let lastError: Error | null = null;
    let previousIssue: string | undefined;

    for (let attempt = 1; attempt <= this.maxWordCountAttempts; attempt += 1) {
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
        });

        const raw = await this.ai.generateText(system, user);
        const blocks = parseGeneratedModuleBlocks(raw, input.module.title);
        const structureIssue = this.validateModuleBoundaries(
          input.module.key,
          blocks,
        );
        if (structureIssue) {
          previousIssue = structureIssue;
          lastError = new Error(structureIssue);
          this.logger.warn(
            `${input.module.title} structure issue attempt ${attempt}/${this.maxWordCountAttempts}: ${structureIssue}`,
          );
          continue;
        }

        lastWordCount = countTextWords(blocks);

        if (lastWordCount >= input.targetWords) {
          this.logger.log(
            `Generated ${input.module.title}: ${lastWordCount}/${input.targetWords} words`,
          );
          return blocks;
        }

        this.logger.warn(
          `${input.module.title} below target (${lastWordCount}/${input.targetWords}); attempt ${attempt}/${this.maxWordCountAttempts}`,
        );
        previousIssue = `conteudo abaixo do minimo do modulo (${lastWordCount}/${input.targetWords})`;
      } catch (err) {
        lastError = err as Error;
        previousIssue = lastError.message;
        this.logger.warn(
          `${input.module.title} failed attempt ${attempt}/${this.maxWordCountAttempts}: ${lastError.message}`,
        );
      }
    }

    if (lastError) {
      throw new BadRequestException(
        `${input.module.title} nao foi gerado corretamente: ${lastError.message}`,
      );
    }

    throw new BadRequestException(
      `${input.module.title} ficou abaixo do minimo do modulo (${lastWordCount}/${input.targetWords}) apos ${this.maxWordCountAttempts} tentativas.`,
    );
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
          String(block.type ?? ''),
        ),
      )
      .map((block) => String(block.text ?? block.title ?? '').trim())
      .filter(Boolean);

    if (headingTexts.some((text) => /perguntas\s+frequentes|faq/i.test(text))) {
      return 'Titulo de Perguntas Frequentes gerado fora do Modulo 13.';
    }

    const questionHeadings = headingTexts.filter((text) => /\?\s*$/.test(text));
    if (questionHeadings.length >= 2) {
      return 'Perguntas em formato de FAQ geradas fora do Modulo 13.';
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

  assembleFromLibrary(input: {
    service: Service;
    city: string;
    rows: Map<SectionKey, SectionLibraryRow>;
  }): { contentJson: WhitelabelContentJson; externalSlug: string } {
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

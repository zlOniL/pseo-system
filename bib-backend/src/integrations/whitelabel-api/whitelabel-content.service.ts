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
  buildExternalSlug,
  countTextWords,
  extractSectionMap,
  generatedToContentJson,
  parseGeneratedPage,
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
        dto: {
          ...input.dto,
          feedback:
            [input.dto.feedback, retryFeedback].filter(Boolean).join('\n\n') ||
            undefined,
        },
      });

      const raw = await this.ai.callOpenRouter(system, user);
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

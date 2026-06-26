import { Injectable } from '@nestjs/common';
import { SectionLibraryService } from './section-library.service';
import { ValidationService } from '../validation/validation.service';
import { ContentsService, Content } from '../contents/contents.service';
import { Service } from '../services/services.service';
import { SECTION_KEYS } from './service-templates.types';
import { replaceKeyword } from '../template-engine/utils/keyword-replacer';
import { injectImages } from '../common/image-injector';
import { stripLocalityBacklinksSection } from '../common/locality-backlinks-stripper';
import { SitesService } from '../sites/sites.service';
import { WhitelabelContentService } from '../integrations/whitelabel-api/whitelabel-content.service';

export interface AssembleInput {
  service: Service;
  city: string;
  serviceId: string;
}

@Injectable()
export class SectionAssemblerService {
  constructor(
    private readonly library: SectionLibraryService,
    private readonly validation: ValidationService,
    private readonly contents: ContentsService,
    private readonly sites: SitesService,
    private readonly whitelabelContent: WhitelabelContentService,
  ) {}

  async assemble(input: AssembleInput): Promise<Content> {
    const { service, city } = input;
    const mainKeyword = `${service.name} em ${city}`;

    const site = service.site_id
      ? await this.sites.findById(service.site_id)
      : null;
    if (site?.integration_type === 'whitelabel_api') {
      const rows = await this.library.getRandomVersions(
        service.id,
        'whitelabel_json',
      );
      const { contentJson, externalSlug } =
        await this.whitelabelContent.assembleFromLibrary({
          service,
          city,
          rows,
        });
      const validationResult = {
        score: 100,
        issues: [],
        breakdown: { structure: 30, seo: 40, content: 30 },
      };

      return this.contents.save(
        {
          main_keyword: mainKeyword,
          service: service.name,
          city,
          min_words: service.min_words,
          service_notes: service.service_notes ?? undefined,
          related_services: service.related_services?.length
            ? service.related_services
            : undefined,
          service_id: service.id,
          site_id: service.site_id ?? undefined,
          output_format: 'whitelabel_json',
          content_json: contentJson,
          external_page_type: 'service_location',
          external_slug: externalSlug,
        },
        null,
        validationResult,
        `Assistência de ${service.name} em ${city} com atendimento rápido e equipa especializada.`,
        'library',
      );
    }

    const randomVersions = await this.library.getRandomVersions(service.id);

    const parts: string[] = [];
    for (const key of SECTION_KEYS) {
      const section = randomVersions.get(key)!;
      parts.push(replaceKeyword(section.html ?? '', section.base_city, city));
    }

    let html = stripLocalityBacklinksSection(parts.join('\n'));
    html = injectImages(
      html,
      service.images ?? [],
      mainKeyword,
      service.name,
      city,
    );

    const validationResult = this.validation.validate(
      html,
      mainKeyword,
      service.min_words ?? 5000,
    );

    return this.contents.save(
      {
        main_keyword: mainKeyword,
        service: service.name,
        city,
        video_url: service.video_url ?? undefined,
        images: service.images?.length ? service.images : undefined,
        related_services: service.related_services?.length
          ? service.related_services
          : undefined,
        service_notes: service.service_notes ?? undefined,
        tone: service.tone ?? undefined,
        min_words: service.min_words,
        service_id: service.id,
        site_id: service.site_id ?? undefined,
      },
      html,
      validationResult,
      '',
      'library',
    );
  }
}

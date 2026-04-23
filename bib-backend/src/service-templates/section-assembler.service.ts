import { Injectable } from '@nestjs/common';
import { SectionLibraryService } from './section-library.service';
import { CitiesService } from '../cities/cities.service';
import { ValidationService } from '../validation/validation.service';
import { ContentsService, Content } from '../contents/contents.service';
import { Service } from '../services/services.service';
import { SECTION_KEYS } from './service-templates.types';
import { replaceKeyword } from '../template-engine/utils/keyword-replacer';
import { injectImages } from '../common/image-injector';
import { slugify } from '../common/slug';
import { buildBacklinksHtml } from '../template-engine/utils/backlinks-builder';

export interface AssembleInput {
  service: Service;
  city: string;
  serviceId: string;
}

@Injectable()
export class SectionAssemblerService {
  constructor(
    private readonly library: SectionLibraryService,
    private readonly cities: CitiesService,
    private readonly validation: ValidationService,
    private readonly contents: ContentsService,
  ) {}

  async assemble(input: AssembleInput): Promise<Content> {
    const { service, city } = input;
    const mainKeyword = `${service.name} em ${city}`;

    const randomVersions = await this.library.getRandomVersions(service.id);

    const parts: string[] = [];
    for (const key of SECTION_KEYS) {
      const section = randomVersions.get(key)!;
      parts.push(replaceKeyword(section.html, section.base_city, city));
    }

    // Build "Atendemos Também" dynamically
    const serviceSlug = slugify(service.name);
    const wpBase = (process.env.WP_BASE_URL ?? '').replace(/\/$/, '');
    const region = this.cities.findRegion(city);
    const localities = region ? this.cities.getLocalities(region, city) : [];
    const atendemosTambem = buildBacklinksHtml(localities, serviceSlug, service.name, wpBase);

    // Insert after "prevencao" section
    const prevencaoIdx = SECTION_KEYS.indexOf('prevencao');
    parts.splice(prevencaoIdx + 1, 0, atendemosTambem);

    let html = parts.join('\n');
    html = injectImages(html, service.images ?? [], mainKeyword, service.name, city);

    const validationResult = this.validation.validate(html, mainKeyword, service.min_words ?? 5000);

    return this.contents.save(
      {
        main_keyword: mainKeyword,
        service: service.name,
        city,
        video_url: service.video_url ?? undefined,
        images: service.images?.length ? service.images : undefined,
        related_services: service.related_services?.length ? service.related_services : undefined,
        service_notes: service.service_notes ?? undefined,
        tone: service.tone ?? undefined,
        min_words: service.min_words,
        service_id: service.id,
      },
      html,
      validationResult,
      '',
      'library' as any,
    );
  }
}

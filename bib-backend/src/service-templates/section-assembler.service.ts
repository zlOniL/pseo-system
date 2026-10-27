import { HybridService, HybridManifest } from './hybrid.service';
import { countTextWords } from '../integrations/whitelabel-api/whitelabel-json';
import { Injectable } from '@nestjs/common';
import { SectionLibraryService } from './section-library.service';
import { ValidationService } from '../validation/validation.service';
import { ContentsService, Content } from '../contents/contents.service';
import { Service } from '../services/services.service';
import { SECTION_KEYS } from './service-templates.types';
import { replaceKeyword } from '../template-engine/utils/keyword-replacer';
import { injectImages } from '../common/image-injector';
import { LocalityLinksService } from '../cities/locality-links.service';
import { SitesService } from '../sites/sites.service';
import { WhitelabelContentService } from '../integrations/whitelabel-api/whitelabel-content.service';
import { FtpHtmlContentService } from '../integrations/ftp-html/ftp-html-content.service';
import {
  buildLocalKeyword,
  formatLocationPhrase,
} from '../common/location-preposition';

export interface AssembleInput {
  service: Service;
  city: string;
  serviceId: string;
  mode?: 'library' | 'hybrid';
  hybridState?: HybridManifest;
  checkpoint?: (state: HybridManifest) => Promise<void>;
}

@Injectable()
export class SectionAssemblerService {
  constructor(
    private readonly library: SectionLibraryService,
    private readonly validation: ValidationService,
    private readonly contents: ContentsService,
    private readonly sites: SitesService,
    private readonly whitelabelContent: WhitelabelContentService,
    private readonly localityLinks: LocalityLinksService,
    private readonly ftpHtmlContent: FtpHtmlContentService,
    private readonly hybrid: HybridService,
  ) {}

  async assemble(input: AssembleInput): Promise<Content> {
    const { service, city } = input;
    const mainKeyword = buildLocalKeyword(service.name, city);

    const site = service.site_id
      ? await this.sites.findById(service.site_id)
      : null;
    const mode = input.mode ?? 'library';
    const composeFtp = site?.integration_type === 'ftp_html'
      ? await this.ftpHtmlContent.prepare({ service, mainKeyword, city })
      : null;
    const prepared =
      mode === 'hybrid'
        ? await this.hybrid.assemble({
            serviceId: service.id,
            service: service.name,
            city,
            format:
              site?.integration_type === 'whitelabel_api'
                ? 'whitelabel_json'
                : 'html',
            previous: input.hybridState,
            checkpoint: input.checkpoint,
          })
        : null;
    if (site?.integration_type === 'whitelabel_api') {
      const rows =
        prepared?.rows ??
        (await this.library.getRandomVersions(service.id, 'whitelabel_json'));
      const { contentJson, externalSlug } =
        await this.whitelabelContent.assembleFromLibrary({
          service,
          city,
          rows,
          alreadyLocalized: mode === 'hybrid',
        });
      const validationResult = {
        score: 100,
        issues: [] as string[],
        breakdown: { structure: 30, seo: 40, content: 30 },
      };
      if (prepared) {
        const words = countTextWords(contentJson);
        if (words < (service.min_words ?? 800)) {
          validationResult.score = 60;
          validationResult.breakdown.content = 0;
          validationResult.breakdown.seo = 30;
          validationResult.issues.push(
            `Contagem de palavras insuficiente (${words}; mínimo ${service.min_words ?? 800}). Reveja o template antes de publicar.`,
          );
        }
        if (/\{\{[^}]+\}\}/.test(JSON.stringify(contentJson))) {
          validationResult.score = Math.min(validationResult.score, 60);
          validationResult.issues.push('Existem placeholders não preenchidos.');
        }
      }

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
        `Assistencia de ${service.name} ${formatLocationPhrase(city)} com atendimento rapido e equipa especializada.`,
        mode,
        prepared ? { hybrid_manifest: prepared.manifest } : {},
      );
    }

    const randomVersions =
      prepared?.rows ?? (await this.library.getRandomVersions(service.id));

    const parts: string[] = [];
    for (const key of SECTION_KEYS) {
      const section = randomVersions.get(key);
      if (!section) continue;
      parts.push(
        prepared
          ? (section.html ?? '')
          : replaceKeyword(section.html ?? '', section.base_city, city),
      );
    }

    let html = await this.localityLinks.html(
      parts.join('\n'),
      {
        service: service.name,
        city,
        site_id: service.site_id,
      },
      site ?? undefined,
    );
    html = injectImages(
      html,
      service.images ?? [],
      mainKeyword,
      service.name,
      city,
    );

    if (site?.integration_type === 'ftp_html') {
      const composed = composeFtp!(html);
      const validationResult = this.validation.validate(
        composed.html,
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
          external_page_type: 'service_location',
          external_slug: composed.externalSlug,
        },
        composed.html,
        validationResult,
        '',
        mode,
        {
          ...(prepared ? { hybrid_manifest: prepared.manifest } : {}),
          ftp_remote_page_id: composed.remotePage.id,
          render_mode: 'full_document',
          deployment_status: 'not_deployed',
          external_page_url: composed.externalUrl,
        },
      );
    }

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
      mode,
      prepared ? { hybrid_manifest: prepared.manifest } : {},
    );
  }
}

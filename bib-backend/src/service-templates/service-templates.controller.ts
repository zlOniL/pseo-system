import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ServiceTemplatesService } from './service-templates.service';
import { SectionLibraryService } from './section-library.service';
import { GenerationService } from '../generation/generation.service';
import { ServicesService } from '../services/services.service';
import { ContentsService } from '../contents/contents.service';
import { ContentSectionsService } from '../contents/content-sections.service';
import { ValidationService } from '../validation/validation.service';
import { CitiesService } from '../cities/cities.service';
import { SitesService } from '../sites/sites.service';
import { WhitelabelContentService } from '../integrations/whitelabel-api/whitelabel-content.service';
import { parseHtmlSections } from './html-section-parser';
import { injectImages } from '../common/image-injector';
import { slugify } from '../common/slug';
import { buildMainPageCityLinksHtml } from '../template-engine/utils/main-page-city-links-builder';
import { GenerateTemplateDto } from '../services/dto/generate-template.dto';
import { buildExternalSlug } from '../integrations/whitelabel-api/whitelabel-json';
import { SectionKey, ServiceTemplate } from './service-templates.types';

@Controller('services/:serviceId/templates')
export class ServiceTemplatesController {
  private readonly logger = new Logger(ServiceTemplatesController.name);

  constructor(
    private readonly templates: ServiceTemplatesService,
    private readonly library: SectionLibraryService,
    private readonly generation: GenerationService,
    private readonly services: ServicesService,
    private readonly contents: ContentsService,
    private readonly contentSections: ContentSectionsService,
    private readonly validation: ValidationService,
    private readonly cities: CitiesService,
    private readonly sites: SitesService,
    private readonly whitelabelContent: WhitelabelContentService,
  ) {}

  @Get()
  list(@Param('serviceId') serviceId: string) {
    return this.templates.findByService(serviceId);
  }

  @Get('library-summary')
  async librarySummary(@Param('serviceId') serviceId: string) {
    const service = await this.services.findById(serviceId);
    const site = service.site_id
      ? await this.sites.findById(service.site_id)
      : null;
    const outputFormat =
      site?.integration_type === 'whitelabel_api' ? 'whitelabel_json' : 'html';
    return this.library.getSummary(serviceId, outputFormat);
  }

  @Get('main-content')
  mainContent(@Param('serviceId') serviceId: string) {
    return this.contents.findLatestMainPageByService(serviceId);
  }

  @Post()
  async generate(
    @Param('serviceId') serviceId: string,
    @Body() dto: GenerateTemplateDto,
  ) {
    return this.generateAndSave(serviceId, dto);
  }

  @Put(':templateId')
  async regenerate(
    @Param('serviceId') serviceId: string,
    @Param('templateId') templateId: string,
    @Body() dto: GenerateTemplateDto,
  ) {
    await this.library.deleteByTemplate(templateId);
    return this.generateAndSave(serviceId, dto, templateId);
  }

  @Post(':templateId/reextract')
  @HttpCode(200)
  async reextract(
    @Param('serviceId') serviceId: string,
    @Param('templateId') templateId: string,
  ) {
    const template = await this.templates.findById(templateId);
    if (template.is_main_page) return { sections_saved: 0, keys: [] };
    if (template.output_format === 'whitelabel_json')
      return { sections_saved: 0, keys: [] };
    await this.library.deleteByTemplate(templateId);
    const { sections } = parseHtmlSections(template.html ?? '');
    await this.library.saveAll(
      serviceId,
      templateId,
      sections,
      template.base_city!,
      template.site_id,
    );
    return { sections_saved: sections.size, keys: [...sections.keys()] };
  }

  @Post('reextract-all')
  @HttpCode(200)
  async reextractAll(@Param('serviceId') serviceId: string) {
    const allTemplates = await this.templates.findByService(serviceId);
    const results: Array<{
      templateId: string;
      version: number;
      sections_saved: number;
    }> = [];

    for (const template of allTemplates) {
      if (template.is_main_page) continue;
      if (template.output_format === 'whitelabel_json') continue;
      await this.library.deleteByTemplate(template.id);
      const { sections } = parseHtmlSections(template.html ?? '');
      await this.library.saveAll(
        serviceId,
        template.id,
        sections,
        template.base_city!,
        template.site_id,
      );
      results.push({
        templateId: template.id,
        version: template.version,
        sections_saved: sections.size,
      });
    }

    return { templates_processed: results.length, results };
  }

  @Patch(':templateId/label')
  async rename(
    @Param('templateId') templateId: string,
    @Body('label') label: string,
  ) {
    return this.templates.rename(templateId, label ?? '');
  }

  @Delete(':templateId')
  @HttpCode(204)
  async remove(
    @Param('serviceId') serviceId: string,
    @Param('templateId') templateId: string,
  ) {
    await this.library.deleteByTemplate(templateId);
    await this.templates.delete(templateId);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async generateAndSave(
    serviceId: string,
    dto: GenerateTemplateDto,
    existingTemplateId?: string,
  ) {
    const service = await this.services.findById(serviceId);
    const site = service.site_id
      ? await this.sites.findById(service.site_id)
      : null;
    if (site?.integration_type === 'whitelabel_api') {
      return this.generateAndSaveWhitelabel(serviceId, dto, existingTemplateId);
    }

    const isMainPage = dto.is_main_page ?? false;
    const baseCity = isMainPage ? null : (dto.base_city ?? 'Lisboa');
    const mainKeyword = isMainPage
      ? service.name
      : `${service.name} em ${baseCity}`;
    const images = service.images ?? [];
    const videoUrl = service.video_url ?? null;

    const relatedServices = dto.related_services?.length
      ? dto.related_services
      : (service.related_services ?? []);

    // 1. Generate raw HTML (before image injection)
    // For main page: skip_backlinks removes the AI's placeholder "Atendemos" block;
    // we'll replace it with a city-list section instead.
    const { html: rawHtml, metaDescription } =
      await this.generation.buildHtmlRaw(
        {
          main_keyword: mainKeyword,
          service: service.name,
          city: baseCity ?? undefined,
          images,
          video_url: videoUrl ?? undefined,
          tone: service.tone,
          min_words: service.min_words,
          service_notes:
            dto.service_notes ?? service.service_notes ?? undefined,
          related_services: relatedServices,
          service_id: serviceId,
          site_id: service.site_id ?? undefined,
          skip_backlinks: isMainPage || undefined,
        },
        dto.feedback,
      );

    // 2. Inject images; then, for main page, append the city-list backlinks section
    const htmlWithImages = injectImages(
      rawHtml,
      images,
      mainKeyword,
      service.name,
      baseCity ?? '',
    );
    const finalHtml = isMainPage
      ? htmlWithImages +
        '\n\n' +
        buildMainPageCityLinksHtml(
          this.cities.getCityNames(),
          slugify(service.name),
          service.name,
          site?.integration_type === 'wordpress'
            ? this.sites.wordpressBase(site)
            : (process.env.WP_BASE_URL ?? '').replace(/\/$/, ''),
        )
      : htmlWithImages;

    let template: ServiceTemplate;
    if (existingTemplateId) {
      template = await this.templates.update(
        existingTemplateId,
        finalHtml,
        baseCity,
        images,
        videoUrl,
        isMainPage,
        dto.label,
      );
    } else {
      template = await this.templates.create(
        serviceId,
        finalHtml,
        baseCity,
        images,
        videoUrl,
        isMainPage,
        dto.label,
        { siteId: service.site_id },
      );
    }

    // 3. Extract sections only for regular templates (not main page)
    let sectionsSaved = 0;
    if (!isMainPage) {
      const { sections } = parseHtmlSections(rawHtml);
      await this.library.saveAll(
        serviceId,
        template.id,
        sections,
        baseCity!,
        service.site_id,
      );
      sectionsSaved = sections.size;
    }

    // 4. Save content record for preview
    const validationResult = this.validation.validate(
      finalHtml,
      mainKeyword,
      service.min_words ?? 5000,
    );
    const content = await this.contents.save(
      {
        main_keyword: mainKeyword,
        service: service.name,
        city: baseCity ?? undefined,
        images,
        video_url: videoUrl ?? undefined,
        tone: service.tone,
        min_words: service.min_words,
        service_notes: dto.service_notes ?? service.service_notes ?? undefined,
        related_services: relatedServices,
        service_id: serviceId,
        site_id: service.site_id ?? undefined,
        external_page_type: isMainPage ? 'service' : 'service_location',
        external_slug: slugify(
          isMainPage ? service.name : `${service.name} em ${baseCity}`,
        ),
      },
      finalHtml,
      validationResult,
      metaDescription,
      'ai',
    );
    await this.persistHtmlSections(content.id, finalHtml);

    // Keep service.template_html in sync for backwards compat (only regular templates)
    if (!isMainPage) {
      await this.services.saveTemplate(
        serviceId,
        finalHtml,
        baseCity!,
        images,
        videoUrl,
      );
    }

    return { template, content, sections_saved: sectionsSaved };
  }

  private async generateAndSaveWhitelabel(
    serviceId: string,
    dto: GenerateTemplateDto,
    existingTemplateId?: string,
  ) {
    const service = await this.services.findById(serviceId);
    if (!service.site_id)
      throw new BadRequestException('Servico whitelabel sem site associado.');
    const site = await this.sites.findById(service.site_id);
    const isMainPage = dto.is_main_page ?? false;
    const baseCity = isMainPage ? null : (dto.base_city ?? 'Lisboa');
    const mainKeyword = isMainPage
      ? service.name
      : `${service.name} em ${baseCity}`;

    const generated = await this.whitelabelContent.generateTemplate({
      service,
      site,
      dto,
      baseCity,
      isMainPage,
    });

    let template: ServiceTemplate;
    if (existingTemplateId) {
      template = await this.templates.update(
        existingTemplateId,
        null,
        baseCity,
        [],
        null,
        isMainPage,
        dto.label,
        { outputFormat: 'whitelabel_json', contentJson: generated.contentJson },
      );
    } else {
      template = await this.templates.create(
        serviceId,
        null,
        baseCity,
        [],
        null,
        isMainPage,
        dto.label,
        {
          siteId: service.site_id,
          outputFormat: 'whitelabel_json',
          contentJson: generated.contentJson,
        },
      );
    }

    let sectionsSaved = 0;
    if (!isMainPage) {
      await this.library.saveAllJson(
        serviceId,
        template.id,
        generated.sections,
        baseCity!,
        service.site_id,
      );
      sectionsSaved = generated.sections.size;
    }

    const validationResult = {
      score: 100,
      issues: [],
      breakdown: { structure: 30, seo: 40, content: 30 },
    };
    const content = await this.contents.save(
      {
        main_keyword: mainKeyword,
        service: service.name,
        city: baseCity ?? undefined,
        tone: service.tone,
        min_words: service.min_words,
        service_notes: dto.service_notes ?? service.service_notes ?? undefined,
        related_services: dto.related_services?.length
          ? dto.related_services
          : service.related_services,
        service_id: serviceId,
        site_id: service.site_id,
        output_format: 'whitelabel_json',
        content_json: generated.contentJson,
        external_page_type: isMainPage ? 'service' : 'service_location',
        external_slug: buildExternalSlug(service.name, baseCity ?? undefined),
      },
      null,
      validationResult,
      generated.generated.page.seo_description,
      'ai',
    );
    await this.persistJsonSections(content.id, generated.sections);

    return { template, content, sections_saved: sectionsSaved };
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

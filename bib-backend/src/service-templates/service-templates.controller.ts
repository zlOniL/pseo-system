import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { ServiceTemplatesService } from './service-templates.service';
import { SectionLibraryService } from './section-library.service';
import { GenerationService } from '../generation/generation.service';
import { ServicesService } from '../services/services.service';
import { ContentsService } from '../contents/contents.service';
import { ValidationService } from '../validation/validation.service';
import { CitiesService } from '../cities/cities.service';
import { parseHtmlSections } from './html-section-parser';
import { injectImages } from '../common/image-injector';
import { slugify } from '../common/slug';
import { buildMainPageCityLinksHtml } from '../template-engine/utils/main-page-city-links-builder';
import { GenerateTemplateDto } from '../services/dto/generate-template.dto';

@Controller('services/:serviceId/templates')
export class ServiceTemplatesController {
  constructor(
    private readonly templates: ServiceTemplatesService,
    private readonly library: SectionLibraryService,
    private readonly generation: GenerationService,
    private readonly services: ServicesService,
    private readonly contents: ContentsService,
    private readonly validation: ValidationService,
    private readonly cities: CitiesService,
  ) {}

  @Get()
  list(@Param('serviceId') serviceId: string) {
    return this.templates.findByService(serviceId);
  }

  @Get('library-summary')
  librarySummary(@Param('serviceId') serviceId: string) {
    return this.library.getSummary(serviceId);
  }

  @Post()
  async generate(@Param('serviceId') serviceId: string, @Body() dto: GenerateTemplateDto) {
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
    await this.library.deleteByTemplate(templateId);
    const { sections } = parseHtmlSections(template.html);
    await this.library.saveAll(serviceId, templateId, sections, template.base_city!);
    return { sections_saved: sections.size, keys: [...sections.keys()] };
  }

  @Post('reextract-all')
  @HttpCode(200)
  async reextractAll(@Param('serviceId') serviceId: string) {
    const allTemplates = await this.templates.findByService(serviceId);
    const results: Array<{ templateId: string; version: number; sections_saved: number }> = [];

    for (const template of allTemplates) {
      if (template.is_main_page) continue;
      await this.library.deleteByTemplate(template.id);
      const { sections } = parseHtmlSections(template.html);
      await this.library.saveAll(serviceId, template.id, sections, template.base_city!);
      results.push({ templateId: template.id, version: template.version, sections_saved: sections.size });
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
    const isMainPage = dto.is_main_page ?? false;
    const baseCity = isMainPage ? null : (dto.base_city ?? 'Lisboa');
    const mainKeyword = isMainPage ? service.name : `${service.name} em ${baseCity}`;
    const images = service.images ?? [];
    const videoUrl = service.video_url ?? null;

    const relatedServices =
      dto.related_services?.length ? dto.related_services : (service.related_services ?? []);

    // 1. Generate raw HTML (before image injection)
    // For main page: skip_backlinks removes the AI's placeholder "Atendemos" block;
    // we'll replace it with a city-list section instead.
    const { html: rawHtml, metaDescription } = await this.generation.buildHtmlRaw(
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
        skip_backlinks: isMainPage || undefined,
      },
      dto.feedback,
    );

    // 2. Inject images; then, for main page, append the city-list backlinks section
    const htmlWithImages = injectImages(rawHtml, images, mainKeyword, service.name, baseCity ?? '');
    const finalHtml = isMainPage
      ? htmlWithImages + '\n\n' + buildMainPageCityLinksHtml(
          this.cities.getCityNames(),
          slugify(service.name),
          service.name,
          (process.env.WP_BASE_URL ?? '').replace(/\/$/, ''),
        )
      : htmlWithImages;

    let template;
    if (existingTemplateId) {
      template = await this.templates.update(existingTemplateId, finalHtml, baseCity, images, videoUrl, isMainPage, dto.label);
    } else {
      template = await this.templates.create(serviceId, finalHtml, baseCity, images, videoUrl, isMainPage, dto.label);
    }

    // 3. Extract sections only for regular templates (not main page)
    let sectionsSaved = 0;
    if (!isMainPage) {
      const { sections } = parseHtmlSections(rawHtml);
      await this.library.saveAll(serviceId, template.id, sections, baseCity!);
      sectionsSaved = sections.size;
    }

    // 4. Save content record for preview
    const validationResult = this.validation.validate(finalHtml, mainKeyword, service.min_words ?? 5000);
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
      },
      finalHtml,
      validationResult,
      metaDescription,
      'ai',
    );

    // Keep service.template_html in sync for backwards compat (only regular templates)
    if (!isMainPage) {
      await this.services.saveTemplate(serviceId, finalHtml, baseCity!, images, videoUrl);
    }

    return { template, content, sections_saved: sectionsSaved };
  }
}

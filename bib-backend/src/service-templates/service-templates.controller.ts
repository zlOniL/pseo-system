import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ServiceTemplatesService } from './service-templates.service';
import { SectionLibraryService } from './section-library.service';
import { GenerationService } from '../generation/generation.service';
import { ServicesService } from '../services/services.service';
import { ContentsService } from '../contents/contents.service';
import { ValidationService } from '../validation/validation.service';
import { parseHtmlSections } from './html-section-parser';
import { injectImages } from '../common/image-injector';
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
    await this.library.deleteByTemplate(templateId);
    const { sections } = parseHtmlSections(template.html);
    await this.library.saveAll(serviceId, templateId, sections, template.base_city);
    return { sections_saved: sections.size, keys: [...sections.keys()] };
  }

  @Post('reextract-all')
  @HttpCode(200)
  async reextractAll(@Param('serviceId') serviceId: string) {
    const allTemplates = await this.templates.findByService(serviceId);
    const results: Array<{ templateId: string; version: number; sections_saved: number }> = [];

    for (const template of allTemplates) {
      await this.library.deleteByTemplate(template.id);
      const { sections } = parseHtmlSections(template.html);
      await this.library.saveAll(serviceId, template.id, sections, template.base_city);
      results.push({ templateId: template.id, version: template.version, sections_saved: sections.size });
    }

    return { templates_processed: results.length, results };
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
    const baseCity = dto.base_city ?? 'Lisboa';
    const mainKeyword = `${service.name} em ${baseCity}`;
    const images = service.images ?? [];
    const videoUrl = service.video_url ?? null;

    const relatedServices =
      dto.related_services?.length ? dto.related_services : (service.related_services ?? []);

    // 1. Generate raw HTML (before image injection)
    const { html: rawHtml, metaDescription } = await this.generation.buildHtmlRaw(
      {
        main_keyword: mainKeyword,
        service: service.name,
        city: baseCity,
        images,
        video_url: videoUrl ?? undefined,
        tone: service.tone,
        min_words: service.min_words,
        service_notes: dto.service_notes ?? service.service_notes ?? undefined,
        related_services: relatedServices,
        service_id: serviceId,
      },
      dto.feedback,
    );

    // 2. Store template with real images injected
    const htmlWithImages = injectImages(rawHtml, images, mainKeyword, service.name, baseCity);

    let template;
    if (existingTemplateId) {
      template = await this.templates.update(existingTemplateId, htmlWithImages, baseCity, images, videoUrl);
    } else {
      template = await this.templates.create(serviceId, htmlWithImages, baseCity, images, videoUrl);
    }

    // 3. Extract sections from raw HTML ({{IMAGE_N}} still present)
    const { sections } = parseHtmlSections(rawHtml);
    await this.library.saveAll(serviceId, template.id, sections, baseCity);

    // 4. Save content record for preview
    const validationResult = this.validation.validate(htmlWithImages, mainKeyword, service.min_words ?? 5000);
    const content = await this.contents.save(
      {
        main_keyword: mainKeyword,
        service: service.name,
        city: baseCity,
        images,
        video_url: videoUrl ?? undefined,
        tone: service.tone,
        min_words: service.min_words,
        service_notes: dto.service_notes ?? service.service_notes ?? undefined,
        related_services: relatedServices,
        service_id: serviceId,
      },
      htmlWithImages,
      validationResult,
      metaDescription,
      'ai',
    );

    // Keep service.template_html in sync for backwards compat
    await this.services.saveTemplate(serviceId, htmlWithImages, baseCity, images, videoUrl);

    return { template, content, sections_saved: sections.size };
  }
}

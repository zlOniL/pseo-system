import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { ValidationService } from '../validation/validation.service';
import { ContentsService, Content } from '../contents/contents.service';
import { CitiesService } from '../cities/cities.service';
import { buildPrompt } from './prompt.builder';
import { slugify } from '../common/slug';
import { injectImages } from '../common/image-injector';
import { GenerateDto } from './dto/generate.dto';
import { RegenerateDto } from './dto/regenerate.dto';
import { SitesService } from '../sites/sites.service';
import { WhitelabelContentService } from '../integrations/whitelabel-api/whitelabel-content.service';
import { buildExternalSlug } from '../integrations/whitelabel-api/whitelabel-json';
import { Service } from '../services/services.service';

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly ai: AiService,
    private readonly validation: ValidationService,
    private readonly contents: ContentsService,
    private readonly cities: CitiesService,
    private readonly sites: SitesService,
    private readonly whitelabelContent: WhitelabelContentService,
  ) {}

  async generate(dto: GenerateDto): Promise<Content> {
    const site = dto.site_id ? await this.sites.findById(dto.site_id) : null;
    if (!site) {
      throw new BadRequestException(
        'Selecione um site antes de gerar conteudo.',
      );
    }
    this.logger.log(
      `Generate route using site ${site.name} (${site.integration_type})`,
    );
    if (site.integration_type === 'whitelabel_api') {
      return this.generateWhitelabel(dto, site);
    }

    const { html, metaDescription } = await this.buildHtml(dto);
    const minWords = dto.min_words ?? 5000;
    const result = this.validation.validate(html, dto.main_keyword, minWords);
    return this.contents.save(dto, html, result, metaDescription);
  }

  async regenerate(dto: RegenerateDto): Promise<Content> {
    if (!dto.site_id) {
      const existing = await this.contents.findById(dto.content_id);
      dto.site_id = existing.site_id ?? undefined;
    }
    const { html, metaDescription } = await this.buildHtml(dto, dto.feedback);
    const minWords = dto.min_words ?? 5000;
    const result = this.validation.validate(html, dto.main_keyword, minWords);
    return this.contents.update(
      dto.content_id,
      html,
      result,
      {
        video_url: dto.video_url,
        images: dto.images,
        related_services: dto.related_services,
      },
      metaDescription,
    );
  }

  /** Returns raw HTML (with {{IMAGE_N}} still present) before image injection. */
  async buildHtmlRaw(
    dto: GenerateDto,
    feedback?: string,
  ): Promise<{ html: string; metaDescription: string }> {
    const { system, user } = buildPrompt(dto, feedback);
    const raw = await this.ai.generateText(system, user);

    const metaMatch = raw.match(/<!--\s*BIB_META:\s*([\s\S]*?)\s*-->/);
    const metaDescription = metaMatch ? metaMatch[1].trim() : '';
    let html = raw.replace(/<!--\s*BIB_META:[\s\S]*?-->\s*/g, '');

    // When no city, strip any leftover {{CITY}} placeholders the AI may have missed
    if (!dto.city) {
      html = html
        .replace(/\s+em\s+\{\{CITY\}\}/gi, '')
        .replace(/\{\{CITY\}\}/gi, '');
    }

    if (dto.skip_backlinks) {
      html = html
        .replace(/<h2[^>]*>[^<]*Atendemos[^<]*<\/h2>[\s\S]*$/i, '')
        .trimEnd();
    } else {
      const serviceSlug = slugify(dto.service);
      const site = dto.site_id
        ? await this.sites.findById(dto.site_id).catch(() => null)
        : null;
      const wpBase =
        site?.integration_type === 'wordpress'
          ? this.sites.wordpressBase(site)
          : (process.env.WP_BASE_URL ?? '').replace(/\/$/, '');
      const atendemosTambemHtml = this.cities.buildAtendemosTambem(
        dto.city ?? '',
        dto.service,
        serviceSlug,
        wpBase,
      );
      html = this.replaceAtendemosTambem(html, atendemosTambemHtml);
    }

    return { html, metaDescription };
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async buildHtml(
    dto: GenerateDto,
    feedback?: string,
  ): Promise<{ html: string; metaDescription: string }> {
    const { html: rawHtml, metaDescription } = await this.buildHtmlRaw(
      dto,
      feedback,
    );
    const html = injectImages(
      rawHtml,
      dto.images ?? [],
      dto.main_keyword,
      dto.service,
      dto.city ?? '',
    );
    return { html, metaDescription };
  }

  private async generateWhitelabel(
    dto: GenerateDto,
    site: Awaited<ReturnType<SitesService['findById']>>,
  ): Promise<Content> {
    const service = this.buildSyntheticService(dto);
    const baseCity = dto.city ?? null;
    const generated = await this.whitelabelContent.generateTemplate({
      service,
      site,
      dto: {
        base_city: baseCity ?? undefined,
        service_notes: dto.service_notes,
        related_services: dto.related_services,
      },
      baseCity,
      isMainPage: !baseCity,
    });

    const validationResult = {
      score: 100,
      issues: [],
      breakdown: { structure: 30, seo: 40, content: 30 },
    };
    return this.contents.save(
      {
        ...dto,
        site_id: site.id,
        service_id: dto.service_id,
        output_format: 'whitelabel_json',
        content_json: generated.contentJson,
        external_page_type: baseCity ? 'service_location' : 'service',
        external_slug: buildExternalSlug(dto.service, baseCity ?? undefined),
      },
      null,
      validationResult,
      generated.generated.page.seo_description,
      'ai',
    );
  }

  private buildSyntheticService(dto: GenerateDto): Service {
    return {
      id: dto.service_id ?? '',
      created_at: new Date().toISOString(),
      site_id: dto.site_id ?? null,
      name: dto.service,
      slug: slugify(dto.service),
      video_url: dto.video_url ?? null,
      images: dto.images ?? [],
      related_services: dto.related_services ?? [],
      service_notes: dto.service_notes ?? null,
      tone: dto.tone ?? '',
      min_words: dto.min_words ?? 5000,
      status: 'active',
      wordpress_category: dto.wordpress_category ?? null,
      featured_image_asset_id: null,
      featured_image_alt: null,
      featured_image_url: null,
      template_html: null,
      template_base_city: null,
      seo_title: null,
      seo_description: null,
    };
  }

  private replaceAtendemosTambem(html: string, replacement: string): string {
    const regex = /<h2[^>]*>[^<]*Atendemos[^<]*<\/h2>[\s\S]*?(?=<h2)/i;
    if (regex.test(html)) {
      return html.replace(regex, replacement);
    }
    const pesquisasMatch = /<h2[^>]*>[^<]*Pesquisas Relacionadas/i;
    if (pesquisasMatch.test(html)) {
      return html.replace(
        pesquisasMatch,
        replacement + '\n\n<h2 style="color: #320000;">Pesquisas Relacionadas',
      );
    }
    return html + '\n\n' + replacement;
  }
}

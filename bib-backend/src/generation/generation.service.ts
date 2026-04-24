import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { ValidationService } from '../validation/validation.service';
import { ContentsService, Content } from '../contents/contents.service';
import { CitiesService } from '../cities/cities.service';
import { buildPrompt } from './prompt.builder';
import { slugify } from '../common/slug';
import { injectImages } from '../common/image-injector';
import { GenerateDto } from './dto/generate.dto';
import { RegenerateDto } from './dto/regenerate.dto';

@Injectable()
export class GenerationService {
  constructor(
    private readonly ai: AiService,
    private readonly validation: ValidationService,
    private readonly contents: ContentsService,
    private readonly cities: CitiesService,
  ) {}

  async generate(dto: GenerateDto): Promise<Content> {
    const { html, metaDescription } = await this.buildHtml(dto);
    const minWords = dto.min_words ?? 5000;
    const result = this.validation.validate(html, dto.main_keyword, minWords);
    return this.contents.save(dto, html, result, metaDescription);
  }

  async regenerate(dto: RegenerateDto): Promise<Content> {
    const { html, metaDescription } = await this.buildHtml(dto, dto.feedback);
    const minWords = dto.min_words ?? 5000;
    const result = this.validation.validate(html, dto.main_keyword, minWords);
    return this.contents.update(
      dto.content_id,
      html,
      result,
      { video_url: dto.video_url, images: dto.images, related_services: dto.related_services },
      metaDescription,
    );
  }

  /** Returns raw HTML (with {{IMAGE_N}} still present) before image injection. */
  async buildHtmlRaw(
    dto: GenerateDto,
    feedback?: string,
  ): Promise<{ html: string; metaDescription: string }> {
    const { system, user } = buildPrompt(dto, feedback);
    let raw = await this.ai.callOpenRouter(system, user);

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
      html = html.replace(/<h2[^>]*>[^<]*Atendemos[^<]*<\/h2>[\s\S]*$/i, '').trimEnd();
    } else {
      const serviceSlug = slugify(dto.service);
      const wpBase = (process.env.WP_BASE_URL ?? '').replace(/\/$/, '');
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
    const { html: rawHtml, metaDescription } = await this.buildHtmlRaw(dto, feedback);
    const html = injectImages(rawHtml, dto.images ?? [], dto.main_keyword, dto.service, dto.city ?? '');
    return { html, metaDescription };
  }

  private replaceAtendemosTambem(html: string, replacement: string): string {
    const regex = /<h2[^>]*>[^<]*Atendemos[^<]*<\/h2>[\s\S]*?(?=<h2)/i;
    if (regex.test(html)) {
      return html.replace(regex, replacement);
    }
    const pesquisasMatch = /<h2[^>]*>[^<]*Pesquisas Relacionadas/i;
    if (pesquisasMatch.test(html)) {
      return html.replace(pesquisasMatch, replacement + '\n\n<h2 style="color: #320000;">Pesquisas Relacionadas');
    }
    return html + '\n\n' + replacement;
  }

}

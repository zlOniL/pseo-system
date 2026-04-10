import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { ValidationService } from '../validation/validation.service';
import { ContentsService, Content } from '../contents/contents.service';
import { CitiesService } from '../cities/cities.service';
import { buildPrompt } from './prompt.builder';
import { slugify } from '../common/slug';
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

  // ── Private ──────────────────────────────────────────────────────────────

  private async buildHtml(
    dto: GenerateDto,
    feedback?: string,
  ): Promise<{ html: string; metaDescription: string }> {
    const { system, user } = buildPrompt(dto, feedback);
    let raw = await this.ai.callOpenRouter(system, user);

    // 1. Extract meta description (<!-- BIB_META: ... -->)
    const metaMatch = raw.match(/<!--\s*BIB_META:\s*([\s\S]*?)\s*-->/);
    const metaDescription = metaMatch ? metaMatch[1].trim() : '';
    let html = raw.replace(/<!--\s*BIB_META:[\s\S]*?-->\s*/g, '');

    // 2. Replace "Atendemos Também" with deterministic city links
    const serviceSlug = slugify(dto.service);
    const wpBase = (process.env.WP_BASE_URL ?? '').replace(/\/$/, '');
    const atendemosTambemHtml = this.cities.buildAtendemosTambem(
      dto.city,
      dto.service,
      serviceSlug,
      wpBase,
    );
    html = this.replaceAtendemosTambem(html, atendemosTambemHtml);

    // 3. Inject images — always called to clean up {{IMAGE_N}} placeholders even
    //    when no images are provided (prevents validation false-positives).
    html = this.injectImages(
      html,
      dto.images ?? [],
      dto.main_keyword,
      dto.service,
      dto.city,
    );

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

  /**
   * Injects <img> tags at 8 fixed structural positions defined by {{IMAGE_N}}
   * placeholders in the template. Each placeholder is replaced with an <img>
   * wrapped in <hr> separators. Unfilled placeholders are removed cleanly.
   *
   * Alt text map (positional):
   *   1 — main keyword              (before "Procura em Buscadores")
   *   2 — profissional em city      (before "Principais Problemas")
   *   3 — serviços em city          (before "Serviços" subcategorias)
   *   4 — como funciona em city     (before "Como Funciona / Tipos")
   *   5 — tipos em city             (before "Prevenção")
   *   6 — prevenção em city         (before contexto local)
   *   7 — perto de mim em city      (inside "Sistemas e Intervenções", after H2)
   *   8 — urgente 24h em city       (before "Perguntas Frequentes")
   */
  private injectImages(
    html: string,
    images: string[],
    keyword: string,
    service: string,
    city: string,
  ): string {
    const alts = [
      keyword,
      `${service} profissional em ${city}`,
      `serviços de ${service} em ${city}`,
      `como funciona ${service} em ${city}`,
      `tipos de ${service} em ${city}`,
      `prevenção de avarias ${service} em ${city}`,
      `${service} perto de mim em ${city}`,
      `${service} urgente 24h em ${city}`,
    ];

    for (let i = 0; i < 8; i++) {
      const placeholder = `{{IMAGE_${i + 1}}}`;
      const src = images[i]?.trim();
      if (src) {
        const alt = alts[i] ?? keyword;
        const imgHtml =
          `\n<hr />\n` +
          `<img class="alignnone size-full" style="max-width: 100%; height: auto; display: block;" ` +
          `src="${src}" alt="${alt}" width="1080" height="720" />\n` +
          `<hr />\n`;
        html = html.replace(placeholder, imgHtml);
      } else {
        // Remove placeholder cleanly if no image provided for this slot
        html = html.replace(placeholder, '');
      }
    }

    return html;
  }
}

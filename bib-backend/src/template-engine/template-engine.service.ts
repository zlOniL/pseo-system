import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { CitiesService } from '../cities/cities.service';
import { ContentsService, Content } from '../contents/contents.service';
import { ValidationService } from '../validation/validation.service';
import { Service } from '../services/services.service';
import { slugify } from '../common/slug';
import { replaceKeyword } from './utils/keyword-replacer';
import { buildBacklinksHtml } from './utils/backlinks-builder';

export interface TemplateGenerateInput {
  service: Service;
  city: string;
}

@Injectable()
export class TemplateEngineService {
  private readonly logger = new Logger(TemplateEngineService.name);

  constructor(
    private readonly cities: CitiesService,
    private readonly contents: ContentsService,
    private readonly validation: ValidationService,
  ) {}

  async generate(input: TemplateGenerateInput): Promise<Content> {
    const { service, city } = input;
    const serviceSlug = slugify(service.name);

    // 1. Load template — DB first, fallback to file
    let rawHtml: string;
    let baseCity: string;

    if (service.template_html) {
      rawHtml = service.template_html;
      baseCity = service.template_base_city ?? 'Lisboa';
      this.logger.log(`Using DB template for "${service.name}" (base city: "${baseCity}")`);
    } else {
      rawHtml = this.loadTemplate(serviceSlug);
      baseCity = this.getBaseCityFromFilename(serviceSlug);
    }

    this.logger.log(`Template base city: "${baseCity}" → target: "${city}"`);

    // 3. Replace all occurrences of the base city with the target city
    let html = replaceKeyword(rawHtml, baseCity, city);

    // 4. Build and inject the "Atendemos Também" backlinks block
    const region = this.cities.findRegion(city);
    const localities = region ? this.cities.getLocalities(region, city) : [];
    const wpBase = (process.env.WP_BASE_URL ?? '').replace(/\/$/, '');
    const linksHtml = buildBacklinksHtml(localities, serviceSlug, service.name, wpBase);
    html = this.injectBacklinks(html, linksHtml);

    // 5. Validate (score + issues)
    const mainKeyword = `${service.name} em ${city}`;
    const validationResult = this.validation.validate(html, mainKeyword, service.min_words ?? 5000);

    // 6. Save to contents table (draft, same path as AI generation)
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
      'template',
    );
  }

  loadTemplate(serviceSlug: string): string {
    const templatesDir = this.resolveTemplatesDir();
    const files = fs
      .readdirSync(templatesDir)
      .filter((f) => f.startsWith(serviceSlug) && f.endsWith('.html'));

    if (files.length === 0) {
      throw new NotFoundException(
        `No template found for service slug "${serviceSlug}". ` +
          `Expected a file matching "${serviceSlug}-em-{city}.html" in the /templates directory.`,
      );
    }

    files.sort();
    const filePath = path.join(templatesDir, files[0]);
    this.logger.log(`Loading template: ${files[0]}`);
    return fs.readFileSync(filePath, 'utf-8');
  }

  private getBaseCityFromFilename(serviceSlug: string): string {
    const templatesDir = this.resolveTemplatesDir();
    const files = fs
      .readdirSync(templatesDir)
      .filter((f) => f.startsWith(serviceSlug) && f.endsWith('.html'));

    if (files.length === 0) return 'Lisboa';

    files.sort();
    const filename = files[0].replace('.html', '');
    const prefix = `${serviceSlug}-em-`;

    if (filename.startsWith(prefix)) {
      const citySlug = filename.slice(prefix.length);
      // Convert slug back to title case: "sao-joao" → "São João" (best-effort)
      return citySlug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }

    return 'Lisboa';
  }

  private injectBacklinks(html: string, linksHtml: string): string {
    const placeholder = '<div id="dynamic-neighborhood-links"></div>';
    if (html.includes(placeholder)) {
      return html.replace(placeholder, linksHtml);
    }
    this.logger.warn(
      'Template is missing <div id="dynamic-neighborhood-links"></div> placeholder — appending backlinks at end.',
    );
    return html + (linksHtml ? '\n\n' + linksHtml : '');
  }

  private resolveTemplatesDir(): string {
    const candidates = [
      path.join(process.cwd(), 'templates'),
      path.join(process.cwd(), '../templates'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error(
      `/templates directory not found. Searched: ${candidates.join(', ')}`,
    );
  }
}

import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ContentsService, Content } from '../contents/contents.service';
import { ServicesService } from '../services/services.service';
import { assemblePageHtml, assembleTemplateHtml } from '../common/html-assembler';
import { slugify } from '../common/slug';

export interface MediaItem {
  id: number;
  title: string;
  url: string;
  mime_type: string;
  date: string;
  thumbnail: string | null;
}

export interface MediaResponse {
  items: MediaItem[];
  total: number;
  total_pages: number;
  page: number;
}

export interface WpCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
}

@Injectable()
export class WordPressService {
  private readonly logger = new Logger(WordPressService.name);

  constructor(
    private readonly contents: ContentsService,
    private readonly services: ServicesService,
  ) {}

  async publish(contentId: string): Promise<Content> {
    const content = await this.contents.findById(contentId);
    const fullHtml = content.generation_mode === 'template'
      ? assembleTemplateHtml(content.html, content.video_url)
      : assemblePageHtml(content.html, content.video_url);

    const wpUrl = `${process.env.WP_BASE_URL}/wp-json/custom/v1/post`;
    const slug = slugify(content.main_keyword);
    const title = content.main_keyword;
    const seoTitle = `${content.main_keyword} — Atendimento 24h`;

    // Resolve WordPress category if the service has one configured
    let categories: number[] = [];
    if (!content.service_id) {
      this.logger.warn(`Content ${contentId} has no service_id — skipping category resolution`);
    } else {
      try {
        const service = await this.services.findById(content.service_id);
        if (!service.wordpress_category) {
          this.logger.warn(
            `Service "${service.name}" (${content.service_id}) has no wordpress_category set — skipping`,
          );
        } else {
          this.logger.log(
            `Resolving WP category "${service.wordpress_category}" for service "${service.name}"`,
          );
          const categoryId = await this.ensureCategoryExists(service.wordpress_category);
          categories = [categoryId];
          this.logger.log(`Resolved category ID: ${categoryId}`);
        }
      } catch (err) {
        this.logger.warn(
          `Could not resolve WP category for service ${content.service_id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Publishing content ${contentId} as slug: ${slug}, categories: [${categories.join(',')}]`,
    );

    const response = await fetch(wpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WP_SECRET}`,
      },
      body: JSON.stringify({
        title,
        seo_title: seoTitle,
        content: fullHtml,
        excerpt: content.meta_description ?? '',
        meta_description: content.meta_description ?? '',
        status: 'publish',
        slug,
        categories,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`WordPress publish error ${response.status}: ${error}`);
      throw new InternalServerErrorException('WordPress publish failed');
    }

    const result = (await response.json()) as { id: number; link: string };
    return this.contents.setPublished(contentId, result.id, result.link);
  }

  async getCategories(): Promise<WpCategory[]> {
    const url = `${process.env.WP_BASE_URL}/wp-json/custom/v1/categories`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.WP_SECRET}` },
    });
    if (!response.ok) {
      const err = await response.text();
      throw new InternalServerErrorException(`WordPress getCategories failed: ${err}`);
    }
    return response.json() as Promise<WpCategory[]>;
  }

  async createCategory(name: string, parent: string = 'Blog'): Promise<WpCategory> {
    const url = `${process.env.WP_BASE_URL}/wp-json/custom/v1/categories`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WP_SECRET}`,
      },
      body: JSON.stringify({ name, parent }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new InternalServerErrorException(`WordPress createCategory failed: ${err}`);
    }
    return response.json() as Promise<WpCategory>;
  }

  async ensureCategoryExists(name: string): Promise<number> {
    const categories = await this.getCategories();
    const existing = categories.find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) return existing.id;

    this.logger.log(`Category "${name}" not found in WordPress — creating under "Blog"`);
    const created = await this.createCategory(name, 'Blog');
    return created.id;
  }

  async listMedia(
    type: string = 'image',
    page: number = 1,
    search: string = '',
    perPage: number = 50,
  ): Promise<MediaResponse> {
    const params = new URLSearchParams({
      type,
      page: String(page),
      per_page: String(perPage),
    });
    if (search) params.set('search', search);

    const wpUrl = `${process.env.WP_BASE_URL}/wp-json/custom/v1/media?${params.toString()}`;

    const response = await fetch(wpUrl, {
      headers: { Authorization: `Bearer ${process.env.WP_SECRET}` },
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`WordPress media list error ${response.status}: ${err}`);
      throw new InternalServerErrorException('WordPress media list failed');
    }

    return response.json() as Promise<MediaResponse>;
  }
}

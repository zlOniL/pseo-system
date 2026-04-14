import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ContentsService, Content } from '../contents/contents.service';
import { ServicesService } from '../services/services.service';
import { assemblePageHtml, assembleTemplateHtml } from '../common/html-assembler';
import { slugify } from '../common/slug';
import { getSeoForTemplate } from './seo-templates';

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

  /**
   * Returns the base URL for WordPress API calls.
   * If WP_PROXY_BASE is set, routes through the Vercel proxy to avoid
   * Render IP blocks (e.g. Imunify360 on the WordPress host).
   */
  private wpApiBase(): string {
    const proxy = process.env.WP_PROXY_BASE?.replace(/\/$/, '');
    if (proxy) return `${proxy}/api/wp-proxy`;
    const base = process.env.WP_BASE_URL?.replace(/\/$/, '') ?? '';
    return `${base}/wp-json/custom/v1`;
  }

  async publish(contentId: string): Promise<Content> {
    const content = await this.contents.findById(contentId);
    const fullHtml = content.generation_mode === 'template'
      ? assembleTemplateHtml(content.html, content.video_url)
      : assemblePageHtml(content.html, content.video_url);

    const wpUrl = `${this.wpApiBase()}/post`;
    const slug = slugify(content.main_keyword);
    const title = content.main_keyword;

    // SEO title and description
    let seoTitle = `${content.main_keyword} — Atendimento 24h`;
    let metaDescription = content.meta_description ?? '';

    // For template pages, pull SEO from the templates map (SEO.md data)
    if (content.generation_mode === 'template') {
      const serviceSlug = slugify(content.service);
      const seo = getSeoForTemplate(serviceSlug, content.city);
      if (seo) {
        seoTitle = seo.title;
        metaDescription = seo.description;
        this.logger.log(`Template SEO resolved for "${serviceSlug}": "${seoTitle}"`);
      } else {
        this.logger.warn(`No SEO template found for service slug "${serviceSlug}" — using default`);
      }
    }

    // Resolve categories: always Blog (primary) + service subcategory
    const categories: number[] = [];
    let blogCategoryId: number | null = null;

    // 1. Ensure "Blog" parent category (always primary)
    try {
      blogCategoryId = await this.ensureCategoryExists('Blog');
      categories.push(blogCategoryId);
    } catch (err) {
      this.logger.warn(`Could not resolve "Blog" category: ${(err as Error).message}`);
    }

    // 2. Ensure service subcategory (under Blog)
    if (!content.service_id) {
      this.logger.warn(`Content ${contentId} has no service_id — skipping service category`);
    } else {
      try {
        const service = await this.services.findById(content.service_id);
        if (!service.wordpress_category) {
          this.logger.warn(
            `Service "${service.name}" has no wordpress_category set — skipping`,
          );
        } else {
          this.logger.log(`Resolving WP subcategory "${service.wordpress_category}"`);
          const catId = await this.ensureCategoryExists(service.wordpress_category);
          if (!categories.includes(catId)) categories.push(catId);
          this.logger.log(`Resolved subcategory ID: ${catId}`);
        }
      } catch (err) {
        this.logger.warn(
          `Could not resolve service category for ${content.service_id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Publishing "${title}" → ${wpUrl} | seoTitle: "${seoTitle}" | categories: [${categories.join(',')}] | primary_category_id: ${blogCategoryId ?? 'null'}`,
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
        excerpt: metaDescription,
        meta_description: metaDescription,
        status: 'publish',
        slug,
        categories,
        primary_category_id: blogCategoryId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`WordPress publish error ${response.status} (url: ${wpUrl}): ${error}`);
      throw new InternalServerErrorException('WordPress publish failed');
    }

    const result = (await response.json()) as { id: number; link: string };
    return this.contents.setPublished(contentId, result.id, result.link);
  }

  async getCategories(): Promise<WpCategory[]> {
    const url = `${this.wpApiBase()}/wp-cats`;
    this.logger.log(`getCategories → GET ${url}`);
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        Authorization: `Bearer ${process.env.WP_SECRET}`,
      },
    });
    if (!response.ok) {
      const err = await response.text();
      throw new InternalServerErrorException(`WordPress getCategories failed: ${err}`);
    }
    return response.json() as Promise<WpCategory[]>;
  }

  async createCategory(name: string, parent: string = 'Blog'): Promise<WpCategory> {
    const url = `${this.wpApiBase()}/wp-cats`;
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
    if (existing) {
      // Warn if a non-Blog category exists at top level (parent === 0) — it should be under Blog
      if (name.toLowerCase() !== 'blog' && existing.parent === 0) {
        this.logger.warn(
          `Category "${name}" exists as a top-level category (parent=0), expected under "Blog"`,
        );
      }
      return existing.id;
    }

    this.logger.log(`Category "${name}" not found — creating under "Blog"`);
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

    const wpUrl = `${this.wpApiBase()}/media?${params.toString()}`;

    const response = await fetch(wpUrl, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${process.env.WP_SECRET}`,
      },
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`WordPress media list error ${response.status}: ${err}`);
      throw new InternalServerErrorException('WordPress media list failed');
    }

    return response.json() as Promise<MediaResponse>;
  }
}

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

export interface BulkPublishResult {
  id: string;
  success: boolean;
  data?: Content;
  error?: string;
}

class PayloadTooLargeError extends Error {}

@Injectable()
export class WordPressService {
  private readonly logger = new Logger(WordPressService.name);

  constructor(
    private readonly contents: ContentsService,
    private readonly services: ServicesService,
  ) { }

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
    const wpCatName = content.wordpress_category
      ?? (content.service_id ? await this.services.findById(content.service_id).then((s) => s.wordpress_category).catch(() => null) : null);

    if (wpCatName) {
      try {
        this.logger.log(`Resolving WP subcategory "${wpCatName}"`);
        const catId = await this.ensureCategoryExists(wpCatName);
        if (!categories.includes(catId)) categories.push(catId);
        this.logger.log(`Resolved subcategory ID: ${catId}`);
      } catch (err) {
        this.logger.warn(`Could not resolve category "${wpCatName}": ${(err as Error).message}`);
      }
    } else {
      this.logger.warn(`Content ${contentId} has no wordpress_category or service_id — skipping subcategory`);
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

  private preparePayload(
    content: Content,
    categories: { ids: number[]; primaryId: number | null },
  ): object {
    const fullHtml =
      content.generation_mode === 'template'
        ? assembleTemplateHtml(content.html, content.video_url)
        : assemblePageHtml(content.html, content.video_url);

    const slug = slugify(content.main_keyword);
    const title = content.main_keyword;
    let seoTitle = `${content.main_keyword} — Atendimento 24h`;
    let metaDescription = content.meta_description ?? '';

    if (content.generation_mode === 'template') {
      const serviceSlug = slugify(content.service);
      const seo = getSeoForTemplate(serviceSlug, content.city);
      if (seo) {
        seoTitle = seo.title;
        metaDescription = seo.description;
      }
    }

    return {
      title,
      seo_title: seoTitle,
      content: fullHtml,
      excerpt: metaDescription,
      meta_description: metaDescription,
      status: 'publish',
      slug,
      categories: categories.ids,
      primary_category_id: categories.primaryId,
    };
  }

  private async resolveCategoriesForBulk(
    contents: Content[],
  ): Promise<Map<string, { ids: number[]; primaryId: number | null }>> {
    // Fetch all existing WP categories once
    let allCategories = await this.getCategories();

    // Ensure "Blog" exists
    let blogCategoryId: number | null = null;
    const blogCat = allCategories.find((c) => c.name.toLowerCase() === 'blog');
    if (blogCat) {
      blogCategoryId = blogCat.id;
    } else {
      const created = await this.createCategory('Blog', '');
      blogCategoryId = created.id;
      allCategories = [...allCategories, created];
    }

    // Collect unique service IDs and fetch their WP category names
    const serviceIds = [
      ...new Set(contents.filter((c) => c.service_id).map((c) => c.service_id!)),
    ];
    const serviceWpCatMap = new Map<string, string | null>();

    for (const serviceId of serviceIds) {
      try {
        const service = await this.services.findById(serviceId);
        serviceWpCatMap.set(serviceId, service.wordpress_category ?? null);
      } catch {
        serviceWpCatMap.set(serviceId, null);
      }
    }

    // Ensure all unique service category names exist in WP (create if missing)
    const directCatNames = contents
      .map((c) => c.wordpress_category)
      .filter((n): n is string => !!n);

    const uniqueCatNames = [
      ...new Set([...serviceWpCatMap.values(), ...directCatNames].filter((n): n is string => !!n)),
    ];
    const categoryIdCache = new Map<string, number>();

    for (const catName of uniqueCatNames) {
      const existing = allCategories.find(
        (c) => c.name.toLowerCase() === catName.toLowerCase(),
      );
      if (existing) {
        categoryIdCache.set(catName, existing.id);
      } else {
        const created = await this.createCategory(catName, 'Blog');
        categoryIdCache.set(catName, created.id);
      }
    }

    // Build result map: contentId → { ids, primaryId }
    const result = new Map<string, { ids: number[]; primaryId: number | null }>();

    for (const content of contents) {
      const ids: number[] = blogCategoryId ? [blogCategoryId] : [];

      const wpCatName = content.wordpress_category
        ?? (content.service_id ? serviceWpCatMap.get(content.service_id) ?? null : null);

      if (wpCatName) {
        const catId = categoryIdCache.get(wpCatName);
        if (catId && !ids.includes(catId)) ids.push(catId);
      }

      result.set(content.id, { ids, primaryId: blogCategoryId });
    }

    return result;
  }

  private async callWpBulk(
    payloads: object[],
  ): Promise<Array<{ id: number; link: string; slug: string; success: boolean; error?: string }>> {
    const url = `${this.wpApiBase()}/posts/bulk`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WP_SECRET}`,
      },
      body: JSON.stringify({ posts: payloads }),
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`WordPress bulk publish error ${response.status}: ${err}`);
      if (response.status === 413) {
        throw new PayloadTooLargeError('WordPress bulk publish failed');
      }
      throw new InternalServerErrorException('WordPress bulk publish failed');
    }

    return response.json();
  }

  async bulkPublish(ids: string[]): Promise<BulkPublishResult[]> {
    const contents = await this.contents.findByIds(ids);
    const categoryMap = await this.resolveCategoriesForBulk(contents);

    const items = contents.map((c) => ({
      content: c,
      payload: this.preparePayload(c, categoryMap.get(c.id)!),
    }));

    const CHUNK_SIZE = 5;
    const MIN_CHUNK_SIZE = 1;
    const MAX_RETRIES = 3;
    const CONCURRENCY = 3;

    const chunks: typeof items[] = [];
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      chunks.push(items.slice(i, i + CHUNK_SIZE));
    }

    const results: BulkPublishResult[] = [];

    this.logger.log(
      `Bulk publish: ${items.length} posts → ${chunks.length} chunk(s) de ${CHUNK_SIZE} (concorrência: ${CONCURRENCY})`,
    );

    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const windowChunks = chunks.slice(i, i + CONCURRENCY);

      const windowResults = await Promise.all(
        windowChunks.map(async (chunk, windowIdx) => {
          const chunkIndex = i + windowIdx + 1;
          const chunkResults: BulkPublishResult[] = [];
          let subStart = 0;
          let chunkSize = chunk.length;

          while (subStart < chunk.length) {
            const subChunk = chunk.slice(subStart, subStart + chunkSize);

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
              try {
                const wpResults = await this.callWpBulk(subChunk.map((item) => item.payload));

                for (let j = 0; j < wpResults.length; j++) {
                  const wpResult = wpResults[j];
                  const content = subChunk[j].content;

                  if (wpResult.success) {
                    try {
                      const updated = await this.contents.setPublished(content.id, wpResult.id, wpResult.link);
                      chunkResults.push({ id: content.id, success: true, data: updated });
                    } catch (err) {
                      chunkResults.push({ id: content.id, success: false, error: (err as Error).message });
                    }
                  } else {
                    this.logger.warn(`Bulk publish: slug "${wpResult.slug}" falhou — ${wpResult.error}`);
                    chunkResults.push({ id: content.id, success: false, error: wpResult.error });
                  }
                }

                subStart += chunkSize;
                break;
              } catch (err) {
                if (err instanceof PayloadTooLargeError && chunkSize > MIN_CHUNK_SIZE) {
                  chunkSize = Math.max(MIN_CHUNK_SIZE, Math.floor(chunkSize / 2));
                  this.logger.warn(
                    `Chunk ${chunkIndex} — 413 detectado, reduzindo para ${chunkSize} post(s) por sub-chunk`,
                  );
                  break;
                }
                if (attempt < MAX_RETRIES) {
                  await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
                } else {
                  this.logger.error(
                    `Chunk ${chunkIndex} — sub-chunk falhou após ${MAX_RETRIES} tentativas: ${(err as Error).message}`,
                  );
                  for (const item of subChunk) {
                    chunkResults.push({ id: item.content.id, success: false, error: (err as Error).message });
                  }
                  subStart += chunkSize;
                }
              }
            }
          }

          return chunkResults;
        }),
      );

      for (const partialResults of windowResults) {
        results.push(...partialResults);
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    this.logger.log(`Bulk publish concluído: ${succeeded}/${results.length} publicados`);

    return results;
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

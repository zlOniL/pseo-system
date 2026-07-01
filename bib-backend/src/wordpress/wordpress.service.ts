import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ContentsService, Content } from '../contents/contents.service';
import { ServicesService } from '../services/services.service';
import {
  assemblePageHtml,
  assembleTemplateHtml,
} from '../common/html-assembler';
import { slugify } from '../common/slug';
import { applyCity } from './seo-templates';
import { Site, SitesService } from '../sites/sites.service';

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
    private readonly sites: SitesService,
  ) {}

  /**
   * Returns the base URL for WordPress API calls.
   * If WP_PROXY_BASE is set, routes through the Vercel proxy to avoid
   * Render IP blocks (e.g. Imunify360 on the WordPress host).
   */
  private wpApiBase(site: Site): string {
    const proxy = this.sites.wordpressProxyBase(site);
    if (proxy) return `${proxy}/api/wp-proxy`;
    const base = this.sites.wordpressBase(site);
    return `${base}/wp-json/custom/v1`;
  }

  private wpDirectApiBase(site: Site): string {
    const base = this.sites.wordpressBase(site);
    return `${base}/wp-json/custom/v1`;
  }

  private wpHeaders(site: Site): Record<string, string> {
    const secret = this.sites.wordpressSecret(site);
    if (!secret) {
      throw new BadRequestException(
        `Site "${site.name}" sem secret WordPress configurado.`,
      );
    }
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${secret}`,
    };
  }

  private async siteForContent(content: Content): Promise<Site> {
    if (!content.site_id) {
      throw new BadRequestException(
        'Conteudo sem site associado. Selecione um site antes de publicar.',
      );
    }
    const site = await this.sites.findById(content.site_id);
    if (site.integration_type !== 'wordpress') {
      throw new BadRequestException(
        `Site "${site.name}" nao usa integracao WordPress.`,
      );
    }
    return site;
  }

  async publish(contentId: string): Promise<Content> {
    const content = await this.contents.findById(contentId);
    const site = await this.siteForContent(content);
    const fullHtml =
      content.generation_mode === 'template'
        ? assembleTemplateHtml(content.html ?? '', content.video_url)
        : assemblePageHtml(content.html ?? '', content.video_url);

    const wpUrl = `${this.wpApiBase(site)}/post`;
    const slug = slugify(content.main_keyword);
    const title = content.main_keyword;

    // Load service once — used for both SEO and category resolution
    const service = content.service_id
      ? await this.services.findById(content.service_id).catch(() => null)
      : null;

    // SEO title and description — source: service DB → default
    const city = content.city ?? '';
    let seoTitle = `${content.main_keyword} — Atendimento 24h`;
    let metaDescription = content.meta_description ?? '';

    if (service?.seo_title) {
      seoTitle = applyCity(service.seo_title, city);
      metaDescription = applyCity(service.seo_description ?? '', city);
      this.logger.log(
        `Service SEO resolved for "${service.slug}": "${seoTitle}"`,
      );
    } else {
      this.logger.warn(
        `Service "${content.service}" has no seo_title — using default`,
      );
    }

    // Resolve categories: always Blog (primary) + service subcategory
    const categories: number[] = [];
    let blogCategoryId: number | null = null;

    // 1. Ensure "Blog" parent category (always primary)
    try {
      blogCategoryId = await this.ensureCategoryExists(site, 'Blog');
      categories.push(blogCategoryId);
    } catch (err) {
      this.logger.warn(
        `Could not resolve "Blog" category: ${(err as Error).message}`,
      );
    }

    // 2. Ensure service subcategory (under Blog)
    const wpCatName =
      content.wordpress_category ?? service?.wordpress_category ?? null;

    if (wpCatName) {
      try {
        this.logger.log(`Resolving WP subcategory "${wpCatName}"`);
        const catId = await this.ensureCategoryExists(site, wpCatName);
        if (!categories.includes(catId)) categories.push(catId);
        this.logger.log(`Resolved subcategory ID: ${catId}`);
      } catch (err) {
        this.logger.warn(
          `Could not resolve category "${wpCatName}": ${(err as Error).message}`,
        );
      }
    } else {
      this.logger.warn(
        `Content ${contentId} has no wordpress_category or service_id — skipping subcategory`,
      );
    }

    this.logger.log(
      `Publishing "${title}" → ${wpUrl} | seoTitle: "${seoTitle}" | categories: [${categories.join(',')}] | primary_category_id: ${blogCategoryId ?? 'null'}`,
    );

    const response = await fetch(wpUrl, {
      method: 'POST',
      headers: this.wpHeaders(site),
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
      this.logger.error(
        `WordPress publish error ${response.status} (url: ${wpUrl}): ${error}`,
      );
      throw new InternalServerErrorException('WordPress publish failed');
    }

    const result = (await response.json()) as { id: number; link: string };
    return this.contents.setPublished(contentId, result.id, result.link);
  }

  private preparePayload(
    content: Content,
    categories: { ids: number[]; primaryId: number | null },
    serviceSeo: { title: string; description: string } | null,
  ): object {
    const fullHtml =
      content.generation_mode === 'template'
        ? assembleTemplateHtml(content.html ?? '', content.video_url)
        : assemblePageHtml(content.html ?? '', content.video_url);

    const slug = slugify(content.main_keyword);
    const title = content.main_keyword;
    let seoTitle = `${content.main_keyword} — Atendimento 24h`;
    let metaDescription = content.meta_description ?? '';

    if (serviceSeo) {
      seoTitle = serviceSeo.title;
      metaDescription = serviceSeo.description;
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
    site: Site,
    contents: Content[],
  ): Promise<
    Map<
      string,
      {
        ids: number[];
        primaryId: number | null;
        seo: { title: string; description: string } | null;
      }
    >
  > {
    // Fetch all existing WP categories once
    let allCategories = await this.getCategories(site.id);

    // Ensure "Blog" exists
    let blogCategoryId: number | null = null;
    const blogCat = allCategories.find((c) => c.name.toLowerCase() === 'blog');
    if (blogCat) {
      blogCategoryId = blogCat.id;
    } else {
      const created = await this.createCategory(site.id, 'Blog', '');
      blogCategoryId = created.id;
      allCategories = [...allCategories, created];
    }

    // Collect unique service IDs and fetch their WP category names + SEO
    const serviceIds = [
      ...new Set(
        contents.filter((c) => c.service_id).map((c) => c.service_id!),
      ),
    ];
    const serviceWpCatMap = new Map<string, string | null>();
    const serviceSeoMap = new Map<
      string,
      { title: string; description: string } | null
    >();

    for (const serviceId of serviceIds) {
      try {
        const service = await this.services.findById(serviceId);
        serviceWpCatMap.set(serviceId, service.wordpress_category ?? null);
        serviceSeoMap.set(
          serviceId,
          service.seo_title
            ? {
                title: service.seo_title,
                description: service.seo_description ?? '',
              }
            : null,
        );
      } catch {
        serviceWpCatMap.set(serviceId, null);
        serviceSeoMap.set(serviceId, null);
      }
    }

    // Ensure all unique service category names exist in WP (create if missing)
    const directCatNames = contents
      .map((c) => c.wordpress_category)
      .filter((n): n is string => !!n);

    const uniqueCatNames = [
      ...new Set(
        [...serviceWpCatMap.values(), ...directCatNames].filter(
          (n): n is string => !!n,
        ),
      ),
    ];
    const categoryIdCache = new Map<string, number>();

    for (const catName of uniqueCatNames) {
      const existing = allCategories.find(
        (c) => c.name.toLowerCase() === catName.toLowerCase(),
      );
      if (existing) {
        categoryIdCache.set(catName, existing.id);
      } else {
        const created = await this.createCategory(site.id, catName, 'Blog');
        categoryIdCache.set(catName, created.id);
      }
    }

    // Build result map: contentId → { ids, primaryId, seo }
    const result = new Map<
      string,
      {
        ids: number[];
        primaryId: number | null;
        seo: { title: string; description: string } | null;
      }
    >();

    for (const content of contents) {
      const ids: number[] = blogCategoryId ? [blogCategoryId] : [];

      const wpCatName =
        content.wordpress_category ??
        (content.service_id
          ? (serviceWpCatMap.get(content.service_id) ?? null)
          : null);

      if (wpCatName) {
        const catId = categoryIdCache.get(wpCatName);
        if (catId && !ids.includes(catId)) ids.push(catId);
      }

      // Resolve SEO — apply city replacement to the stored template (which uses "Lisboa")
      const rawSeo = content.service_id
        ? (serviceSeoMap.get(content.service_id) ?? null)
        : null;
      const city = content.city ?? '';
      const seo = rawSeo
        ? {
            title: applyCity(rawSeo.title, city),
            description: applyCity(rawSeo.description, city),
          }
        : null;

      result.set(content.id, { ids, primaryId: blogCategoryId, seo });
    }

    return result;
  }

  private async callWpBulk(
    site: Site,
    payloads: object[],
  ): Promise<
    Array<{
      id: number;
      link: string;
      slug: string;
      success: boolean;
      error?: string;
    }>
  > {
    const url = `${this.wpApiBase(site)}/posts/bulk`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.wpHeaders(site),
      body: JSON.stringify({ posts: payloads }),
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(
        `WordPress bulk publish error ${response.status}: ${err}`,
      );
      if (response.status === 413) {
        throw new PayloadTooLargeError('WordPress bulk publish failed');
      }
      throw new InternalServerErrorException('WordPress bulk publish failed');
    }

    return (await response.json()) as Array<{
      id: number;
      link: string;
      slug: string;
      success: boolean;
      error?: string;
    }>;
  }

  async bulkPublish(ids: string[]): Promise<BulkPublishResult[]> {
    const contents = await this.contents.findByIds(ids);
    const grouped = new Map<string, { site: Site; contents: Content[] }>();
    const results: BulkPublishResult[] = [];

    for (const content of contents) {
      try {
        const site = await this.siteForContent(content);
        const bucket = grouped.get(site.id) ?? { site, contents: [] };
        bucket.contents.push(content);
        grouped.set(site.id, bucket);
      } catch (err) {
        results.push({
          id: content.id,
          success: false,
          error: (err as Error).message,
        });
      }
    }

    for (const group of grouped.values()) {
      results.push(
        ...(await this.bulkPublishForSite(group.site, group.contents)),
      );
    }

    return results;
  }

  private async bulkPublishForSite(
    site: Site,
    contents: Content[],
  ): Promise<BulkPublishResult[]> {
    const categoryMap = await this.resolveCategoriesForBulk(site, contents);

    const items = contents.map((c) => {
      const resolved = categoryMap.get(c.id)!;
      return {
        content: c,
        payload: this.preparePayload(c, resolved, resolved.seo),
      };
    });

    const CHUNK_SIZE = 5;
    const MIN_CHUNK_SIZE = 1;
    const MAX_RETRIES = 3;
    const CONCURRENCY = 3;

    const chunks: (typeof items)[] = [];
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      chunks.push(items.slice(i, i + CHUNK_SIZE));
    }

    const results: BulkPublishResult[] = [];

    this.logger.log(
      `Bulk publish [${site.domain}]: ${items.length} posts → ${chunks.length} chunk(s) de ${CHUNK_SIZE} (concorrência: ${CONCURRENCY})`,
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
                const wpResults = await this.callWpBulk(
                  site,
                  subChunk.map((item) => item.payload),
                );

                for (let j = 0; j < wpResults.length; j++) {
                  const wpResult = wpResults[j];
                  const content = subChunk[j].content;

                  if (wpResult.success) {
                    try {
                      const updated = await this.contents.setPublished(
                        content.id,
                        wpResult.id,
                        wpResult.link,
                      );
                      chunkResults.push({
                        id: content.id,
                        success: true,
                        data: updated,
                      });
                    } catch (err) {
                      chunkResults.push({
                        id: content.id,
                        success: false,
                        error: (err as Error).message,
                      });
                    }
                  } else {
                    this.logger.warn(
                      `Bulk publish: slug "${wpResult.slug}" falhou — ${wpResult.error}`,
                    );
                    chunkResults.push({
                      id: content.id,
                      success: false,
                      error: wpResult.error,
                    });
                  }
                }

                subStart += chunkSize;
                break;
              } catch (err) {
                if (
                  err instanceof PayloadTooLargeError &&
                  chunkSize > MIN_CHUNK_SIZE
                ) {
                  chunkSize = Math.max(
                    MIN_CHUNK_SIZE,
                    Math.floor(chunkSize / 2),
                  );
                  this.logger.warn(
                    `Chunk ${chunkIndex} — 413 detectado, reduzindo para ${chunkSize} post(s) por sub-chunk`,
                  );
                  break;
                }
                if (attempt < MAX_RETRIES) {
                  await new Promise((resolve) =>
                    setTimeout(resolve, 2000 * attempt),
                  );
                } else {
                  this.logger.error(
                    `Chunk ${chunkIndex} — sub-chunk falhou após ${MAX_RETRIES} tentativas: ${(err as Error).message}`,
                  );
                  for (const item of subChunk) {
                    chunkResults.push({
                      id: item.content.id,
                      success: false,
                      error: (err as Error).message,
                    });
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
    this.logger.log(
      `Bulk publish concluído: ${succeeded}/${results.length} publicados`,
    );

    return results;
  }

  async getCategories(siteId: string): Promise<WpCategory[]> {
    const site = await this.sites.findById(siteId);
    const url = `${this.wpDirectApiBase(site)}/wp-cats`;
    this.logger.log(`getCategories → GET ${url}`);
    const response = await fetch(url, {
      headers: this.wpHeaders(site),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new InternalServerErrorException(
        `WordPress getCategories failed: ${err}`,
      );
    }
    return response.json() as Promise<WpCategory[]>;
  }

  async createCategory(
    siteId: string,
    name: string,
    parent: string = 'Blog',
  ): Promise<WpCategory> {
    const site = await this.sites.findById(siteId);
    const url = `${this.wpDirectApiBase(site)}/wp-cats`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.wpHeaders(site),
      body: JSON.stringify({ name, parent }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new InternalServerErrorException(
        `WordPress createCategory failed: ${err}`,
      );
    }
    return response.json() as Promise<WpCategory>;
  }

  async ensureCategoryExists(site: Site, name: string): Promise<number> {
    const categories = await this.getCategories(site.id);
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
    const created = await this.createCategory(site.id, name, 'Blog');
    return created.id;
  }

  async listMedia(
    siteId: string,
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

    const site = await this.sites.findById(siteId);
    if (site.integration_type !== 'wordpress') {
      throw new BadRequestException(`Site "${site.name}" nao usa integracao WordPress.`);
    }

    const wpUrl = `${this.wpDirectApiBase(site)}/media?${params.toString()}`;
    this.logger.log(`listMedia -> GET ${wpUrl}`);

    let response: Response;
    try {
      response = await fetch(wpUrl, {
        headers: this.wpHeaders(site),
      });
    } catch (err) {
      this.logger.error(`WordPress media list fetch failed: ${(err as Error).message}`);
      throw new InternalServerErrorException(
        `WordPress media list fetch failed: ${(err as Error).message}`,
      );
    }

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(
        `WordPress media list error ${response.status}: ${err}`,
      );
      throw new InternalServerErrorException(
        `WordPress media list failed (${response.status}): ${err.slice(0, 300)}`,
      );
    }

    return response.json() as Promise<MediaResponse>;
  }
}

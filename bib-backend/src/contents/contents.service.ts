import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { DbCountResult, DbError, DbResult } from '../common/supabase.types';
import { ValidationResult } from '../validation/validation.types';
import { GenerateDto } from '../generation/dto/generate.dto';
import { ListContentsDto } from './dto/list-contents.dto';

export interface Content {
  id: string;
  created_at: string;
  site_id: string | null;
  main_keyword: string;
  service: string;
  city: string;
  neighborhood: string | null;
  html: string | null;
  score: number | null;
  score_issues: string[] | null;
  status: 'draft' | 'approved' | 'published';
  wp_post_id: number | null;
  wp_post_url: string | null;
  video_url: string | null;
  images: string[] | null;
  related_services: Array<{ name: string; url: string }> | null;
  meta_description: string | null;
  service_id: string | null;
  generation_mode: 'ai' | 'template' | 'library';
  wordpress_category: string | null;
  output_format: 'html' | 'whitelabel_json';
  content_json: unknown;
  external_page_type: 'service' | 'service_location' | 'page' | null;
  external_slug: string | null;
  external_page_id: number | null;
  external_page_url: string | null;
}

type CacheEntry = {
  total: number;
  pages: Map<number, Omit<Content, 'html'>[]>;
};
type ContentSummary = Omit<Content, 'html'>;

const VALID_LIMITS = [10, 25, 50, 100, 250, 500, 1000];
const DEFAULT_LIMIT = 10;

@Injectable()
export class ContentsService {
  private readonly listCache = new Map<string, CacheEntry>();

  constructor(private readonly supabase: SupabaseService) {}

  private buildCacheKey(dto: ListContentsDto): string {
    return `${dto.site_id ?? ''}|${dto.status ?? ''}|${dto.service ?? ''}|${dto.service_id ?? ''}|${dto.city ?? ''}|${dto.cities ?? ''}|${dto.from ?? ''}|${dto.to ?? ''}|${dto.limit ?? DEFAULT_LIMIT}`;
  }

  private async countFiltered(dto: ListContentsDto): Promise<number> {
    let query = this.supabase
      .getClient()
      .from('contents')
      .select('*', { count: 'exact', head: true });
    query = this.applyStatusFilter(query, dto.status);
    if (dto.service) query = query.eq('service', dto.service);
    if (dto.service_id) query = query.eq('service_id', dto.service_id);
    if (dto.city) query = query.ilike('city', `%${dto.city}%`);
    if (dto.cities) {
      const cities = dto.cities.split(',').filter(Boolean);
      if (cities.length > 0) query = query.in('city', cities);
    }
    if (dto.site_id) query = query.eq('site_id', dto.site_id);
    if (dto.from) query = query.gte('created_at', dto.from);
    if (dto.to) query = query.lte('created_at', dto.to);
    const { count, error } = (await query) as DbCountResult<null>;
    if (error) this.throwFriendlyContentError(error);
    return count ?? 0;
  }

  private applyStatusFilter<T>(query: T, status?: string): T {
    if (!status) return query;
    const statuses = status.split(',').filter(Boolean);
    if (statuses.length === 0) return query;

    return (statuses.length > 1
      ? (query as any).in('status', statuses)
      : (query as any).eq('status', statuses[0])) as T;
  }

  private invalidateCache(): void {
    this.listCache.clear();
  }

  async save(
    input: GenerateDto,
    html: string | null,
    validation: ValidationResult,
    metaDescription?: string,
    generationMode: 'ai' | 'template' | 'library' = 'ai',
  ): Promise<Content> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('contents')
      .insert({
        main_keyword: input.main_keyword,
        site_id: input.site_id ?? null,
        service: input.service,
        city: input.city ?? '',
        neighborhood: input.neighborhood ?? null,
        html,
        score: validation.score,
        score_issues: validation.issues,
        status: 'draft',
        video_url: input.video_url ?? null,
        images: input.images ?? null,
        related_services: input.related_services ?? null,
        meta_description: metaDescription ?? null,
        service_id: input.service_id ?? null,
        generation_mode: generationMode,
        wordpress_category: input.wordpress_category ?? null,
        output_format: input.output_format ?? 'html',
        content_json: input.content_json ?? null,
        external_page_type: input.external_page_type ?? null,
        external_slug: input.external_slug ?? null,
      })
      .select()
      .single()) as DbResult<Content>;

    if (error) this.throwFriendlyContentError(error);
    this.invalidateCache();
    return data as Content;
  }

  async update(
    id: string,
    html: string,
    validation: ValidationResult,
    input?: Partial<
      Pick<GenerateDto, 'video_url' | 'images' | 'related_services'>
    >,
    metaDescription?: string,
  ): Promise<Content> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('contents')
      .update({
        html,
        score: validation.score,
        score_issues: validation.issues,
        status: 'draft',
        ...(input?.video_url !== undefined && { video_url: input.video_url }),
        ...(input?.images !== undefined && { images: input.images }),
        ...(input?.related_services !== undefined && {
          related_services: input.related_services,
        }),
        ...(metaDescription !== undefined && {
          meta_description: metaDescription,
        }),
      })
      .eq('id', id)
      .select()
      .single()) as DbResult<Content>;

    if (error) this.throwFriendlyContentError(error);
    this.invalidateCache();
    return data as Content;
  }

  async updateWhitelabel(
    id: string,
    contentJson: unknown,
    validation: ValidationResult,
    input?: Partial<
      Pick<GenerateDto, 'video_url' | 'images' | 'related_services'>
    > & {
      external_page_type?: GenerateDto['external_page_type'];
      external_slug?: string;
    },
    metaDescription?: string,
  ): Promise<Content> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('contents')
      .update({
        html: null,
        output_format: 'whitelabel_json',
        content_json: contentJson,
        score: validation.score,
        score_issues: validation.issues,
        status: 'draft',
        ...(input?.video_url !== undefined && { video_url: input.video_url }),
        ...(input?.images !== undefined && { images: input.images }),
        ...(input?.related_services !== undefined && {
          related_services: input.related_services,
        }),
        ...(input?.external_page_type !== undefined && {
          external_page_type: input.external_page_type,
        }),
        ...(input?.external_slug !== undefined && {
          external_slug: input.external_slug,
        }),
        ...(metaDescription !== undefined && {
          meta_description: metaDescription,
        }),
      })
      .eq('id', id)
      .select()
      .single()) as DbResult<Content>;

    if (error) this.throwFriendlyContentError(error);
    this.invalidateCache();
    return data as Content;
  }

  async findAll(dto: ListContentsDto = {}): Promise<{
    data: Omit<Content, 'html'>[];
    total: number;
    page: number;
    limit: number;
  }> {
    const limit = VALID_LIMITS.includes(Number(dto.limit))
      ? Number(dto.limit)
      : DEFAULT_LIMIT;
    const page = Math.max(1, Number(dto.page) || 1);
    const offset = (page - 1) * limit;
    const key = this.buildCacheKey({ ...dto, limit });

    const total = await this.countFiltered(dto);
    const entry = this.listCache.get(key);

    if (entry && entry.total === total) {
      if (entry.pages.has(page)) {
        return { data: entry.pages.get(page)!, total, page, limit };
      }
    } else {
      this.listCache.delete(key);
    }

    if (offset >= total) {
      return { data: [], total, page, limit };
    }

    let query = this.supabase
      .getClient()
      .from('contents')
      .select(
        'id, created_at, site_id, service_id, main_keyword, service, city, score, score_issues, status, wp_post_url, external_page_url, output_format, external_page_type',
      )
      .order('created_at', { ascending: false });

    query = this.applyStatusFilter(query, dto.status);
    if (dto.service) query = query.eq('service', dto.service);
    if (dto.service_id) query = query.eq('service_id', dto.service_id);
    if (dto.city) query = query.ilike('city', `%${dto.city}%`);
    if (dto.cities) {
      const cities = dto.cities.split(',').filter(Boolean);
      if (cities.length > 0) query = query.in('city', cities);
    }
    if (dto.site_id) query = query.eq('site_id', dto.site_id);
    if (dto.from) query = query.gte('created_at', dto.from);
    if (dto.to) query = query.lte('created_at', dto.to);
    const { data, error } = (await query.range(
      offset,
      offset + limit - 1,
    )) as DbResult<ContentSummary[]>;
    if (error) this.throwFriendlyContentError(error);

    const pageData = data ?? [];
    const cached = this.listCache.get(key) ?? {
      total,
      pages: new Map<number, ContentSummary[]>(),
    };
    cached.total = total;
    cached.pages.set(page, pageData);
    this.listCache.set(key, cached);

    return { data: pageData, total, page, limit };
  }

  async findByIds(ids: string[]): Promise<Content[]> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('contents')
      .select('*')
      .in('id', ids)) as DbResult<Content[]>;

    if (error) this.throwFriendlyContentError(error);
    return data ?? [];
  }

  async findById(id: string): Promise<Content> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('contents')
      .select()
      .eq('id', id)
      .single()) as DbResult<Content>;

    if (error || !data) {
      if (error) this.throwFriendlyContentError(error);
      throw new NotFoundException(`Content ${id} not found`);
    }
    return data;
  }

  async updateStatus(
    id: string,
    status: 'approved' | 'published',
  ): Promise<Content> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('contents')
      .update({ status })
      .eq('id', id)
      .select()
      .single()) as DbResult<Content>;

    if (error || !data) {
      if (error) this.throwFriendlyContentError(error);
      throw new NotFoundException(`Content ${id} not found`);
    }
    this.invalidateCache();
    return data;
  }

  async delete(id: string): Promise<void> {
    // Remove queue items that reference this content so the city becomes
    // selectable again in the scale page (done items with no content are useless)
    await this.supabase.getClient().from('queue').delete().eq('content_id', id);

    const { error } = await this.supabase
      .getClient()
      .from('contents')
      .delete()
      .eq('id', id);
    if (error) this.throwFriendlyContentError(error);
    this.invalidateCache();
  }

  async findByServiceAndCity(
    serviceId: string,
    city: string,
  ): Promise<Content[]> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('contents')
      .select()
      .eq('service_id', serviceId)
      .eq('city', city)) as DbResult<Content[]>;
    if (error) this.throwFriendlyContentError(error);
    return data ?? [];
  }

  async findLatestMainPageByService(
    serviceId: string,
  ): Promise<Content | null> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('contents')
      .select()
      .eq('service_id', serviceId)
      .eq('external_page_type', 'service')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()) as DbResult<Content>;

    if (error) this.throwFriendlyContentError(error);
    if (data) return data;

    const fallback = (await this.supabase
      .getClient()
      .from('contents')
      .select()
      .eq('service_id', serviceId)
      .eq('city', '')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()) as DbResult<Content>;

    if (fallback.error) this.throwFriendlyContentError(fallback.error);
    return fallback.data ?? null;
  }

  async forceDelete(id: string): Promise<void> {
    await this.supabase.getClient().from('queue').delete().eq('content_id', id);
    const { error } = await this.supabase
      .getClient()
      .from('contents')
      .delete()
      .eq('id', id);
    if (error) this.throwFriendlyContentError(error);
    this.invalidateCache();
  }

  async bulkDelete(
    ids: string[],
  ): Promise<{ deleted: number; skipped: number }> {
    // Filter out published contents — those cannot be deleted
    const CHUNK_SIZE = 100;
    let deleted = 0;
    let skipped = 0;

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);

      // Fetch statuses for this chunk
      const { data: rows } = (await this.supabase
        .getClient()
        .from('contents')
        .select('id, status')
        .in('id', chunk)) as DbResult<Array<{ id: string; status: string }>>;

      const deletableIds = (rows ?? []).map((row) => row.id);

      skipped += chunk.length - deletableIds.length;

      if (deletableIds.length === 0) continue;

      // Remove queue items first (FK constraint)
      await this.supabase
        .getClient()
        .from('queue')
        .delete()
        .in('content_id', deletableIds);

      const { error } = await this.supabase
        .getClient()
        .from('contents')
        .delete()
        .in('id', deletableIds);

      if (error) this.throwFriendlyContentError(error);
      deleted += deletableIds.length;
    }

    this.invalidateCache();
    return { deleted, skipped };
  }

  async bulkUpdateStatus(
    ids: string[],
    status: 'approved' | 'published',
  ): Promise<Content[]> {
    // PostgREST has a URL length limit — chunk large batches to avoid 400 errors
    const CHUNK_SIZE = 100;
    const results: Content[] = [];

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const { data, error } = (await this.supabase
        .getClient()
        .from('contents')
        .update({ status })
        .in('id', chunk)
        .select()) as DbResult<Content[]>;

      if (error) this.throwFriendlyContentError(error);
      results.push(...(data as Content[]));
    }

    this.invalidateCache();
    return results;
  }

  async setPublished(
    id: string,
    wpPostId: number,
    wpPostUrl: string,
  ): Promise<Content> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('contents')
      .update({
        status: 'published',
        wp_post_id: wpPostId,
        wp_post_url: wpPostUrl,
      })
      .eq('id', id)
      .select()
      .single()) as DbResult<Content>;

    if (error || !data) {
      if (error) this.throwFriendlyContentError(error);
      throw new NotFoundException(`Content ${id} not found`);
    }
    this.invalidateCache();
    return data;
  }

  async setExternalPublished(
    id: string,
    externalPageId: number | null,
    externalSlug: string,
    externalUrl: string,
  ): Promise<Content> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('contents')
      .update({
        status: 'published',
        external_page_id: externalPageId,
        external_slug: externalSlug,
        external_page_url: externalUrl,
        wp_post_url: externalUrl,
      })
      .eq('id', id)
      .select()
      .single()) as DbResult<Content>;

    if (error || !data) {
      if (error) this.throwFriendlyContentError(error);
      throw new NotFoundException(`Content ${id} not found`);
    }
    this.invalidateCache();
    return data;
  }

  private throwFriendlyContentError(error: DbError): never {
    if (error.code === '42703') {
      throw new BadRequestException(
        `Coluna ausente em contents: ${error.message}. Execute a migration multi-site atualizada.`,
      );
    }
    if (error.code === '23502') {
      throw new BadRequestException(
        `Constraint antiga bloqueou o conteudo: ${error.message}. Garanta que contents.html permite NULL.`,
      );
    }
    throw new BadRequestException(error.message);
  }
}

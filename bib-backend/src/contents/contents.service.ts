import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { ValidationResult } from '../validation/validation.types';
import { GenerateDto } from '../generation/dto/generate.dto';
import { ListContentsDto } from './dto/list-contents.dto';

export interface Content {
  id: string;
  created_at: string;
  main_keyword: string;
  service: string;
  city: string;
  neighborhood: string | null;
  html: string;
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
  generation_mode: 'ai' | 'template';
  wordpress_category: string | null;
}

type CacheEntry = { total: number; pages: Map<number, Omit<Content, 'html'>[]> };

const VALID_LIMITS = [10, 25, 50, 100, 250, 500, 1000];
const DEFAULT_LIMIT = 10;

@Injectable()
export class ContentsService {
  private readonly listCache = new Map<string, CacheEntry>();

  constructor(private readonly supabase: SupabaseService) {}

  private buildCacheKey(dto: ListContentsDto): string {
    return `${dto.status ?? ''}|${dto.service ?? ''}|${dto.city ?? ''}|${dto.limit ?? DEFAULT_LIMIT}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyFilters(query: any, dto: ListContentsDto): any {
    if (dto.status) query = query.eq('status', dto.status);
    if (dto.service) query = query.eq('service', dto.service);
    if (dto.city) query = query.ilike('city', `%${dto.city}%`);
    return query;
  }

  private async countFiltered(dto: ListContentsDto): Promise<number> {
    let query = this.supabase.getClient().from('contents').select('*', { count: 'exact', head: true });
    query = this.applyFilters(query as any, dto);
    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  private invalidateCache(): void {
    this.listCache.clear();
  }

  async save(
    input: GenerateDto,
    html: string,
    validation: ValidationResult,
    metaDescription?: string,
    generationMode: 'ai' | 'template' = 'ai',
  ): Promise<Content> {
    const { data, error } = await this.supabase
      .getClient()
      .from('contents')
      .insert({
        main_keyword: input.main_keyword,
        service: input.service,
        city: input.city,
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
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    this.invalidateCache();
    return data as Content;
  }

  async update(
    id: string,
    html: string,
    validation: ValidationResult,
    input?: Partial<Pick<GenerateDto, 'video_url' | 'images' | 'related_services'>>,
    metaDescription?: string,
  ): Promise<Content> {
    const { data, error } = await this.supabase
      .getClient()
      .from('contents')
      .update({
        html,
        score: validation.score,
        score_issues: validation.issues,
        status: 'draft',
        ...(input?.video_url !== undefined && { video_url: input.video_url }),
        ...(input?.images !== undefined && { images: input.images }),
        ...(input?.related_services !== undefined && { related_services: input.related_services }),
        ...(metaDescription !== undefined && { meta_description: metaDescription }),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    this.invalidateCache();
    return data as Content;
  }

  async findAll(dto: ListContentsDto = {}): Promise<{ data: Omit<Content, 'html'>[]; total: number; page: number; limit: number }> {
    const limit = VALID_LIMITS.includes(Number(dto.limit)) ? Number(dto.limit) : DEFAULT_LIMIT;
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

    let query: any = this.supabase
      .getClient()
      .from('contents')
      .select('id, created_at, main_keyword, service, city, score, score_issues, status, wp_post_url')
      .order('created_at', { ascending: false });

    query = this.applyFilters(query, dto);
    const { data, error } = await query.range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);

    const pageData = (data ?? []) as Omit<Content, 'html'>[];
    const cached = this.listCache.get(key) ?? { total, pages: new Map<number, Omit<Content, 'html'>[]>() };
    cached.total = total;
    cached.pages.set(page, pageData);
    this.listCache.set(key, cached);

    return { data: pageData, total, page, limit };
  }

  async findByIds(ids: string[]): Promise<Content[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('contents')
      .select('*')
      .in('id', ids);

    if (error) throw new Error(error.message);
    return (data ?? []) as Content[];
  }

  async findById(id: string): Promise<Content> {
    const { data, error } = await this.supabase
      .getClient()
      .from('contents')
      .select()
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException(`Content ${id} not found`);
    return data as Content;
  }

  async updateStatus(id: string, status: 'approved' | 'published'): Promise<Content> {
    const { data, error } = await this.supabase
      .getClient()
      .from('contents')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new NotFoundException(`Content ${id} not found`);
    this.invalidateCache();
    return data as Content;
  }

  async delete(id: string): Promise<void> {
    // Remove queue items that reference this content so the city becomes
    // selectable again in the scale page (done items with no content are useless)
    await this.supabase
      .getClient()
      .from('queue')
      .delete()
      .eq('content_id', id);

    const { error } = await this.supabase
      .getClient()
      .from('contents')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
    this.invalidateCache();
  }

  async findByServiceAndCity(serviceId: string, city: string): Promise<Content[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('contents')
      .select()
      .eq('service_id', serviceId)
      .eq('city', city);
    if (error) throw new Error(error.message);
    return (data ?? []) as Content[];
  }

  async forceDelete(id: string): Promise<void> {
    await this.supabase.getClient().from('queue').delete().eq('content_id', id);
    const { error } = await this.supabase.getClient().from('contents').delete().eq('id', id);
    if (error) throw new Error(error.message);
    this.invalidateCache();
  }

  async bulkDelete(ids: string[]): Promise<{ deleted: number; skipped: number }> {
    // Filter out published contents — those cannot be deleted
    const CHUNK_SIZE = 100;
    let deleted = 0;
    let skipped = 0;

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);

      // Fetch statuses for this chunk
      const { data: rows } = await this.supabase
        .getClient()
        .from('contents')
        .select('id, status')
        .in('id', chunk);

      const deletableIds = (rows ?? [])
        .map((r: { id: string; status: string }) => r.id);

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

      if (error) throw new Error(error.message);
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
      const { data, error } = await this.supabase
        .getClient()
        .from('contents')
        .update({ status })
        .in('id', chunk)
        .select();

      if (error) throw new Error(error.message);
      results.push(...(data as Content[]));
    }

    this.invalidateCache();
    return results;
  }

  async setPublished(id: string, wpPostId: number, wpPostUrl: string): Promise<Content> {
    const { data, error } = await this.supabase
      .getClient()
      .from('contents')
      .update({ status: 'published', wp_post_id: wpPostId, wp_post_url: wpPostUrl })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new NotFoundException(`Content ${id} not found`);
    this.invalidateCache();
    return data as Content;
  }
}

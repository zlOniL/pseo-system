import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { DbCountResult, DbResult } from '../common/supabase.types';

export interface QueueItem {
  id: string;
  created_at: string;
  site_id: string | null;
  service_id: string;
  city: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  mode: 'ai' | 'template' | 'library';
  template_id: string | null;
  content_id: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  attempts: number;
}

export interface QueueItemWithService extends QueueItem {
  service: {
    id: string;
    name: string;
    site_id: string | null;
  } | null;
}

export interface QueueStats {
  pending: number;
  processing: number;
  done: number;
  failed: number;
}

export interface QueueFilters {
  status?: string;
  site_id?: string;
  service_id?: string;
  mode?: string;
  city?: string;
  cities?: string;
  from?: string;
  to?: string;
  has_error?: boolean;
  service_ids?: string[];
}

export interface PaginatedQueueItems {
  data: QueueItemWithService[];
  total: number;
  page: number;
  limit: number;
}

const VALID_PAGE_LIMITS = [50, 100, 250, 500, 1000];
const DEFAULT_PAGE_LIMIT = 50;
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class QueueService {
  constructor(private readonly supabase: SupabaseService) {}

  async enqueue(
    serviceId: string,
    cities: string[],
    mode: 'ai' | 'template' | 'library' = 'ai',
    templateId?: string,
  ): Promise<QueueItem[]> {
    const { data: service, error: serviceError } = (await this.supabase
      .getClient()
      .from('services')
      .select('site_id')
      .eq('id', serviceId)
      .single()) as DbResult<{ site_id: string | null }>;

    if (serviceError) throw new Error(serviceError.message);

    // Remove failed and done items so they can be re-queued fresh
    await this.supabase
      .getClient()
      .from('queue')
      .delete()
      .eq('service_id', serviceId)
      .in('city', cities)
      .in('status', ['failed', 'done']);

    const rows = cities.map((city) => ({
      service_id: serviceId,
      site_id: service?.site_id ?? null,
      city,
      status: 'pending',
      mode,
      template_id: templateId ?? null,
    }));

    const { data, error } = (await this.supabase
      .getClient()
      .from('queue')
      .upsert(rows, { onConflict: 'service_id,city', ignoreDuplicates: true })
      .select()) as DbResult<QueueItem[]>;

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async pickNext(): Promise<QueueItem | null> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('queue')
      .select()
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()) as DbResult<QueueItem>;

    if (error) throw new Error(error.message);
    return data;
  }

  async pickAndClaim(
    mode: 'ai' | 'template' | 'library',
  ): Promise<QueueItem | null> {
    const modeFilter =
      mode === 'ai' ? 'mode.eq.ai,mode.is.null' : `mode.eq.${mode}`;

    const { data: item } = (await this.supabase
      .getClient()
      .from('queue')
      .select()
      .eq('status', 'pending')
      .or(modeFilter)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()) as DbResult<QueueItem>;

    if (!item) return null;

    const { data: claimed } = (await this.supabase
      .getClient()
      .from('queue')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        attempts: item.attempts + 1,
      })
      .eq('id', item.id)
      .eq('status', 'pending')
      .select()
      .maybeSingle()) as DbResult<QueueItem>;

    return claimed ?? null;
  }

  async hasPending(mode?: 'ai' | 'template' | 'library'): Promise<boolean> {
    let query = this.supabase
      .getClient()
      .from('queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (mode) {
      query =
        mode === 'ai'
          ? query.or('mode.eq.ai,mode.is.null')
          : query.eq('mode', mode);
    }

    const { count } = (await query) as DbCountResult<null>;
    return (count ?? 0) > 0;
  }

  async markProcessing(id: string): Promise<void> {
    // First read current attempts
    const { data: row } = (await this.supabase
      .getClient()
      .from('queue')
      .select('attempts')
      .eq('id', id)
      .single()) as DbResult<{ attempts: number | null }>;

    await this.supabase
      .getClient()
      .from('queue')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        attempts: (row?.attempts ?? 0) + 1,
      })
      .eq('id', id);
  }

  async markDone(id: string, contentId: string): Promise<void> {
    await this.supabase
      .getClient()
      .from('queue')
      .update({
        status: 'done',
        content_id: contentId,
        finished_at: new Date().toISOString(),
      })
      .eq('id', id);
  }

  async markFailed(id: string, errorMsg: string): Promise<void> {
    await this.supabase
      .getClient()
      .from('queue')
      .update({
        status: 'failed',
        error: errorMsg,
        finished_at: new Date().toISOString(),
      })
      .eq('id', id);
  }

  async resetStuckProcessing(): Promise<void> {
    await this.supabase
      .getClient()
      .from('queue')
      .update({ status: 'pending', started_at: null })
      .eq('status', 'processing');
  }

  async findByService(serviceId: string): Promise<QueueItem[]> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('queue')
      .select()
      .eq('service_id', serviceId)
      .order('created_at', { ascending: true })) as DbResult<QueueItem[]>;

    if (error) throw new Error(error.message);
    return data as QueueItem[];
  }

  async findAll(
    filters: QueueFilters = {},
    pagination: { page?: number; limit?: number } = {},
  ): Promise<PaginatedQueueItems> {
    const resolvedFilters = await this.resolveSiteFilter(filters);
    const page = Math.max(1, pagination.page ?? 1);
    const requestedLimit = Number(pagination.limit);
    const limit = VALID_PAGE_LIMITS.includes(requestedLimit)
      ? requestedLimit
      : DEFAULT_PAGE_LIMIT;
    const fromIndex = (page - 1) * limit;
    const toIndex = fromIndex + limit - 1;

    let countQuery = this.supabase
      .getClient()
      .from('queue')
      .select('*', { count: 'exact', head: true });

    countQuery = this.applyFilters(countQuery, resolvedFilters);

    const { count, error: countError } = (await countQuery) as DbCountResult<null>;
    if (countError) throw new Error(countError.message);

    const total = count ?? 0;
    if (fromIndex >= total) {
      return { data: [], total, page, limit };
    }

    let query = this.supabase
      .getClient()
      .from('queue')
      .select('*')
      .order('created_at', { ascending: false })
      .range(fromIndex, toIndex);

    query = this.applyFilters(query, resolvedFilters);

    const { data, error } = (await query) as DbResult<QueueItem[]>;
    if (error) throw new Error(error.message);

    return {
      data: await this.attachServices(data ?? []),
      total,
      page,
      limit,
    };
  }

  async getStats(filters: QueueFilters = {}): Promise<QueueStats> {
    const resolvedFilters = await this.resolveSiteFilter(filters);
    const statuses = ['pending', 'processing', 'done', 'failed'] as const;
    const requestedStatuses = resolvedFilters.status
      ? resolvedFilters.status.split(',').filter(Boolean)
      : [];
    const counts = await Promise.all(
      statuses.map(async (s) => {
        if (
          requestedStatuses.length > 0 &&
          !requestedStatuses.includes(s)
        ) {
          return [s, 0] as const;
        }

        let query = this.supabase
          .getClient()
          .from('queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', s);

        const { status: _status, ...filterWithoutStatus } = resolvedFilters;
        query = this.applyFilters(query, filterWithoutStatus, s);

        const { count } = (await query) as DbCountResult<null>;
        return [s, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(counts) as unknown as QueueStats;
  }

  async remove(id: string): Promise<void> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('queue')
      .select('status')
      .eq('id', id)
      .single()) as DbResult<{ status: QueueItem['status'] }>;

    if (error || !data)
      throw new NotFoundException(`Queue item ${id} not found`);
    if (!['pending', 'failed'].includes(data.status)) {
      throw new Error('Only pending or failed items can be removed');
    }

    await this.supabase.getClient().from('queue').delete().eq('id', id);
  }

  async bulkRemove(ids: string[]): Promise<{ deleted: number; skipped: number }> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('queue')
      .select('id, status')
      .in('id', ids)) as DbResult<Array<{ id: string; status: QueueItem['status'] }>>;

    if (error) throw new Error(error.message);

    const deletableIds = (data ?? [])
      .filter((item) => ['pending', 'failed'].includes(item.status))
      .map((item) => item.id);

    if (deletableIds.length > 0) {
      const { error: deleteError } = await this.supabase
        .getClient()
        .from('queue')
        .delete()
        .in('id', deletableIds);

      if (deleteError) throw new Error(deleteError.message);
    }

    return {
      deleted: deletableIds.length,
      skipped: ids.length - deletableIds.length,
    };
  }

  async bulkRetry(ids: string[]): Promise<QueueItem[]> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('queue')
      .update({
        status: 'pending',
        error: null,
        started_at: null,
        finished_at: null,
      })
      .in('id', ids)
      .eq('status', 'failed')
      .select()) as DbResult<QueueItem[]>;

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async retry(id: string): Promise<QueueItem> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('queue')
      .update({
        status: 'pending',
        error: null,
        started_at: null,
        finished_at: null,
      })
      .eq('id', id)
      .eq('status', 'failed')
      .select()
      .single()) as DbResult<QueueItem>;

    if (error || !data)
      throw new NotFoundException(`Queue item ${id} not found or not failed`);
    return data;
  }

  private applyFilters<T>(
    query: T,
    filters: QueueFilters,
    effectiveStatus?: QueueItem['status'],
  ): T {
    let next = query as any;

    if (filters.status) {
      const statuses = filters.status.split(',').filter(Boolean);
      next =
        statuses.length > 1
          ? next.in('status', statuses)
          : next.eq('status', filters.status);
    }
    if (filters.service_ids) {
      if (filters.service_ids.length === 0) next = next.eq('service_id', EMPTY_UUID);
      else next = next.in('service_id', filters.service_ids);
    }
    if (filters.service_id) next = next.eq('service_id', filters.service_id);
    if (filters.mode) {
      const modes = filters.mode.split(',').filter(Boolean);
      next =
        modes.length > 1 ? next.in('mode', modes) : next.eq('mode', filters.mode);
    }
    if (filters.cities) {
      const cities = filters.cities.split(',').filter(Boolean);
      if (cities.length > 0) next = next.in('city', cities);
    }
    if (filters.city) next = next.ilike('city', `%${filters.city}%`);
    const dateColumn = this.getDateColumn(effectiveStatus ?? filters.status);
    if (filters.from) next = next.gte(dateColumn, filters.from);
    if (filters.to) next = next.lte(dateColumn, filters.to);
    if (filters.has_error === true) next = next.not('error', 'is', null);
    if (filters.has_error === false) next = next.is('error', null);

    return next as T;
  }

  private getDateColumn(status?: string): 'created_at' | 'started_at' | 'finished_at' {
    if (status === 'processing') return 'started_at';
    if (status === 'done' || status === 'failed') return 'finished_at';
    return 'created_at';
  }

  private async resolveSiteFilter(filters: QueueFilters): Promise<QueueFilters> {
    if (!filters.site_id) return filters;

    let serviceQuery = this.supabase
      .getClient()
      .from('services')
      .select('id')
      .eq('site_id', filters.site_id);

    if (filters.service_id) serviceQuery = serviceQuery.eq('id', filters.service_id);

    const { data, error } = (await serviceQuery) as DbResult<Array<{ id: string }>>;
    if (error) throw new Error(error.message);

    const { site_id: _siteId, service_id, ...rest } = filters;
    return {
      ...rest,
      service_id,
      service_ids: (data ?? []).map((service) => service.id),
    };
  }

  private async attachServices(
    items: QueueItem[],
  ): Promise<QueueItemWithService[]> {
    const serviceIds = Array.from(new Set(items.map((item) => item.service_id)));
    if (serviceIds.length === 0) return [];

    const { data, error } = (await this.supabase
      .getClient()
      .from('services')
      .select('id,name,site_id')
      .in('id', serviceIds)) as DbResult<
      Array<{ id: string; name: string; site_id: string | null }>
    >;

    if (error) throw new Error(error.message);

    const services = new Map((data ?? []).map((service) => [service.id, service]));
    return items.map((item) => ({
      ...item,
      service: services.get(item.service_id) ?? null,
    }));
  }
}

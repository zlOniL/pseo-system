import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

export interface QueueItem {
  id: string;
  created_at: string;
  service_id: string;
  city: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  mode: 'ai' | 'template';
  content_id: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  attempts: number;
}

export interface QueueStats {
  pending: number;
  processing: number;
  done: number;
  failed: number;
}

@Injectable()
export class QueueService {
  constructor(private readonly supabase: SupabaseService) {}

  async enqueue(serviceId: string, cities: string[], mode: 'ai' | 'template' = 'ai'): Promise<QueueItem[]> {
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
      city,
      status: 'pending',
      mode,
    }));

    const { data, error } = await this.supabase
      .getClient()
      .from('queue')
      .upsert(rows, { onConflict: 'service_id,city', ignoreDuplicates: true })
      .select();

    if (error) throw new Error(error.message);
    return (data ?? []) as QueueItem[];
  }

  async pickNext(): Promise<QueueItem | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from('queue')
      .select()
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data as QueueItem | null;
  }

  async markProcessing(id: string): Promise<void> {
    // First read current attempts
    const { data: row } = await this.supabase
      .getClient()
      .from('queue')
      .select('attempts')
      .eq('id', id)
      .single();

    await this.supabase
      .getClient()
      .from('queue')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        attempts: ((row?.attempts as number) ?? 0) + 1,
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
    const { data, error } = await this.supabase
      .getClient()
      .from('queue')
      .select()
      .eq('service_id', serviceId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return data as QueueItem[];
  }

  async findAll(filters: { status?: string; service_id?: string } = {}): Promise<QueueItem[]> {
    let query = this.supabase.getClient().from('queue').select().order('created_at', { ascending: false });

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.service_id) query = query.eq('service_id', filters.service_id);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data as QueueItem[];
  }

  async getStats(): Promise<QueueStats> {
    const statuses = ['pending', 'processing', 'done', 'failed'] as const;
    const counts = await Promise.all(
      statuses.map(async (s) => {
        const { count } = await this.supabase
          .getClient()
          .from('queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', s);
        return [s, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(counts) as unknown as QueueStats;
  }

  async remove(id: string): Promise<void> {
    const { data, error } = await this.supabase
      .getClient()
      .from('queue')
      .select('status')
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException(`Queue item ${id} not found`);
    if (data.status !== 'pending') {
      throw new Error('Only pending items can be removed');
    }

    await this.supabase.getClient().from('queue').delete().eq('id', id);
  }

  async retry(id: string): Promise<QueueItem> {
    const { data, error } = await this.supabase
      .getClient()
      .from('queue')
      .update({ status: 'pending', error: null, started_at: null, finished_at: null })
      .eq('id', id)
      .eq('status', 'failed')
      .select()
      .single();

    if (error || !data) throw new NotFoundException(`Queue item ${id} not found or not failed`);
    return data as QueueItem;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { ServiceTemplate } from './service-templates.types';

@Injectable()
export class ServiceTemplatesService {
  constructor(private readonly supabase: SupabaseService) {}

  async findByService(serviceId: string): Promise<ServiceTemplate[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('service_templates')
      .select('*')
      .eq('service_id', serviceId)
      .order('is_main_page', { ascending: false })
      .order('version', { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as ServiceTemplate[];
  }

  async findById(id: string): Promise<ServiceTemplate> {
    const { data, error } = await this.supabase
      .getClient()
      .from('service_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException(`Template ${id} not found`);
    return data as ServiceTemplate;
  }

  async create(
    serviceId: string,
    html: string,
    baseCity: string | null,
    images: string[],
    videoUrl: string | null,
    isMainPage = false,
    label?: string,
  ): Promise<ServiceTemplate> {
    const nextVersion = await this.nextVersion(serviceId);

    const { data, error } = await this.supabase
      .getClient()
      .from('service_templates')
      .insert({ service_id: serviceId, version: nextVersion, html, base_city: baseCity, images, video_url: videoUrl, is_main_page: isMainPage, label: label ?? null })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as ServiceTemplate;
  }

  async update(
    id: string,
    html: string,
    baseCity: string | null,
    images: string[],
    videoUrl: string | null,
    isMainPage = false,
    label?: string,
  ): Promise<ServiceTemplate> {
    const { data, error } = await this.supabase
      .getClient()
      .from('service_templates')
      .update({ html, base_city: baseCity, images, video_url: videoUrl, is_main_page: isMainPage, label: label ?? null })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new NotFoundException(`Template ${id} not found`);
    return data as ServiceTemplate;
  }

  async rename(id: string, label: string): Promise<ServiceTemplate> {
    const { data, error } = await this.supabase
      .getClient()
      .from('service_templates')
      .update({ label: label.trim() || null })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new NotFoundException(`Template ${id} not found`);
    return data as ServiceTemplate;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from('service_templates')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  }

  private async nextVersion(serviceId: string): Promise<number> {
    const { data } = await this.supabase
      .getClient()
      .from('service_templates')
      .select('version')
      .eq('service_id', serviceId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    return ((data as { version: number } | null)?.version ?? 0) + 1;
  }
}

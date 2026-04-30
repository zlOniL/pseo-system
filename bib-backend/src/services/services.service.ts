import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { slugify } from '../common/slug';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

export interface Service {
  id: string;
  created_at: string;
  name: string;
  slug: string;
  video_url: string | null;
  images: string[];
  related_services: Array<{ name: string; url: string }>;
  service_notes: string | null;
  tone: string;
  min_words: number;
  status: 'active' | 'archived';
  wordpress_category: string | null;
  template_html: string | null;
  template_base_city: string | null;
  seo_title: string | null;
  seo_description: string | null;
}

@Injectable()
export class ServicesService {
  constructor(private readonly supabase: SupabaseService) {}

  async create(dto: CreateServiceDto): Promise<Service> {
    const slug = slugify(dto.name);

    const { data, error } = await this.supabase
      .getClient()
      .from('services')
      .insert({
        name: dto.name,
        slug,
        video_url: dto.video_url ?? null,
        images: dto.images ?? [],
        related_services: dto.related_services ?? [],
        service_notes: dto.service_notes ?? null,
        tone: dto.tone ?? 'profissional, confiável e direto',
        min_words: dto.min_words ?? 5000,
        status: 'active',
        wordpress_category: dto.wordpress_category ?? null,
        seo_title: dto.seo_title ?? null,
        seo_description: dto.seo_description ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Service;
  }

  async findAll(): Promise<Service[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('services')
      .select()
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data as Service[];
  }

  async findById(id: string): Promise<Service> {
    const { data, error } = await this.supabase
      .getClient()
      .from('services')
      .select()
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException(`Service ${id} not found`);
    return data as Service;
  }

  async update(id: string, dto: UpdateServiceDto): Promise<Service> {
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      patch.name = dto.name;
      patch.slug = slugify(dto.name);
    }
    if (dto.video_url !== undefined) patch.video_url = dto.video_url;
    if (dto.images !== undefined) patch.images = dto.images;
    if (dto.related_services !== undefined) patch.related_services = dto.related_services;
    if (dto.service_notes !== undefined) patch.service_notes = dto.service_notes;
    if (dto.tone !== undefined) patch.tone = dto.tone;
    if (dto.min_words !== undefined) patch.min_words = dto.min_words;
    if (dto.wordpress_category !== undefined) patch.wordpress_category = dto.wordpress_category;
    if (dto.seo_title !== undefined) patch.seo_title = dto.seo_title;
    if (dto.seo_description !== undefined) patch.seo_description = dto.seo_description;

    const { data, error } = await this.supabase
      .getClient()
      .from('services')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new NotFoundException(`Service ${id} not found`);
    return data as Service;
  }

  async delete(id: string): Promise<void> {
    const contentCount = await this.countContents(id);
    if (contentCount > 0) {
      throw new ConflictException(
        `Não é possível excluir: existem ${contentCount} página(s) vinculada(s) a este serviço. Elimine-as primeiro.`,
      );
    }

    const client = this.supabase.getClient();

    // Remove queue items, section library and templates before removing the service
    await client.from('queue').delete().eq('service_id', id);
    await client.from('section_library').delete().eq('service_id', id);
    await client.from('service_templates').delete().eq('service_id', id);

    const { error } = await client.from('services').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async archive(id: string): Promise<Service> {
    const { data, error } = await this.supabase
      .getClient()
      .from('services')
      .update({ status: 'archived' })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new NotFoundException(`Service ${id} not found`);
    return data as Service;
  }

  async saveTemplate(
    serviceId: string,
    html: string,
    baseCity: string,
    images?: string[],
    videoUrl?: string | null,
  ): Promise<Service> {
    const patch: Record<string, unknown> = { template_html: html, template_base_city: baseCity };
    if (images !== undefined) patch.images = images;
    if (videoUrl !== undefined) patch.video_url = videoUrl;

    const { data, error } = await this.supabase
      .getClient()
      .from('services')
      .update(patch)
      .eq('id', serviceId)
      .select()
      .single();

    if (error) throw new Error(`Falha ao guardar template: ${error.message}. Execute a migração supabase-migration-templates.sql no Supabase.`);
    if (!data) throw new NotFoundException(`Service ${serviceId} not found`);
    return data as Service;
  }

  async getTemplate(serviceId: string): Promise<{ template_html: string | null; template_base_city: string | null }> {
    const { data, error } = await this.supabase
      .getClient()
      .from('services')
      .select('template_html, template_base_city')
      .eq('id', serviceId)
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundException(`Service ${serviceId} not found`);
    return data as { template_html: string | null; template_base_city: string | null };
  }

  async countContents(serviceId: string): Promise<number> {
    const { count, error } = await this.supabase
      .getClient()
      .from('contents')
      .select('id', { count: 'exact', head: true })
      .eq('service_id', serviceId);

    if (error) return 0;
    return count ?? 0;
  }
}

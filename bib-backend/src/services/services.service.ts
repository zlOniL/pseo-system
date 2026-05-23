import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { DbCountResult, DbError, DbResult } from '../common/supabase.types';
import { slugify } from '../common/slug';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { MediaAsset, MediaService } from '../media/media.service';

export interface Service {
  id: string;
  created_at: string;
  site_id: string | null;
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
  featured_image_asset_id: string | null;
  featured_image_alt: string | null;
  featured_image_url?: string | null;
  template_html: string | null;
  template_base_city: string | null;
  seo_title: string | null;
  seo_description: string | null;
}

@Injectable()
export class ServicesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly media: MediaService,
  ) {}

  async create(dto: CreateServiceDto): Promise<Service> {
    const slug = slugify(dto.name);

    const { data, error } = (await this.supabase
      .getClient()
      .from('services')
      .insert({
        name: dto.name,
        slug,
        site_id: dto.site_id ?? null,
        video_url: dto.video_url ?? null,
        images: dto.images ?? [],
        related_services: dto.related_services ?? [],
        service_notes: dto.service_notes ?? null,
        tone: dto.tone ?? 'profissional, confiável e direto',
        min_words: dto.min_words ?? 5000,
        status: 'active',
        wordpress_category: dto.wordpress_category ?? null,
        featured_image_asset_id: dto.featured_image_asset_id ?? null,
        featured_image_alt: dto.featured_image_alt ?? null,
        seo_title: dto.seo_title ?? null,
        seo_description: dto.seo_description ?? null,
      })
      .select()
      .single()) as DbResult<Service>;

    if (error) this.throwFriendlyServiceError(error);
    return this.hydrateService(data as Service);
  }

  async findAll(siteId?: string): Promise<Service[]> {
    let query = this.supabase
      .getClient()
      .from('services')
      .select()
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (siteId) query = query.eq('site_id', siteId);

    const { data, error } = (await query) as DbResult<Service[]>;

    if (error) this.throwFriendlyServiceError(error);
    return this.hydrateServices(data as Service[]);
  }

  async findById(id: string): Promise<Service> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('services')
      .select()
      .eq('id', id)
      .single()) as DbResult<Service>;

    if (error || !data) {
      if (error) this.throwFriendlyServiceError(error);
      throw new NotFoundException(`Service ${id} not found`);
    }
    return this.hydrateService(data);
  }

  async update(id: string, dto: UpdateServiceDto): Promise<Service> {
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      patch.name = dto.name;
      patch.slug = slugify(dto.name);
    }
    if (dto.site_id !== undefined) patch.site_id = dto.site_id;
    if (dto.video_url !== undefined) patch.video_url = dto.video_url;
    if (dto.images !== undefined) patch.images = dto.images;
    if (dto.related_services !== undefined)
      patch.related_services = dto.related_services;
    if (dto.service_notes !== undefined)
      patch.service_notes = dto.service_notes;
    if (dto.tone !== undefined) patch.tone = dto.tone;
    if (dto.min_words !== undefined) patch.min_words = dto.min_words;
    if (dto.wordpress_category !== undefined)
      patch.wordpress_category = dto.wordpress_category;
    if (dto.featured_image_asset_id !== undefined)
      patch.featured_image_asset_id = dto.featured_image_asset_id;
    if (dto.featured_image_alt !== undefined)
      patch.featured_image_alt = dto.featured_image_alt;
    if (dto.seo_title !== undefined) patch.seo_title = dto.seo_title;
    if (dto.seo_description !== undefined)
      patch.seo_description = dto.seo_description;

    const { data, error } = (await this.supabase
      .getClient()
      .from('services')
      .update(patch)
      .eq('id', id)
      .select()
      .single()) as DbResult<Service>;

    if (error || !data) {
      if (error) this.throwFriendlyServiceError(error);
      throw new NotFoundException(`Service ${id} not found`);
    }
    if (data.featured_image_asset_id && dto.featured_image_alt !== undefined) {
      await this.media.update(data.featured_image_asset_id, {
        alt: dto.featured_image_alt ?? '',
      });
    }
    return this.hydrateService(data);
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
    if (error) this.throwFriendlyServiceError(error);
  }

  async archive(id: string): Promise<Service> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('services')
      .update({ status: 'archived' })
      .eq('id', id)
      .select()
      .single()) as DbResult<Service>;

    if (error || !data) {
      if (error) this.throwFriendlyServiceError(error);
      throw new NotFoundException(`Service ${id} not found`);
    }
    return this.hydrateService(data);
  }

  async saveTemplate(
    serviceId: string,
    html: string,
    baseCity: string,
    images?: string[],
    videoUrl?: string | null,
  ): Promise<Service> {
    const patch: Record<string, unknown> = {
      template_html: html,
      template_base_city: baseCity,
    };
    if (images !== undefined) patch.images = images;
    if (videoUrl !== undefined) patch.video_url = videoUrl;

    const { data, error } = (await this.supabase
      .getClient()
      .from('services')
      .update(patch)
      .eq('id', serviceId)
      .select()
      .single()) as DbResult<Service>;

    if (error)
      throw new Error(
        `Falha ao guardar template: ${error.message}. Execute a migração supabase-migration-templates.sql no Supabase.`,
      );
    if (!data) throw new NotFoundException(`Service ${serviceId} not found`);
    return this.hydrateService(data);
  }

  async getTemplate(serviceId: string): Promise<{
    template_html: string | null;
    template_base_city: string | null;
  }> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('services')
      .select('template_html, template_base_city')
      .eq('id', serviceId)
      .single()) as DbResult<{
      template_html: string | null;
      template_base_city: string | null;
    }>;

    if (error) this.throwFriendlyServiceError(error);
    if (!data) throw new NotFoundException(`Service ${serviceId} not found`);
    return data as {
      template_html: string | null;
      template_base_city: string | null;
    };
  }

  async countContents(serviceId: string): Promise<number> {
    const { count, error } = (await this.supabase
      .getClient()
      .from('contents')
      .select('id', { count: 'exact', head: true })
      .eq('service_id', serviceId)) as DbCountResult<null>;

    if (error) return 0;
    return count ?? 0;
  }

  private throwFriendlyServiceError(error: DbError): never {
    if (error.code === '23505') {
      throw new ConflictException(
        'Já existe um serviço com este nome/slug neste escopo. Execute a migration multi-site atualizada para permitir nomes repetidos em sites diferentes.',
      );
    }
    if (error.code === '42703') {
      throw new BadRequestException(
        `Coluna ausente no Supabase: ${error.message}`,
      );
    }
    if (error.code === '23503') {
      throw new BadRequestException('O site informado não existe no Supabase.');
    }
    throw new BadRequestException(error.message);
  }

  private async hydrateServices(services: Service[]): Promise<Service[]> {
    const assets = await this.media.findByIds(
      services
        .map((service) => service.featured_image_asset_id)
        .filter((id): id is string => Boolean(id)),
    );
    const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
    return services.map((service) =>
      this.withFeaturedImage(
        service,
        assetMap.get(service.featured_image_asset_id ?? ''),
      ),
    );
  }

  private async hydrateService(service: Service): Promise<Service> {
    if (!service.featured_image_asset_id)
      return this.withFeaturedImage(service);
    const assets = await this.media.findByIds([
      service.featured_image_asset_id,
    ]);
    return this.withFeaturedImage(service, assets[0]);
  }

  private withFeaturedImage(service: Service, asset?: MediaAsset): Service {
    return {
      ...service,
      featured_image_url: asset?.public_url ?? null,
      featured_image_alt: service.featured_image_alt ?? asset?.alt ?? null,
    };
  }
}

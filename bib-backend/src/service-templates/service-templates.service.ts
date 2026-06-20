import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { DbError, DbResult } from '../common/supabase.types';
import { ServiceTemplate } from './service-templates.types';
import type { WhitelabelGenerationIssue } from '../integrations/whitelabel-api/whitelabel.types';

@Injectable()
export class ServiceTemplatesService {
  constructor(private readonly supabase: SupabaseService) {}

  async findByService(serviceId: string): Promise<ServiceTemplate[]> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('service_templates')
      .select('*')
      .eq('service_id', serviceId)
      .order('is_main_page', { ascending: false })
      .order('version', { ascending: true })) as DbResult<ServiceTemplate[]>;

    if (error) this.throwFriendlyTemplateError(error);
    return data ?? [];
  }

  async findById(id: string): Promise<ServiceTemplate> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('service_templates')
      .select('*')
      .eq('id', id)
      .single()) as DbResult<ServiceTemplate>;

    if (error || !data) {
      if (error) this.throwFriendlyTemplateError(error);
      throw new NotFoundException(`Template ${id} not found`);
    }
    return data;
  }

  async create(
    serviceId: string,
    html: string | null,
    baseCity: string | null,
    images: string[],
    videoUrl: string | null,
    isMainPage = false,
    label?: string,
    options?: {
      siteId?: string | null;
      outputFormat?: 'html' | 'whitelabel_json';
      contentJson?: unknown;
      generationIssues?: WhitelabelGenerationIssue[];
    },
  ): Promise<ServiceTemplate> {
    const nextVersion = await this.nextVersion(serviceId);

    const { data, error } = (await this.supabase
      .getClient()
      .from('service_templates')
      .insert({
        service_id: serviceId,
        site_id: options?.siteId ?? null,
        version: nextVersion,
        html,
        content_json: options?.contentJson ?? null,
        output_format: options?.outputFormat ?? 'html',
        base_city: baseCity,
        images,
        video_url: videoUrl,
        is_main_page: isMainPage,
        label: label ?? null,
        generation_issues: options?.generationIssues ?? [],
      })
      .select()
      .single()) as DbResult<ServiceTemplate>;

    if (error) this.throwFriendlyTemplateError(error);
    return data as ServiceTemplate;
  }

  async update(
    id: string,
    html: string | null,
    baseCity: string | null,
    images: string[],
    videoUrl: string | null,
    isMainPage = false,
    label?: string,
    options?: {
      outputFormat?: 'html' | 'whitelabel_json';
      contentJson?: unknown;
      generationIssues?: WhitelabelGenerationIssue[];
    },
  ): Promise<ServiceTemplate> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('service_templates')
      .update({
        html,
        content_json: options?.contentJson ?? null,
        output_format: options?.outputFormat ?? 'html',
        base_city: baseCity,
        images,
        video_url: videoUrl,
        is_main_page: isMainPage,
        label: label ?? null,
        generation_issues: options?.generationIssues ?? [],
      })
      .eq('id', id)
      .select()
      .single()) as DbResult<ServiceTemplate>;

    if (error || !data) {
      if (error) this.throwFriendlyTemplateError(error);
      throw new NotFoundException(`Template ${id} not found`);
    }
    return data;
  }

  async rename(id: string, label: string): Promise<ServiceTemplate> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('service_templates')
      .update({ label: label.trim() || null })
      .eq('id', id)
      .select()
      .single()) as DbResult<ServiceTemplate>;

    if (error || !data) {
      if (error) this.throwFriendlyTemplateError(error);
      throw new NotFoundException(`Template ${id} not found`);
    }
    return data;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from('service_templates')
      .delete()
      .eq('id', id);

    if (error) this.throwFriendlyTemplateError(error);
  }

  private async nextVersion(serviceId: string): Promise<number> {
    const { data } = (await this.supabase
      .getClient()
      .from('service_templates')
      .select('version')
      .eq('service_id', serviceId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()) as DbResult<{ version: number }>;

    return (data?.version ?? 0) + 1;
  }

  private throwFriendlyTemplateError(error: DbError): never {
    if (error.code === '42703') {
      if (error.message.includes('generation_issues')) {
        throw new BadRequestException(
          'Coluna generation_issues ausente em service_templates. Execute supabase-migration-template-generation-issues.sql.',
        );
      }
      throw new BadRequestException(
        `Coluna ausente em service_templates: ${error.message}. Execute a migration multi-site atualizada.`,
      );
    }
    if (error.code === '23502') {
      throw new BadRequestException(
        `Constraint antiga bloqueou o template: ${error.message}. Garanta que service_templates.html permite NULL.`,
      );
    }
    throw new BadRequestException(error.message);
  }
}

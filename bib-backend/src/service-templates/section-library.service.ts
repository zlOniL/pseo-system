import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { DbError, DbResult } from '../common/supabase.types';
import {
  SectionKey,
  SectionLibraryRow,
  SectionLibrarySummary,
  SECTION_KEYS,
} from './service-templates.types';

@Injectable()
export class SectionLibraryService {
  constructor(private readonly supabase: SupabaseService) {}

  async saveAll(
    serviceId: string,
    templateId: string,
    sections: Map<SectionKey, string>,
    baseCity: string,
    siteId?: string | null,
  ): Promise<void> {
    for (const [sectionKey, html] of sections) {
      const nextVersion = await this.nextVersion(serviceId, sectionKey);
      const { error } = await this.supabase
        .getClient()
        .from('section_library')
        .insert({
          service_id: serviceId,
          site_id: siteId ?? null,
          template_id: templateId,
          section_key: sectionKey,
          version: nextVersion,
          html,
          base_city: baseCity,
          output_format: 'html',
        });
      if (error) this.throwFriendlyLibraryError(error);
    }
  }

  async saveAllJson(
    serviceId: string,
    templateId: string,
    sections: Map<SectionKey, unknown>,
    baseCity: string,
    siteId?: string | null,
  ): Promise<void> {
    for (const [sectionKey, contentJson] of sections) {
      const nextVersion = await this.nextVersion(
        serviceId,
        sectionKey,
        'whitelabel_json',
      );
      const { error } = await this.supabase
        .getClient()
        .from('section_library')
        .insert({
          service_id: serviceId,
          site_id: siteId ?? null,
          template_id: templateId,
          section_key: sectionKey,
          version: nextVersion,
          html: null,
          content_json: contentJson,
          base_city: baseCity,
          output_format: 'whitelabel_json',
        });
      if (error) this.throwFriendlyLibraryError(error);
    }
  }

  async deleteByTemplate(templateId: string): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from('section_library')
      .delete()
      .eq('template_id', templateId);
    if (error) this.throwFriendlyLibraryError(error);
  }

  async getSummary(
    serviceId: string,
    outputFormat?: 'html' | 'whitelabel_json',
  ): Promise<SectionLibrarySummary[]> {
    let query = this.supabase
      .getClient()
      .from('section_library')
      .select('section_key')
      .eq('service_id', serviceId);

    if (outputFormat) query = query.eq('output_format', outputFormat);

    const { data, error } = (await query) as DbResult<
      Array<{ section_key: SectionKey }>
    >;
    if (error) this.throwFriendlyLibraryError(error);

    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      counts.set(row.section_key, (counts.get(row.section_key) ?? 0) + 1);
    }

    return SECTION_KEYS.map((key) => ({
      section_key: key,
      version_count: counts.get(key) ?? 0,
    }));
  }

  async getRandomVersions(
    serviceId: string,
    outputFormat: 'html' | 'whitelabel_json' = 'html',
  ): Promise<Map<SectionKey, SectionLibraryRow>> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('section_library')
      .select('*')
      .eq('service_id', serviceId)
      .eq('output_format', outputFormat)) as DbResult<SectionLibraryRow[]>;

    if (error) this.throwFriendlyLibraryError(error);
    const rows = data ?? [];

    const grouped = new Map<SectionKey, SectionLibraryRow[]>();
    for (const row of rows) {
      const list = grouped.get(row.section_key) ?? [];
      list.push(row);
      grouped.set(row.section_key, list);
    }

    const missing: string[] = [];
    const result = new Map<SectionKey, SectionLibraryRow>();

    for (const key of SECTION_KEYS) {
      const versions = grouped.get(key);
      if (!versions || versions.length === 0) {
        missing.push(key);
        continue;
      }
      result.set(key, versions[Math.floor(Math.random() * versions.length)]);
    }

    if (missing.length > 0) {
      throw new BadRequestException(
        `Biblioteca incompleta: faltam secoes [${missing.join(', ')}]`,
      );
    }

    return result;
  }

  private async nextVersion(
    serviceId: string,
    sectionKey: string,
    outputFormat: 'html' | 'whitelabel_json' = 'html',
  ): Promise<number> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('section_library')
      .select('version')
      .eq('service_id', serviceId)
      .eq('section_key', sectionKey)
      .eq('output_format', outputFormat)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()) as DbResult<{ version: number }>;

    if (error) this.throwFriendlyLibraryError(error);
    return (data?.version ?? 0) + 1;
  }

  private throwFriendlyLibraryError(error: DbError): never {
    if (error.code === '42703') {
      throw new BadRequestException(
        `Coluna ausente em section_library: ${error.message}. Execute a migration multi-site atualizada.`,
      );
    }
    if (error.code === '23502') {
      throw new BadRequestException(
        `Constraint antiga bloqueou a biblioteca: ${error.message}. Garanta que section_library.html permite NULL.`,
      );
    }
    throw new BadRequestException(error.message);
  }
}

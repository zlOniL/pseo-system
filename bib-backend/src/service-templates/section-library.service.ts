import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { DbError, DbResult } from '../common/supabase.types';
import {
  SectionKey,
  SectionLibraryRow,
  SectionLibrarySummary,
  SECTION_KEYS,
  WHITELABEL_SECTION_KEYS,
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
    await this.saveBatch(
      serviceId,
      templateId,
      sections,
      baseCity,
      siteId,
      'html',
    );
  }

  async saveAllJson(
    serviceId: string,
    templateId: string,
    sections: Map<SectionKey, unknown>,
    baseCity: string,
    siteId?: string | null,
  ): Promise<void> {
    await this.saveBatch(
      serviceId,
      templateId,
      sections,
      baseCity,
      siteId,
      'whitelabel_json',
    );
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

    return this.keysForFormat(outputFormat).map((key) => ({
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

    for (const key of this.keysForFormat(outputFormat)) {
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

  private keysForFormat(
    outputFormat: 'html' | 'whitelabel_json' = 'html',
  ): readonly SectionKey[] {
    return outputFormat === 'whitelabel_json'
      ? WHITELABEL_SECTION_KEYS
      : SECTION_KEYS;
  }

  private async saveBatch(
    serviceId: string,
    templateId: string,
    sections: Map<SectionKey, unknown>,
    baseCity: string,
    siteId: string | null | undefined,
    outputFormat: 'html' | 'whitelabel_json',
  ): Promise<void> {
    if (sections.size === 0) return;

    const client = this.supabase.getClient();
    const entries = [...sections.entries()];
    const { data, error } = (await client
      .from('section_library')
      .select('section_key, version')
      .eq('service_id', serviceId)
      .eq('output_format', outputFormat)
      .in(
        'section_key',
        entries.map(([sectionKey]) => sectionKey),
      )) as DbResult<Array<{ section_key: SectionKey; version: number }>>;

    if (error) this.throwFriendlyLibraryError(error);

    const latestVersion = new Map<SectionKey, number>();
    for (const row of data ?? []) {
      latestVersion.set(
        row.section_key,
        Math.max(latestVersion.get(row.section_key) ?? 0, row.version),
      );
    }

    const rows = entries.map(([sectionKey, content]) => ({
      service_id: serviceId,
      site_id: siteId ?? null,
      template_id: templateId,
      section_key: sectionKey,
      version: (latestVersion.get(sectionKey) ?? 0) + 1,
      html: outputFormat === 'html' ? (content as string) : null,
      content_json: outputFormat === 'whitelabel_json' ? content : null,
      base_city: baseCity,
      output_format: outputFormat,
    }));

    const { error: insertError } = await client
      .from('section_library')
      .insert(rows);
    if (insertError) this.throwFriendlyLibraryError(insertError);
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

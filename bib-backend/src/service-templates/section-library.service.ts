import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { SectionKey, SectionLibraryRow, SectionLibrarySummary, SECTION_KEYS } from './service-templates.types';

@Injectable()
export class SectionLibraryService {
  constructor(private readonly supabase: SupabaseService) {}

  async saveAll(
    serviceId: string,
    templateId: string,
    sections: Map<SectionKey, string>,
    baseCity: string,
  ): Promise<void> {
    for (const [sectionKey, html] of sections) {
      const nextVersion = await this.nextVersion(serviceId, sectionKey);
      await this.supabase
        .getClient()
        .from('section_library')
        .insert({ service_id: serviceId, template_id: templateId, section_key: sectionKey, version: nextVersion, html, base_city: baseCity });
    }
  }

  async deleteByTemplate(templateId: string): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from('section_library')
      .delete()
      .eq('template_id', templateId);
    if (error) throw new Error(`deleteByTemplate failed: ${error.message}`);
  }

  async getSummary(serviceId: string): Promise<SectionLibrarySummary[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('section_library')
      .select('section_key')
      .eq('service_id', serviceId);

    if (error) throw new Error(error.message);

    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      counts.set(row.section_key, (counts.get(row.section_key) ?? 0) + 1);
    }

    return SECTION_KEYS.map((key) => ({
      section_key: key,
      version_count: counts.get(key) ?? 0,
    }));
  }

  async getRandomVersions(serviceId: string): Promise<Map<SectionKey, SectionLibraryRow>> {
    const { data, error } = await this.supabase
      .getClient()
      .from('section_library')
      .select('*')
      .eq('service_id', serviceId);

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as SectionLibraryRow[];

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
      throw new Error(`Biblioteca incompleta: faltam secções [${missing.join(', ')}]`);
    }

    return result;
  }

  private async nextVersion(serviceId: string, sectionKey: string): Promise<number> {
    const { data } = await this.supabase
      .getClient()
      .from('section_library')
      .select('version')
      .eq('service_id', serviceId)
      .eq('section_key', sectionKey)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    return ((data as { version: number } | null)?.version ?? 0) + 1;
  }
}

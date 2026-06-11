import { BadRequestException, Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { SupabaseService } from '../common/supabase.service';
import { DbError, DbResult } from '../common/supabase.types';
import { ValidationService } from '../validation/validation.service';
import {
  SECTION_KEYS,
  SectionKey,
} from '../service-templates/service-templates.types';
import {
  countTextWords,
  generatedToContentJson,
  stripJsonMarkdown,
} from '../integrations/whitelabel-api/whitelabel-json';

export interface ContentSection {
  id: string;
  content_id: string;
  section_key: SectionKey;
  sort_order: number;
  output_format: 'html' | 'whitelabel_json';
  html: string | null;
  content_json: unknown;
  word_count: number;
  generation_status: 'pending' | 'generating' | 'done' | 'failed';
  created_at: string;
  updated_at: string;
}

interface StoredContent {
  id: string;
  main_keyword: string;
  service: string;
  city: string | null;
  html: string | null;
  meta_description: string | null;
  external_slug: string | null;
}

@Injectable()
export class ContentSectionsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly ai: AiService,
    private readonly validation: ValidationService,
  ) {}

  async listByContentId(contentId: string): Promise<ContentSection[]> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('content_sections')
      .select()
      .eq('content_id', contentId)
      .order('sort_order', { ascending: true })) as DbResult<ContentSection[]>;

    if (error) this.throwFriendlySectionError(error);
    return data ?? [];
  }

  async replaceHtmlSections(
    contentId: string,
    sections: Map<SectionKey, string>,
  ): Promise<void> {
    await this.replaceSections(
      contentId,
      'html',
      [...sections.entries()].map(([sectionKey, html]) => ({
        sectionKey,
        html,
        contentJson: null,
        wordCount: this.countWords(html),
      })),
    );
  }

  async replaceJsonSections(
    contentId: string,
    sections: Map<SectionKey, unknown>,
  ): Promise<void> {
    await this.replaceSections(
      contentId,
      'whitelabel_json',
      [...sections.entries()].map(([sectionKey, contentJson]) => ({
        sectionKey,
        html: null,
        contentJson,
        wordCount: this.countWords(contentJson),
      })),
    );
  }

  async updateSection(
    contentId: string,
    sectionKey: SectionKey,
    input: { html?: string; content_json?: unknown },
  ): Promise<{ content: unknown; section: ContentSection }> {
    const content = await this.findContent(contentId);
    const section = await this.findSection(contentId, sectionKey);

    if (section.output_format === 'html') {
      const html = input.html;
      if (typeof html !== 'string' || !html.trim()) {
        throw new BadRequestException('Informe html para editar esta secao.');
      }
      return this.applyHtmlSection(content, section, html);
    }

    if (input.content_json === undefined) {
      throw new BadRequestException(
        'Informe content_json para editar esta secao.',
      );
    }
    return this.applyJsonSection(content, section, input.content_json);
  }

  async regenerateSection(
    contentId: string,
    sectionKey: SectionKey,
    feedback?: string,
  ): Promise<{ content: unknown; section: ContentSection }> {
    const content = await this.findContent(contentId);
    const section = await this.findSection(contentId, sectionKey);
    await this.setSectionStatus(section.id, 'generating');

    try {
      if (section.output_format === 'html') {
        const currentHtml = section.html ?? '';
        const raw = await this.ai.generateText(
          'Es um editor SEO senior. Reescreve apenas uma secao HTML. Retorna somente HTML valido, sem markdown.',
          `Reescreve e melhora a secao "${sectionKey}" da pagina "${content.main_keyword}".

Servico: ${content.service}
Cidade: ${content.city ?? ''}
Feedback: ${feedback ?? 'melhorar profundidade, clareza e SEO'}

HTML atual:
${currentHtml}

Regras:
- Mantem a mesma secao e estrutura visual.
- Mantem styles inline existentes quando possivel.
- Nao alteres para outra secao.
- Nao removas imagens ou placeholders.
- Retorna apenas HTML.`,
        );
        return this.applyHtmlSection(content, section, this.cleanHtml(raw));
      }

      const currentJson = section.content_json;
      const raw = await this.ai.generateText(
        'Es um editor SEO senior. Reescreve apenas uma secao JSON. Retorna somente JSON valido, sem markdown.',
        `Reescreve e melhora a secao "${sectionKey}" da pagina "${content.main_keyword}".

Servico: ${content.service}
Cidade: ${content.city ?? ''}
Feedback: ${feedback ?? 'melhorar profundidade, clareza e SEO'}

JSON atual:
${JSON.stringify(currentJson, null, 2)}

Regras:
- Mantem o mesmo formato JSON da secao atual.
- Nao alteres para outra secao.
- Nao retornes page nem sections, apenas o conteudo JSON desta secao.`,
      );
      const nextJson = this.parseJsonPayload(raw);
      return this.applyJsonSection(content, section, nextJson);
    } catch (err) {
      await this.setSectionStatus(section.id, 'failed').catch(() => undefined);
      throw err;
    }
  }

  private async applyHtmlSection(
    content: StoredContent,
    section: ContentSection,
    nextHtml: string,
  ): Promise<{ content: unknown; section: ContentSection }> {
    if (!content.html) {
      throw new BadRequestException('Conteudo sem HTML para editar.');
    }

    const replacement = this.wrapSection(section.section_key, nextHtml);
    const nextPageHtml = this.replaceMarkedSection(
      content.html,
      section.section_key,
      replacement,
    );

    const validation = this.validation.validate(
      nextPageHtml,
      content.main_keyword,
      5000,
    );

    const { data, error } = (await this.supabase
      .getClient()
      .from('contents')
      .update({
        html: nextPageHtml,
        score: validation.score,
        score_issues: validation.issues,
        status: 'draft',
      })
      .eq('id', content.id)
      .select()
      .single()) as DbResult<unknown>;

    if (error) this.throwFriendlySectionError(error);
    const updatedSection = await this.updateSectionRow(section.id, {
      html: replacement,
      content_json: null,
      word_count: this.countWords(replacement),
    });
    return { content: data, section: updatedSection };
  }

  private async applyJsonSection(
    content: StoredContent,
    section: ContentSection,
    nextJson: unknown,
  ): Promise<{ content: unknown; section: ContentSection }> {
    const allSections = await this.listByContentId(content.id);
    const sections = {} as Record<SectionKey, unknown>;
    for (const row of allSections) {
      sections[row.section_key] =
        row.section_key === section.section_key ? nextJson : row.content_json;
    }

    const contentJson = generatedToContentJson({
      page: {
        title: content.main_keyword,
        slug: content.external_slug ?? '',
        seo_title: content.main_keyword,
        seo_description: content.meta_description ?? '',
      },
      sections,
    });

    const { data, error } = (await this.supabase
      .getClient()
      .from('contents')
      .update({
        content_json: contentJson,
        status: 'draft',
      })
      .eq('id', content.id)
      .select()
      .single()) as DbResult<unknown>;

    if (error) this.throwFriendlySectionError(error);
    const updatedSection = await this.updateSectionRow(section.id, {
      html: null,
      content_json: nextJson,
      word_count: countTextWords(nextJson),
    });
    return { content: data, section: updatedSection };
  }

  private async replaceSections(
    contentId: string,
    outputFormat: 'html' | 'whitelabel_json',
    sections: Array<{
      sectionKey: SectionKey;
      html: string | null;
      contentJson: unknown;
      wordCount: number;
    }>,
  ): Promise<void> {
    const client = this.supabase.getClient();
    const deleteResult = await client
      .from('content_sections')
      .delete()
      .eq('content_id', contentId);

    if (deleteResult.error) {
      this.throwFriendlySectionError(deleteResult.error);
    }

    if (sections.length === 0) return;

    const rows = sections.map((section) => ({
      content_id: contentId,
      section_key: section.sectionKey,
      sort_order: this.sortOrder(section.sectionKey),
      output_format: outputFormat,
      html: section.html,
      content_json: section.contentJson,
      word_count: section.wordCount,
      generation_status: 'done',
      updated_at: new Date().toISOString(),
    }));

    const { error } = await client.from('content_sections').insert(rows);
    if (error) this.throwFriendlySectionError(error);
  }

  private async findContent(contentId: string): Promise<StoredContent> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('contents')
      .select()
      .eq('id', contentId)
      .single()) as DbResult<StoredContent>;

    if (error || !data) {
      if (error) this.throwFriendlySectionError(error);
      throw new BadRequestException(`Conteudo ${contentId} nao encontrado.`);
    }
    return data;
  }

  private async findSection(
    contentId: string,
    sectionKey: SectionKey,
  ): Promise<ContentSection> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('content_sections')
      .select()
      .eq('content_id', contentId)
      .eq('section_key', sectionKey)
      .single()) as DbResult<ContentSection>;

    if (error || !data) {
      if (error) this.throwFriendlySectionError(error);
      throw new BadRequestException(
        `Secao ${sectionKey} nao encontrada para este conteudo.`,
      );
    }
    return data;
  }

  private async updateSectionRow(
    id: string,
    input: { html: string | null; content_json: unknown; word_count: number },
  ): Promise<ContentSection> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('content_sections')
      .update({
        html: input.html,
        content_json: input.content_json,
        word_count: input.word_count,
        generation_status: 'done',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()) as DbResult<ContentSection>;

    if (error || !data) {
      if (error) this.throwFriendlySectionError(error);
      throw new BadRequestException(`Secao ${id} nao encontrada.`);
    }
    return data;
  }

  private async setSectionStatus(
    id: string,
    status: ContentSection['generation_status'],
  ): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from('content_sections')
      .update({
        generation_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) this.throwFriendlySectionError(error);
  }

  private replaceMarkedSection(
    html: string,
    sectionKey: SectionKey,
    replacement: string,
  ): string {
    const pattern = new RegExp(
      `<!--\\s*BIB_SECTION:${sectionKey}\\s*-->[\\s\\S]*?<!--\\s*/BIB_SECTION:${sectionKey}\\s*-->`,
      'i',
    );
    if (!pattern.test(html)) {
      throw new BadRequestException(
        `Este conteudo nao possui marcador BIB_SECTION:${sectionKey}. Regenere a pagina pela pipeline por secoes antes de editar secoes individualmente.`,
      );
    }
    return html.replace(pattern, replacement);
  }

  private wrapSection(sectionKey: SectionKey, html: string): string {
    const cleaned = this.cleanHtml(html).replace(
      new RegExp(`<!--\\s*/?BIB_SECTION:${sectionKey}\\s*-->`, 'gi'),
      '',
    );
    return `<!-- BIB_SECTION:${sectionKey} -->\n${cleaned.trim()}\n<!-- /BIB_SECTION:${sectionKey} -->`;
  }

  private cleanHtml(raw: string): string {
    return raw
      .replace(/^```[a-z0-9_-]*\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .replace(/<!DOCTYPE[\s\S]*?<body[^>]*>/i, '')
      .replace(/<\/body>[\s\S]*$/i, '')
      .replace(/<\/?html[^>]*>/gi, '')
      .trim();
  }

  private parseJsonPayload(raw: string): unknown {
    const cleaned = this.extractJsonPayload(stripJsonMarkdown(raw));
    try {
      return JSON.parse(cleaned) as unknown;
    } catch {
      throw new BadRequestException(
        `A IA retornou JSON invalido. Trecho recebido: ${cleaned.slice(0, 500)}`,
      );
    }
  }

  private extractJsonPayload(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;
    const firstObject = trimmed.indexOf('{');
    const lastObject = trimmed.lastIndexOf('}');
    if (firstObject >= 0 && lastObject > firstObject) {
      return trimmed.slice(firstObject, lastObject + 1);
    }
    const firstArray = trimmed.indexOf('[');
    const lastArray = trimmed.lastIndexOf(']');
    if (firstArray >= 0 && lastArray > firstArray) {
      return trimmed.slice(firstArray, lastArray + 1);
    }
    return trimmed;
  }

  private sortOrder(sectionKey: SectionKey): number {
    return SECTION_KEYS.indexOf(sectionKey);
  }

  private countWords(value: unknown): number {
    if (typeof value === 'string') {
      const text = value
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\{\{IMAGE_\d+\}\}/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return text.match(/[\p{L}\p{N}]+(?:[.'’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
    }
    if (Array.isArray(value)) {
      return value.reduce<number>(
        (total, item) => total + this.countWords(item),
        0,
      );
    }
    if (value && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).reduce<number>(
        (total, item) => total + this.countWords(item),
        0,
      );
    }
    return 0;
  }

  private throwFriendlySectionError(error: DbError): never {
    if (error.code === '42P01') {
      throw new BadRequestException(
        'Tabela content_sections ausente. Execute bib-backend/supabase-migration-content-sections.sql.',
      );
    }
    if (error.code === '42703') {
      throw new BadRequestException(
        `Coluna ausente em content_sections: ${error.message}. Execute a migration content_sections atualizada.`,
      );
    }
    throw new BadRequestException(error.message);
  }
}

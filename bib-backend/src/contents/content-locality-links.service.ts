import { BadRequestException, Injectable } from '@nestjs/common';
import { ContentsService, Content } from './contents.service';
import { LocalityLinksService } from '../cities/locality-links.service';
import {
  withLocalityLinksHtml,
  withLocalityLinksJson,
} from '../common/locality-links';
import { ValidationService } from '../validation/validation.service';
import type { WhitelabelContentJson } from '../integrations/whitelabel-api/whitelabel.types';
import { SupabaseService } from '../common/supabase.service';
import type { DbResult } from '../common/supabase.types';

@Injectable()
export class ContentLocalityLinksService {
  constructor(
    private readonly contents: ContentsService,
    private readonly localityLinks: LocalityLinksService,
    private readonly validation: ValidationService,
    private readonly supabase: SupabaseService,
  ) {}

  async preview(id: string) {
    const original = await this.contents.findById(id);
    const input = {
      ...original,
      city: original.external_page_type === 'service' ? null : original.city,
    };
    const links = await this.localityLinks.links(input);
    let content: Content;
    if (original.output_format === 'whitelabel_json') {
      const json = original.content_json as WhitelabelContentJson | null;
      if (!json || !Array.isArray(json.article?.blocks))
        throw new BadRequestException(
          'Conteudo sem article.blocks para atualizar.',
        );
      content = {
        ...original,
        content_json: withLocalityLinksJson(json, links),
      };
    } else {
      if (!original.html?.trim())
        throw new BadRequestException('Conteudo sem HTML para atualizar.');
      const html = withLocalityLinksHtml(original.html, links);
      let minWords = 5000;
      if (original.service_id) {
        const { data, error } = (await this.supabase
          .getClient()
          .from('services')
          .select('min_words')
          .eq('id', original.service_id)
          .maybeSingle()) as DbResult<{ min_words: number | null }>;
        if (error) throw new BadRequestException(error.message);
        minWords = data?.min_words ?? minWords;
      }
      const result = this.validation.validate(
        html,
        original.main_keyword,
        minWords,
      );
      content = {
        ...original,
        html,
        score: result.score,
        score_issues: result.issues,
      };
    }
    const changed =
      content.html !== original.html ||
      JSON.stringify(content.content_json) !==
        JSON.stringify(original.content_json);
    if (changed) content.status = 'draft';
    return { content, changed, link_count: links.length };
  }

  /** Re-read the latest document; leave publication IDs and all other fields intact. */
  async apply(id: string): Promise<Content> {
    const { content, changed } = await this.preview(id);
    if (!changed) return content;
    const validation = {
      score: content.score ?? 0,
      issues: content.score_issues ?? [],
      breakdown: { structure: 0, seo: 0, content: 0 },
    };
    return content.output_format === 'whitelabel_json'
      ? this.contents.updateWhitelabel(id, content.content_json, validation)
      : this.contents.update(id, content.html!, validation);
  }
}

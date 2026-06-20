import { SectionKey } from '../../service-templates/service-templates.types';

export interface WhitelabelGeneratedPage {
  page: {
    title: string;
    slug: string;
    seo_title: string;
    seo_description: string;
    home_card_title?: string;
    home_card_excerpt?: string;
    home_card_icon?: string;
    related_pages_json?: string[];
  };
  sections: Record<SectionKey, unknown>;
}

export interface WhitelabelContentJson {
  topbar?: { left?: string[] };
  hero?: Record<string, unknown>;
  form?: Record<string, unknown>;
  article: { blocks: Array<Record<string, unknown>> };
  faqs?: Array<{ question: string; answer: string }>;
}

export interface WhitelabelGenerationIssue {
  section_key: string;
  severity: 'warning' | 'error';
  code:
    | 'rate_limit'
    | 'invalid_json'
    | 'invalid_blocks'
    | 'structure'
    | 'external_links'
    | 'word_count'
    | 'generation_error'
    | 'final_word_count';
  message: string;
  attempts: number;
}

export function formatWhitelabelGenerationIssue(
  issue: WhitelabelGenerationIssue,
): string {
  const level = issue.severity === 'error' ? 'ERRO' : 'AVISO';
  return `[${level}] ${issue.section_key}: ${issue.message} (${issue.attempts} tentativa${issue.attempts === 1 ? '' : 's'})`;
}

export interface WhitelabelPublishResult {
  id: number;
  slug: string;
  link?: string;
}

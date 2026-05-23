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

export interface WhitelabelPublishResult {
  id: number;
  slug: string;
  link?: string;
}

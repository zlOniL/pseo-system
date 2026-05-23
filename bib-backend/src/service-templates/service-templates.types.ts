export interface ServiceTemplate {
  id: string;
  created_at: string;
  service_id: string;
  site_id: string | null;
  version: number;
  html: string | null;
  content_json: unknown;
  output_format: 'html' | 'whitelabel_json';
  base_city: string | null;
  images: string[];
  video_url: string | null;
  is_main_page: boolean;
  label: string | null;
}

export const SECTION_KEYS = [
  'intro',
  'procura_buscadores',
  'avarias_comuns',
  'servicos',
  'como_funciona',
  'tipos',
  'prevencao',
  'sistemas',
  'servicos_especializados',
  'perguntas_frequentes',
  'pesquisas_relacionadas',
  'conclusao',
  'mais_sobre',
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export interface SectionLibraryRow {
  id: string;
  created_at: string;
  service_id: string;
  site_id: string | null;
  template_id: string | null;
  section_key: SectionKey;
  version: number;
  html: string | null;
  content_json: unknown;
  output_format: 'html' | 'whitelabel_json';
  base_city: string;
}

export interface SectionLibrarySummary {
  section_key: SectionKey;
  version_count: number;
}

export interface ServiceTemplate {
  id: string;
  created_at: string;
  service_id: string;
  version: number;
  html: string;
  base_city: string;
  images: string[];
  video_url: string | null;
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
  template_id: string | null;
  section_key: SectionKey;
  version: number;
  html: string;
  base_city: string;
}

export interface SectionLibrarySummary {
  section_key: SectionKey;
  version_count: number;
}

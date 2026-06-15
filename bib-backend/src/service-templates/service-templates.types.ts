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
  'assistencia_especializada',
  'tipos',
  'servicos',
  'avarias_comuns',
  'como_funciona',
  'servico_24h',
  'prevencao',
  'reparar_ou_substituir',
  'por_que_escolher',
  'integracao_servicos',
  'contexto_local',
  'perguntas_frequentes',
  'contacte_empresa',
  'mais_sobre',
] as const;

export const WHITELABEL_MODULES = [
  {
    key: 'modulo_2_assistencia_especializada',
    title: 'Modulo 2 - Assistencia Especializada',
    display_title: 'Assistencia Especializada',
  },
  {
    key: 'modulo_3_tipos_do_servico',
    title: 'Modulo 3 - Tipos do Servico',
    display_title: 'Tipos do Servico',
  },
  {
    key: 'modulo_4_servicos_realizados',
    title: 'Modulo 4 - Servicos Realizados',
    display_title: 'Servicos Realizados',
  },
  {
    key: 'modulo_5_principais_problemas_avarias',
    title: 'Modulo 5 - Principais Problemas / Avarias que Resolvemos',
    display_title: 'Principais Problemas / Avarias que Resolvemos',
  },
  {
    key: 'modulo_6_como_funciona',
    title: 'Modulo 6 - Como Funciona o Nosso Servico',
    display_title: 'Como Funciona o Nosso Servico',
  },
  {
    key: 'modulo_7_servico_24h_7',
    title: 'Modulo 7 - Servico 24H/7',
    display_title: 'Servico 24H/7',
  },
  {
    key: 'modulo_8_manutencao_prevencao',
    title: 'Modulo 8 - Manutencao / Prevencao',
    display_title: 'Manutencao / Prevencao',
  },
  {
    key: 'modulo_9_reparar_ou_substituir',
    title: 'Modulo 9 - Reparar ou Substituir?',
    display_title: 'Reparar ou Substituir?',
  },
  {
    key: 'modulo_10_por_que_escolher',
    title: 'Modulo 10 - Por Que Escolher a Empresa',
    display_title: 'Por Que Escolher a Empresa',
  },
  {
    key: 'modulo_11_integracao_outros_servicos',
    title: 'Modulo 11 - Integracao com Outros Servicos',
    display_title: 'Integracao com Outros Servicos',
  },
  {
    key: 'modulo_12_zonas_contexto_local',
    title: 'Modulo 12 - Zonas de Atendimento ou Contexto Local',
    display_title: 'Zonas de Atendimento ou Contexto Local',
  },
  {
    key: 'modulo_13_perguntas_frequentes',
    title: 'Modulo 13 - Perguntas Frequentes',
    display_title: 'Perguntas Frequentes',
  },
  {
    key: 'modulo_14_contacte_empresa',
    title: 'Modulo 14 - Contacte a Empresa',
    display_title: 'Contacte a Empresa',
  },
  {
    key: 'modulo_15_mais_sobre_servico',
    title: 'Modulo 15 - Mais Sobre o Servico',
    display_title: 'Mais Sobre o Servico',
  },
] as const;

export const WHITELABEL_SECTION_KEYS = [
  'intro',
  ...WHITELABEL_MODULES.map((module) => module.key),
] as const;

export type HtmlSectionKey = (typeof SECTION_KEYS)[number];
export type WhitelabelSectionKey = (typeof WHITELABEL_SECTION_KEYS)[number];
export type SectionKey = HtmlSectionKey | WhitelabelSectionKey;

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

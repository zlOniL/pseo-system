/**
 * SEO title and description templates per service, sourced from SEO.md.
 * City placeholder is "Lisboa" — replaced at publish time with the actual city.
 * Keys match slugify(service.name).
 */

interface SeoEntry {
  title: string;
  description: string;
}

const SEO_TEMPLATES: Record<string, SeoEntry> = {
  'reparacao-de-janelas': {
    title: 'Reparação de Janelas em Lisboa – Caixilharia SOS 24H/7',
    description: 'Serviços de Reparação de Janelas em Lisboa 24h/7 - Instalação, Manutênção e Arranjo de Janelas em Alumínio, Vidros e PVC.',
  },
  'reparacao-de-portas': {
    title: 'Reparação de Portas em Lisboa – Caixilharia SOS 24H/7',
    description: 'Serviços de Reparação de Portas em Lisboa 24h/7 - Instalação, Manutênção e Arranjo de Portas em Alumínio, Vidros e PVC.',
  },
  'reparacao-de-estores': {
    title: 'Reparação de Estores em Lisboa – SOS Estores 24H/7',
    description: 'Empresa de Reparação de Estores em Lisboa 24h/7 - Instalação, Manutênção e Arranjo de Estores - Sáb, Dom e Feriados.',
  },
  'reparacao-de-caldeiras': {
    title: 'Reparação de Caldeiras em Lisboa - Assistência 24h/7',
    description: 'Técnicos de Reparação de Caldeiras em Lisboa 24h/7 - Instalação, Manutênção e Arranjo de Caldeiras - Sáb, Dom e Feriados.',
  },
  'reparacao-de-esquentadores': {
    title: 'Reparação de Esquentadores em Lisboa - Assistência 24h/7',
    description: 'Técnicos de Reparação de Esquentadores em Lisboa 24h/7 - Instalação, Manutênção e Arranjo de Esquentadores - Sáb, Dom e Feriados.',
  },
  'reparacao-de-maquina-de-lavar-roupa': {
    title: 'Reparação de Máquinas de Lavar Roupa em Lisboa 24h/7',
    description: 'Técnicos de Reparação de Máquinas de Lavar Roupa em Lisboa 24h/7 - Assistência ao Domicílio 24h/7 - Sáb, Dom e Feriados.',
  },
  'reparacao-de-maquinas-de-lavar-roupa': {
    title: 'Reparação de Máquinas de Lavar Roupa em Lisboa 24h/7',
    description: 'Técnicos de Reparação de Máquinas de Lavar Roupa em Lisboa 24h/7 - Assistência ao Domicílio 24h/7 - Sáb, Dom e Feriados.',
  },
  'vidraceiro': {
    title: 'Vidraceiro em Lisboa – Vidros em Domicílio SOS 24H/7',
    description: 'Buscando por Serviços de Vidraceiro em Lisboa? - Vidros Sob Medida com Urgência - Porta de Vidro, Janelas, Montras e Outros.',
  },
  'eletricista': {
    title: 'Eletricista em Lisboa – Serviços Elétricos SOS 24H/7',
    description: 'Serviços de Eletricista em Lisboa 24h/7 - Profissionais em Instalação, Manutênção e Reparações Elétricas - Sáb, Dom e Feriados.',
  },
  'canalizador': {
    title: 'Canalizador em Lisboa – Instalação e Reparação SOS 24H/7',
    description: 'Serviços de Canalizador em Lisboa 24h/7 - Instalação, Manutenção e Reparação de Canalização - Sáb, Dom e Feriados.',
  },
  'desentupimentos': {
    title: 'Desentupimentos em Lisboa - Serviços SOS 24H/7',
    description: 'Serviços de desentupimentos em Lisboa 24h/7 - Alta Pressão e Mecanizados - Assistência Total - Sáb, Dom e Feriados.',
  },
  'reparacao-de-autoclismos': {
    title: 'Reparação de Autoclismos em Lisboa – Assistência 24H/7',
    description: 'Serviço de Reparação de Autoclismos em Lisboa 24h/7 - Instalação, Manutênção e Reparação em Geral - Sáb, Dom e Feriados.',
  },
  'reparacao-de-torneiras': {
    title: 'Reparação de Torneiras em Lisboa – Assistência SOS 24H/7',
    description: 'Serviços de Reparação de Torneiras em Lisboa - Assistência em Geral 24H/7 - Sáb, Dom e Feriados. Todas as Marcas.',
  },
};

/**
 * Returns SEO title and description for a service+city combination.
 * Replaces "Lisboa" (case-insensitive) with the actual city.
 * Returns null if no template exists for the given service slug.
 */
export function getSeoForTemplate(
  serviceSlug: string,
  city: string,
): { title: string; description: string } | null {
  const entry = SEO_TEMPLATES[serviceSlug];
  if (!entry) return null;

  const replace = (text: string) =>
    text.replace(/Lisboa/gi, (match) => {
      if (match === match.toUpperCase()) return city.toUpperCase();
      if (match[0] === match[0].toUpperCase()) return city.charAt(0).toUpperCase() + city.slice(1);
      return city.toLowerCase();
    });

  return {
    title: replace(entry.title),
    description: replace(entry.description),
  };
}

import { formatLocationPhrase } from './location-preposition';

const IMAGE_SECTIONS = [
  ['intro', 0],
  ['assistencia_especializada', 1],
  ['tipos', 2],
  ['servicos', 3],
  ['servico_24h', 4],
  ['prevencao', 5],
  ['integracao_servicos', 6],
  ['perguntas_frequentes', 7],
] as const;

// Legacy monolithic HTML has different section names and image positions.
const MONOLITHIC_ANCHORS = [
  /(<h2\b[^>]*>[^<]*Procura\s+em\s+Buscadores)/i,
  /(<h2\b[^>]*>[^<]*Avarias\s+Comuns)/i,
  /(<h2\b[^>]*>[^<]*Servi[cç]os\s+de\s)/i,
  /(<h2\b[^>]*>[^<]*Como\s+Funciona)/i,
  /(<h2\b[^>]*>[^<]*Preven[cç][aã]o\s+e\s+Manuten[cç][aã]o)/i,
  /(<h2\b[^>]*>[^<]*Sistemas\s+e\s+Interven[cç][oõ]es)/i,
  /(<h2\b[^>]*>[^<]*Integra[cç][aã]o\s+com)/i,
  /(<h2\b[^>]*>[^<]*Pesquisas\s+Relacionadas)/i,
];

export function injectImages(
  html: string,
  images: string[],
  keyword: string,
  service: string,
  city: string,
): string {
  const location = city ? ` ${formatLocationPhrase(city)}` : '';
  const alts = [
    keyword,
    `${service} profissional${location}`,
    `tipos de ${service}${location}`,
    `servicos de ${service}${location}`,
    `atendimento ${service} 24 horas${location}`,
    `manutencao preventiva de ${service}${location}`,
    `servicos relacionados com ${service}${location}`,
    `perguntas frequentes sobre ${service}${location}`,
  ];

  const hasSectionMarkers = /<!--\s*BIB_SECTION:/i.test(html);
  if (hasSectionMarkers) {
    // Section-keyed placement is deterministic; legacy model tokens are discarded.
    html = stripImagePlaceholders(html);
    for (const [sectionKey, imageIndex] of IMAGE_SECTIONS) {
      const src = images[imageIndex]?.trim();
      if (!src) continue;
      const section = new RegExp(
        `(<!--\\s*BIB_SECTION:${sectionKey}\\s*-->)([\\s\\S]*?)(<!--\\s*\\/BIB_SECTION:${sectionKey}\\s*-->)`,
        'i',
      );
      html = html.replace(section, (_match, open: string, content: string, close: string) =>
        `${open}${content}${/<img\b/i.test(content) ? '' : buildImgHtml(src, alts[imageIndex] ?? keyword)}${close}`,
      );
    }
    return stripImagePlaceholders(html);
  }

  // Preserve old, backend-stored slots while migrating to deterministic placement.
  const injected = new Set<number>();
  for (let i = 0; i < 8; i++) {
    const src = images[i]?.trim();
    const imgHtml = src ? buildImgHtml(src, alts[i] ?? keyword) : '';
    const token = new RegExp(`\\{\\{\\s*IMAGE_${i + 1}\\s*\\}\\}`, 'gi');
    if (token.test(html)) {
      token.lastIndex = 0;
      html = html.replace(token, imgHtml);
      if (src) injected.add(i);
    }
  }

  for (let i = 0; i < 8; i++) {
    const src = images[i]?.trim();
    if (!src || injected.has(i)) continue;
    const anchor = MONOLITHIC_ANCHORS[i];
    if (anchor?.test(html))
      html = html.replace(anchor, `${buildImgHtml(src, alts[i] ?? keyword)}\n$1`);
  }

  return stripImagePlaceholders(html);
}

function stripImagePlaceholders(html: string): string {
  return html.replace(/\{\{[^}]+\}\}/gi, (token) =>
    isImagePlaceholder(token) ? '' : token,
  );
}

function isImagePlaceholder(token: string): boolean {
  const name = token.slice(2, -2).replace(/[^a-z]/gi, '').toUpperCase();
  return ['IMAGE', 'IMAG', 'IMGE', 'IMAE', 'MAGE'].some((prefix) =>
    name.startsWith(prefix),
  );
}

function buildImgHtml(src: string, alt: string): string {
  return (
    `\n<hr />\n` +
    `<img class="alignnone size-full" style="max-width: 100%; height: auto; display: block;" ` +
    `src="${src}" alt="${alt}" width="1080" height="720" />\n` +
    `<hr />\n`
  );
}

// Structural anchor patterns: inject images BEFORE these section headers.
// Ordered to match the 8 template positions used by the 15-module prompt.
const STRUCTURAL_ANCHORS = [
  /(<h2[^>]*>[^<]*Assist[eê]ncia\s+Especializada)/i,
  /(<h2[^>]*>[^<]*Tipos\s+de\s)/i,
  /(<h2[^>]*>[^<]*Servi[cç]os\s+Realizados)/i,
  /(<h2[^>]*>[^<]*Manuten[cç][aã]o\s+e\s+Preven)/i,
  /(<h2[^>]*>[^<]*Reparar\s+ou\s+Substituir)/i,
  /(<h2[^>]*>[^<]*Integra[cç][aã]o\s+com)/i,
  /(<h2[^>]*>[^<]*(?:Zonas\s+de\s+Atendimento|Contexto\s+Local))/i,
  /(<h2[^>]*>[^<]*Perguntas\s+Frequentes)/i,
];

export function injectImages(
  html: string,
  images: string[],
  keyword: string,
  service: string,
  city: string,
): string {
  const location = city ? ` em ${city}` : '';
  const alts = [
    keyword,
    `${service} profissional${location}`,
    `servicos de ${service}${location}`,
    `manutencao de ${service}${location}`,
    `reparar ou substituir ${service}${location}`,
    `servicos relacionados com ${service}${location}`,
    `atendimento de ${service}${location}`,
    `${service} urgente 24h${location}`,
  ];

  const injected = new Set<number>();

  for (let i = 0; i < 8; i++) {
    const src = images[i]?.trim();
    const imgHtml = src ? buildImgHtml(src, alts[i] ?? keyword) : '';

    const withPTag = new RegExp(
      `<p[^>]*>\\s*\\{\\{\\s*IMAGE_${i + 1}\\s*\\}\\}\\s*<\\/p>`,
      'gi',
    );
    const plain = new RegExp(`\\{\\{\\s*IMAGE_${i + 1}\\s*\\}\\}`, 'gi');

    const before = html;
    html = html.replace(withPTag, imgHtml);
    if (html === before) {
      html = html.replace(plain, imgHtml);
    }
    if (html !== before) {
      injected.add(i);
    }
  }

  for (let i = 0; i < 8; i++) {
    if (injected.has(i)) continue;
    const src = images[i]?.trim();
    if (!src) continue;

    const anchor = STRUCTURAL_ANCHORS[i];
    if (anchor && anchor.test(html)) {
      html = html.replace(
        anchor,
        `${buildImgHtml(src, alts[i] ?? keyword)}\n$1`,
      );
    }
  }

  html = html.replace(/<p[^>]*>\s*\{\{\s*IMAGE_\d+\s*\}\}\s*<\/p>/gi, '');
  html = html.replace(/\{\{\s*IMAGE_\d+\s*\}\}/gi, '');

  return html;
}

function buildImgHtml(src: string, alt: string): string {
  return (
    `\n<hr />\n` +
    `<img class="alignnone size-full" style="max-width: 100%; height: auto; display: block;" ` +
    `src="${src}" alt="${alt}" width="1080" height="720" />\n` +
    `<hr />\n`
  );
}

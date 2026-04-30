// Structural anchor patterns: inject images BEFORE these section headers
// Ordered to match the 8 template positions (IMAGE_1 … IMAGE_8).
const STRUCTURAL_ANCHORS = [
  /(<h2[^>]*>[^<]*Procura\s+em\s+Buscadores)/i,
  /(<h2[^>]*>[^<]*Avarias\s+Comuns)/i,
  /(<h2[^>]*>(?!.*Especializados)[^<]*Serviços\s+de\s)/i,
  /(<h2[^>]*>[^<]*Como\s+Funciona)/i,
  /(<h2[^>]*>[^<]*Prevenção)/i,
  /(<h2[^>]*>[^<]*Sistemas\s+e\s+Intervenções)/i,
  /(<h2[^>]*>[^<]*Integração\s+com)/i,
  /(<h2[^>]*>[^<]*Pesquisas\s+Relacionadas)/i,
];

export function injectImages(
  html: string,
  images: string[],
  keyword: string,
  service: string,
  city: string,
): string {
  const alts = [
    keyword,
    `${service} profissional em ${city}`,
    `serviços de ${service} em ${city}`,
    `como funciona ${service} em ${city}`,
    `tipos de ${service} em ${city}`,
    `prevenção de avarias ${service} em ${city}`,
    `${service} perto de mim em ${city}`,
    `${service} urgente 24h em ${city}`,
  ];

  const injected = new Set<number>();

  // Pass 1 — placeholder-based injection.
  // Uses a regex (not a literal string) to tolerate minor AI variations:
  //   {{ IMAGE_3 }}, {{image_3}}, {{IMAGE_3 }}, etc.
  // Also handles the case where the AI wrapped the placeholder in a <p> tag.
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

  // Pass 2 — structural fallback for images not injected in Pass 1.
  // Injects the image immediately before the known section anchor.
  for (let i = 0; i < 8; i++) {
    if (injected.has(i)) continue;
    const src = images[i]?.trim();
    if (!src) continue;

    const anchor = STRUCTURAL_ANCHORS[i];
    if (anchor && anchor.test(html)) {
      html = html.replace(anchor, `${buildImgHtml(src, alts[i] ?? keyword)}\n$1`);
    }
  }

  // Pass 3 — clean up any remaining {{IMAGE_N}} the AI may have duplicated
  // or placed in positions we could not structurally anchor.
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

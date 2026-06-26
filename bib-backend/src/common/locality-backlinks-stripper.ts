const DYNAMIC_LOCALITY_LINKS_PLACEHOLDER =
  /<div\s+id=["']dynamic-neighborhood-links["']\s*>\s*<\/div>\s*/gi;

const LOCALITY_LINKS_HEADING =
  '(?:Atendemos\\s+Tamb[eé]m|Tamb[eé]m\\s+Atendemos(?:\\s+nas\\s+Seguintes\\s+Localidades)?|Cidades\\s+Onde\\s+Atendemos|Tamb[eé]m\\s+fazemos?[\\s\\S]*?noutras\\s+Localidades)';

const LOCALITY_LINKS_SECTION =
  new RegExp(
    `<section\\b[^>]*>\\s*<h2\\b[^>]*>\\s*${LOCALITY_LINKS_HEADING}\\s*<\\/h2>[\\s\\S]*?<\\/section>\\s*`,
    'gi',
  );

const LOCALITY_LINKS_H2_BLOCK =
  new RegExp(
    `<h2\\b[^>]*>\\s*${LOCALITY_LINKS_HEADING}\\s*<\\/h2>[\\s\\S]*?(?=<h2\\b|$)`,
    'gi',
  );

export function stripLocalityBacklinksSection(html: string): string {
  return html
    .replace(DYNAMIC_LOCALITY_LINKS_PLACEHOLDER, '')
    .replace(LOCALITY_LINKS_SECTION, '')
    .replace(LOCALITY_LINKS_H2_BLOCK, '')
    .trimEnd();
}

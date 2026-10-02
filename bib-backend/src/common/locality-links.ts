import { parse } from 'node-html-parser';
import { buildLocalKeyword, buildLocalSlug } from './location-preposition';
import {
  stripLocalityBacklinksSection,
  isLocalityLinksHeading,
} from './locality-backlinks-stripper';
import type { WhitelabelContentJson } from '../integrations/whitelabel-api/whitelabel.types';

export interface LocalityLink {
  label: string;
  url: string;
}
export const LOCALITY_LINKS_TITLE = 'Também atendemos';
export const OTHER_LOCALITY_LINKS_TITLE_PREFIX = 'Também Fazemos';
export const OTHER_LOCALITY_LINKS_TITLE_SUFFIX = 'noutras Localidades';
export const OTHER_LOCALITIES = [
  'Lisboa',
  'Cascais',
  'Oeiras',
  'Loures',
  'Sintra',
  'Amadora',
  'Odivelas',
  'Vila Franca de Xira',
  'Margem Sul',
  'Setúbal',
  'Montijo',
  'Alcochete',
  'Barreiro',
  'Seixal',
  'Almada',
  'Quinta do Conde',
  'Palmela',
  'Pinhal Novo',
  'Porto',
  'Vila Nova de Gaia',
  'Maia',
  'Matosinhos',
  'Valongo',
  'Gondomar',
  'Espinho',
  'Braga',
  'Guimarães',
  'Barcelos',
  'Algarve',
  'Lagos',
  'Portimão',
  'Loulé',
  'Quarteira',
  'Albufeira',
  'Vilamoura',
  'Faro',
  'Olhão',
  'Almancil',
];

export function escapeLocalityHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildLocalityLinks(
  localities: string[],
  service: string,
  baseUrl: string,
  suffix: string | boolean = '/',
): LocalityLink[] {
  const base = baseUrl.replace(/\/+$/, '');
  const linkSuffix = typeof suffix === 'boolean' ? (suffix ? '/' : '') : suffix;
  const seen = new Set<string>();
  return localities.flatMap((locality) => {
    const city = locality.trim();
    const slug = buildLocalSlug(service, city);
    if (!city || seen.has(slug)) return [];
    seen.add(slug);
    return [
      {
        label: buildLocalKeyword(service, city),
        url: `${base}/${slug}${linkSuffix}`,
      },
    ];
  });
}

export function buildOtherLocalityLinks(
  service: string,
  baseUrl: string,
  suffix: string | boolean = '/',
): LocalityLink[] {
  const base = baseUrl.replace(/\/+$/, '');
  const linkSuffix = typeof suffix === 'boolean' ? (suffix ? '/' : '') : suffix;
  return OTHER_LOCALITIES.map((city) => ({
    label: `${service} ${city}`,
    url: `${base}/${buildLocalSlug(service, city)}${linkSuffix}`,
  }));
}

export function renderLocalityLinksHtml(links: LocalityLink[]): string {
  if (!links.length) return '';
  const items = links.map(
    ({ label, url }) =>
      `<li><a style="color: #111 !important; font-weight: 600; text-decoration: underline;" href="${escapeLocalityHtml(url)}">${escapeLocalityHtml(label)}</a></li>`,
  );
  const half = Math.ceil(items.length / 2);
  const column = (rows: string[]) =>
    `<div style="flex: 1; min-width: 260px;"><ul style="list-style: none; padding-left: 0;">\n${rows.join('\n')}\n</ul></div>`;
  return `<section data-bib-locality-links="true">\n<h2 style="color: #320000;">${LOCALITY_LINKS_TITLE}</h2>\n<div style="display: flex; flex-wrap: wrap; gap: 20px;">\n${column(items.slice(0, half))}\n${column(items.slice(half))}\n</div>\n</section>`;
}

export function renderOtherLocalityLinksHtml(
  service: string,
  links: LocalityLink[],
): string {
  if (!links.length) return '';
  const escapedService = escapeLocalityHtml(service);
  const serviceLower = escapeLocalityHtml(service.toLowerCase());
  const items = links.map(
    ({ label, url }) =>
      `<li style="color: #320000;"><a style="color: #111 !important; font-weight: 600; text-decoration: underline;" href="${escapeLocalityHtml(url)}">${escapeLocalityHtml(label)}</a></li>`,
  );
  const half = Math.ceil(items.length / 2);
  const column = (rows: string[]) =>
    `<div style="flex: 1; min-width: 260px;"><ul style="padding-left: 20px; margin: 0;">\n${rows.join('\n')}\n</ul></div>`;
  return `<section data-bib-other-locality-links="true">\n<h2 style="color: #320000;">${OTHER_LOCALITY_LINKS_TITLE_PREFIX} ${escapedService} ${OTHER_LOCALITY_LINKS_TITLE_SUFFIX}</h2>\n<p style="color: #320000;">Para além desta localidade, prestamos <strong>serviços profissionais de ${serviceLower}</strong> em várias zonas de Portugal, com <strong>atendimento 24h / 7 dias</strong>, técnicos especializados e soluções completas para <strong>${serviceLower}</strong>, manutenção, assistência técnica, intervenções urgentes e acompanhamento programado.</p>\n<div style="display: flex; flex-wrap: wrap; gap: 20px;">\n${column(items.slice(0, half))}\n${column(items.slice(half))}\n</div>\n</section>`;
}

/** Insert outside editable BIB_SECTION ranges. */
export function withLocalityLinksHtml(
  html: string,
  links: LocalityLink[],
  otherLocalities?: { service: string; links: LocalityLink[] },
): string {
  let cleaned = stripLocalityBacklinksSection(html);
  const otherBlock = otherLocalities
    ? renderOtherLocalityLinksHtml(
        otherLocalities.service,
        otherLocalities.links,
      )
    : '';
  const block = renderLocalityLinksHtml(links);
  if (!otherBlock && !block) return cleaned;

  if (otherBlock) cleaned = insertOtherLocalitiesHtml(cleaned, otherBlock);
  if (!block) return cleaned;

  return insertLocalityLinksHtml(cleaned, block);
}

function insertLocalityLinksHtml(html: string, block: string): string {
  const maisSobreEnd = /<!--\s*\/BIB_SECTION:mais_sobre\s*-->/i.exec(html);
  let index = maisSobreEnd ? maisSobreEnd.index + maisSobreEnd[0].length : -1;
  const root = index < 0 ? parse(html, { comment: true }) : null;
  if (index < 0 && root) index = findMoreAboutEndIndex(root);
  if (index < 0 && root) index = containerEndIndex(root, html.length);

  return insertHtmlAt(html, index, block);
}

function insertOtherLocalitiesHtml(html: string, block: string): string {
  const localEnd = /<!--\s*\/BIB_SECTION:contexto_local\s*-->/i.exec(html);
  const faqStart = /<!--\s*BIB_SECTION:perguntas_frequentes\s*-->/i.exec(html);
  let index = localEnd ? localEnd.index + localEnd[0].length : -1;
  const root = index < 0 ? parse(html, { comment: true }) : null;
  if (index < 0) index = faqStart?.index ?? -1;
  if (index < 0 && root) index = findFaqStartIndex(root);
  if (index < 0 && root) index = containerEndIndex(root, html.length);

  return insertHtmlAt(html, index, block);
}

function insertHtmlAt(html: string, index: number, block: string): string {
  return `${html.slice(0, index).trimEnd()}\n\n${block}\n\n${html.slice(index).trimStart()}`.trim();
}

function findMoreAboutEndIndex(root: ReturnType<typeof parse>): number {
  const heading = root
    .querySelectorAll('h2')
    .find((node) => /mais\s+sobre/i.test(node.text));
  if (!heading) return -1;
  const parent = heading.parentNode;
  if (parent?.tagName === 'SECTION' && parent.querySelector('h2') === heading)
    return parent.range[1];
  if (!parent) return heading.range[1];
  const siblings = parent.childNodes;
  const headingIndex = siblings.indexOf(heading);
  for (let i = headingIndex + 1; i < siblings.length; i++) {
    if (/<h2\b/i.test(siblings[i].toString())) return siblings[i].range[0];
  }
  return siblings.at(-1)?.range[1] ?? heading.range[1];
}

function findFaqStartIndex(root: ReturnType<typeof parse>): number {
  const heading = root
    .querySelectorAll('h2')
    .find((node) => /perguntas\s+frequentes/i.test(node.text));
  if (!heading) return -1;
  const parent = heading.parentNode;
  if (parent?.tagName === 'SECTION' && parent.querySelector('h2') === heading)
    return parent.range[0];
  return heading.range[0];
}

function containerEndIndex(
  root: ReturnType<typeof parse>,
  fallback: number,
): number {
  const body = root.querySelector('body');
  const container =
    body ??
    (root.children.length === 1 &&
    ['MAIN', 'ARTICLE', 'DIV'].includes(root.children[0].tagName)
      ? root.children[0]
      : root);
  const last = container.childNodes.at(-1);
  return last?.range[1] ?? fallback;
}

/** Uses only the existing heading/list contract; no new remote block type. */
export function withLocalityLinksJson(
  content: WhitelabelContentJson,
  links: LocalityLink[],
): WhitelabelContentJson {
  const blocks: Array<Record<string, unknown>> = [];
  let skipping = false;
  for (const block of content.article.blocks) {
    if (block.type === 'faq_list') skipping = false;
    if (block.type === 'heading' && Number(block.level ?? 2) === 2) {
      skipping = isLocalityLinksHeading(String(block.text ?? ''));
    }
    if (!skipping) blocks.push(block);
  }
  if (links.length) {
    let index = blocks.findIndex(
      (block) =>
        block.type === 'heading' &&
        /perguntas\s+frequentes/i.test(String(block.text ?? '')),
    );
    if (index < 0)
      index = blocks.findIndex((block) => block.type === 'faq_list');
    if (index < 0) index = blocks.length;
    blocks.splice(
      index,
      0,
      { type: 'heading', level: 2, text: LOCALITY_LINKS_TITLE },
      {
        type: 'list',
        items: links.map(
          ({ label, url }) =>
            `<a href="${escapeLocalityHtml(url)}">${escapeLocalityHtml(label)}</a>`,
        ),
      },
    );
  }
  return { ...content, article: { ...content.article, blocks } };
}

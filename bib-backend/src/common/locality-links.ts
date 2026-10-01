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

/** Insert outside editable BIB_SECTION ranges, before the FAQ when available. */
export function withLocalityLinksHtml(
  html: string,
  links: LocalityLink[],
): string {
  const cleaned = stripLocalityBacklinksSection(html);
  const block = renderLocalityLinksHtml(links);
  if (!block) return cleaned;
  const faqMarker = /<!--\s*BIB_SECTION:perguntas_frequentes\s*-->/i.exec(
    cleaned,
  );
  const localEnd = /<!--\s*\/BIB_SECTION:contexto_local\s*-->/i.exec(cleaned);
  let index =
    faqMarker?.index ?? (localEnd ? localEnd.index + localEnd[0].length : -1);
  if (index < 0) {
    const root = parse(cleaned, { comment: true });
    const faq = root
      .querySelectorAll('h2')
      .find((node) => /perguntas\s+frequentes/i.test(node.text));
    if (faq) {
      const parent = faq.parentNode;
      index =
        parent?.tagName === 'SECTION' && parent.querySelector('h2') === faq
          ? parent.range[0]
          : faq.range[0];
    } else {
      const body = root.querySelector('body');
      const container =
        body ??
        (root.children.length === 1 &&
        ['MAIN', 'ARTICLE', 'DIV'].includes(root.children[0].tagName)
          ? root.children[0]
          : root);
      const last = container.childNodes.at(-1);
      index = last?.range[1] ?? cleaned.length;
    }
  }
  return `${cleaned.slice(0, index).trimEnd()}\n\n${block}\n\n${cleaned.slice(index).trimStart()}`.trim();
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

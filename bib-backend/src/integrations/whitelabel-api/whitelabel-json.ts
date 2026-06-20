import { BadRequestException } from '@nestjs/common';
import { slugify } from '../../common/slug';
import {
  SectionKey,
  WHITELABEL_MODULES,
  WHITELABEL_SECTION_KEYS,
} from '../../service-templates/service-templates.types';
import {
  WhitelabelContentJson,
  WhitelabelGeneratedPage,
} from './whitelabel.types';
import { normalizeWhitelabelContentLinks } from './whitelabel-link-rules';

const WHITELABEL_ARTICLE_SECTION_KEYS = WHITELABEL_SECTION_KEYS.filter(
  (key) => key !== 'intro',
);

const WHITELABEL_MODULE_DISPLAY_TITLE_BY_KEY = new Map<string, string>(
  WHITELABEL_MODULES.map((module) => [module.key, module.display_title]),
);

function isFaqItem(
  item: unknown,
): item is { question: string; answer: string } {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as { question?: unknown; answer?: unknown };
  return (
    typeof candidate.question === 'string' &&
    typeof candidate.answer === 'string'
  );
}

function isFaqListBlock(block: Record<string, unknown>): block is Record<
  string,
  unknown
> & {
  type: 'faq_list';
  items: Array<{ question: string; answer: string }>;
} {
  return (
    block.type === 'faq_list' &&
    Array.isArray(block.items) &&
    block.items.every(isFaqItem)
  );
}

export function stripJsonMarkdown(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .replace(/^json\s*(?=[{[])/i, '')
    .trim();
}

export function parseGeneratedPage(raw: string): WhitelabelGeneratedPage {
  const parsed = parseJsonPayload<WhitelabelGeneratedPage>(raw, 'pagina');
  if (!parsed.page || !parsed.sections) {
    throw new BadRequestException(
      'Resposta da IA sem os campos obrigatorios page/sections.',
    );
  }
  return parsed;
}

export function parseGeneratedShell(raw: string): {
  page: WhitelabelGeneratedPage['page'];
  intro: unknown;
} {
  const parsed = parseJsonPayload<{
    page?: WhitelabelGeneratedPage['page'];
    intro?: unknown;
  }>(raw, 'base da pagina');

  if (!parsed.page || !parsed.intro) {
    throw new BadRequestException(
      'Resposta da IA sem os campos obrigatorios page/intro.',
    );
  }

  return { page: parsed.page, intro: parsed.intro };
}

export function parseGeneratedModuleBlocks(
  raw: string,
  moduleTitle: string,
): Array<Record<string, unknown>> {
  const parsed = parseJsonPayload<unknown>(raw, moduleTitle);
  const blocks = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? ((parsed as Record<string, unknown>).blocks ??
        (parsed as Record<string, unknown>).items)
      : null;

  if (!Array.isArray(blocks)) {
    throw new BadRequestException(
      `Resposta da IA para ${moduleTitle} nao e um array de blocos.`,
    );
  }

  return blocks.filter(
    (block): block is Record<string, unknown> =>
      Boolean(block) && typeof block === 'object' && !Array.isArray(block),
  );
}

function parseJsonPayload<T>(raw: string, label: string): T {
  const cleaned = extractJsonPayload(stripJsonMarkdown(raw));
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new BadRequestException(
      `A IA retornou JSON invalido para ${label}. Trecho recebido: ${cleaned.slice(0, 500)}`,
    );
  }
}

function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;

  const firstArray = trimmed.indexOf('[');
  const lastArray = trimmed.lastIndexOf(']');
  const firstObject = trimmed.indexOf('{');
  const lastObject = trimmed.lastIndexOf('}');

  if (
    firstArray >= 0 &&
    lastArray > firstArray &&
    (firstObject < 0 || firstArray < firstObject)
  ) {
    return trimmed.slice(firstArray, lastArray + 1);
  }

  if (firstObject >= 0 && lastObject > firstObject) {
    return trimmed.slice(firstObject, lastObject + 1);
  }

  return trimmed;
}

export function generatedToContentJson(
  page: WhitelabelGeneratedPage,
  options: { tolerant?: boolean } = {},
): WhitelabelContentJson {
  const intro = (page.sections.intro ?? {}) as {
    topbar?: { left?: string[] };
    hero?: Record<string, unknown>;
    form?: Record<string, unknown>;
  };

  const articleBlocks: Array<Record<string, unknown>> = [];
  const legacyFaqs = getLegacyFaqs(page.sections);
  const missing: string[] = [];

  for (const key of WHITELABEL_ARTICLE_SECTION_KEYS) {
    const section = page.sections[key];
    if (!section) {
      if (key === 'modulo_13_perguntas_frequentes' && legacyFaqs.length > 0) {
        articleBlocks.push(...buildFaqModuleFromLegacy(legacyFaqs));
        continue;
      }
      missing.push(key);
      continue;
    }

    const blocks = normalizeModuleBlocks(key, section, options.tolerant);
    if (key === 'modulo_13_perguntas_frequentes') {
      const withFaq = ensureFaqListInModule(
        blocks,
        legacyFaqs,
        options.tolerant,
      );
      articleBlocks.push(...withFaq);
      continue;
    }
    articleBlocks.push(...blocks);
  }

  if (missing.length > 0 && !options.tolerant) {
    throw new BadRequestException(
      `Resposta whitelabel sem os modulos obrigatorios: ${missing.join(', ')}. Regenerar com a blueprint de 15 modulos.`,
    );
  }

  if (!options.tolerant) validateUnexpectedLegacySections(page.sections);
  const faqs = extractFaqsFromArticleBlocks(articleBlocks);

  return normalizeWhitelabelContentLinks({
    topbar: intro.topbar,
    hero: intro.hero,
    form: intro.form,
    article: { blocks: articleBlocks },
    // Mirror for FAQPage schema only. Visual order is controlled by article.blocks.
    faqs,
  });
}

function normalizeModuleBlocks(
  key: string,
  section: unknown,
  tolerant = false,
): Array<Record<string, unknown>> {
  const blocks = Array.isArray(section)
    ? [...(section as Array<Record<string, unknown>>)]
    : typeof section === 'object' && section
      ? [section as Record<string, unknown>]
      : [];

  const expectedTitle = WHITELABEL_MODULE_DISPLAY_TITLE_BY_KEY.get(key);
  if (!expectedTitle) return blocks;

  const first = blocks[0];
  const hasOpeningHeading =
    first?.type === 'heading' && typeof first.text === 'string';

  if (hasOpeningHeading) {
    return validateVisibleModuleBlocks(key, [
      {
        ...first,
        level: normalizeHeadingLevel(first.level, 2),
        text: cleanVisibleModuleTitle(String(first.text), expectedTitle),
      },
      ...blocks.slice(1).map(cleanVisibleModuleText),
    ], tolerant);
  }

  return validateVisibleModuleBlocks(key, [
    { type: 'heading', level: 2, text: expectedTitle },
    ...blocks
      .filter((block) => block && typeof block === 'object')
      .map(cleanVisibleModuleText),
  ], tolerant);
}

function validateVisibleModuleBlocks(
  key: string,
  blocks: Array<Record<string, unknown>>,
  tolerant = false,
): Array<Record<string, unknown>> {
  if (key === 'modulo_13_perguntas_frequentes') return blocks;

  const hasFaqList = blocks.some((block) => block.type === 'faq_list');
  const headingTexts = blocks
    .filter((block) =>
      ['heading', 'subheading', 'minor_heading'].includes(
        typeof block.type === 'string' ? block.type : '',
      ),
    )
    .map((block) => {
      if (typeof block.text === 'string') return block.text.trim();
      if (typeof block.title === 'string') return block.title.trim();
      return '';
    })
    .filter(Boolean);
  const hasFaqHeading = headingTexts.some((text) =>
    /perguntas\s+frequentes|faq/i.test(text),
  );
  if ((hasFaqList || hasFaqHeading) && !tolerant) {
    throw new BadRequestException(
      `FAQ detectado fora do Modulo 13 na secao ${key}. Regere o template para manter a ordem dos 15 modulos.`,
    );
  }

  return blocks;
}

function cleanVisibleModuleText(
  block: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof block.text === 'string') {
    return {
      ...block,
      text: stripModulePrefix(block.text),
    };
  }

  if (typeof block.title === 'string') {
    return {
      ...block,
      title: stripModulePrefix(block.title),
    };
  }

  return block;
}

function cleanVisibleModuleTitle(value: string, fallback: string): string {
  const cleaned = stripModulePrefix(value).trim();
  return cleaned || fallback;
}

function stripModulePrefix(value: string): string {
  return value
    .replace(/^\s*m[oó]dulo\s+\d+\s*[-–—:|]\s*/i, '')
    .replace(/^\s*module\s+\d+\s*[-–—:|]\s*/i, '')
    .trim();
}

function normalizeHeadingLevel(value: unknown, fallback: number): number {
  const level = Number(value);
  return [2, 3, 4].includes(level) ? level : fallback;
}

function getLegacyFaqs(
  sections: WhitelabelGeneratedPage['sections'],
): Array<{ question: string; answer: string }> {
  const legacySection = (sections as Record<string, unknown>)
    .perguntas_frequentes;
  return Array.isArray(legacySection) ? legacySection.filter(isFaqItem) : [];
}

function ensureFaqListInModule(
  blocks: Array<Record<string, unknown>>,
  legacyFaqs: Array<{ question: string; answer: string }>,
  tolerant = false,
): Array<Record<string, unknown>> {
  if (blocks.some(isFaqListBlock)) return blocks;
  const inlineFaqs = blocks.filter(isFaqItem);
  const items = inlineFaqs.length > 0 ? inlineFaqs : legacyFaqs;

  if (items.length === 0) {
    if (tolerant) return blocks;
    throw new BadRequestException(
      'Modulo 13 recebido sem bloco faq_list e sem perguntas validas. O FAQ deve ficar dentro de article.blocks na posicao do Modulo 13.',
    );
  }

  return [
    ...blocks.filter((block) => !isFaqItem(block)),
    {
      type: 'faq_list',
      hide_title: true,
      items,
    },
  ];
}

function buildFaqModuleFromLegacy(
  items: Array<{ question: string; answer: string }>,
): Array<Record<string, unknown>> {
  return [
    {
      type: 'heading',
      level: 2,
      text: 'Perguntas Frequentes',
    },
    {
      type: 'faq_list',
      hide_title: true,
      items,
    },
  ];
}

function validateUnexpectedLegacySections(
  sections: WhitelabelGeneratedPage['sections'],
): void {
  const unexpected = Object.keys(sections).filter(
    (key) =>
      !WHITELABEL_SECTION_KEYS.includes(
        key as (typeof WHITELABEL_SECTION_KEYS)[number],
      ) && key !== 'perguntas_frequentes',
  );

  if (unexpected.length > 0) {
    throw new BadRequestException(
      `Resposta whitelabel trouxe secoes fora da blueprint de 15 modulos: ${unexpected.join(', ')}. Isto pode deslocar blocos visualmente; regenerar com o contrato novo.`,
    );
  }
}

function extractFaqsFromArticleBlocks(
  blocks: Array<Record<string, unknown>>,
): Array<{ question: string; answer: string }> {
  return blocks
    .filter(isFaqListBlock)
    .flatMap((block) => block.items)
    .filter(isFaqItem);
}

export function extractSectionMap(
  page: WhitelabelGeneratedPage,
): Map<SectionKey, unknown> {
  const result = new Map<SectionKey, unknown>();
  for (const key of WHITELABEL_SECTION_KEYS) {
    const section = page.sections[key];
    if (section !== undefined) result.set(key, section);
  }
  return result;
}

export function replaceInJson(
  value: unknown,
  from: string,
  to: string,
): unknown {
  if (!from) return value;
  if (typeof value === 'string') {
    return value.replace(new RegExp(escapeRegExp(from), 'g'), to);
  }
  if (Array.isArray(value)) {
    const replacedItems: unknown[] = value.map((item) =>
      replaceInJson(item, from, to),
    );
    return replacedItems;
  }
  if (value && typeof value === 'object') {
    const replacedObject = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        replaceInJson(item, from, to),
      ]),
    );
    return replacedObject;
  }
  return value;
}

export function removeMainPageGeoPlaceholders(value: unknown): unknown {
  if (typeof value === 'string') {
    return cleanMainPageText(value);
  }
  if (Array.isArray(value)) {
    const cleanedItems: unknown[] = value.map((item) =>
      removeMainPageGeoPlaceholders(item),
    );
    return cleanedItems;
  }
  if (value && typeof value === 'object') {
    const cleanedObject = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        removeMainPageGeoPlaceholders(item),
      ]),
    );
    return cleanedObject;
  }
  return value;
}

function cleanMainPageText(value: string): string {
  return value
    .replace(/\s+em\s+\[Nome da Cidade\]/gi, '')
    .replace(/\s+em\s+\{\{CITY\}\}/gi, '')
    .replace(/\s+em\s+\{CITY\}/gi, '')
    .replace(/\s+em\s+\[Cidade\]/gi, '')
    .replace(/\s+em\s+e arredores/gi, '')
    .replace(/\[Nome da Cidade\]/gi, '')
    .replace(/\{\{CITY\}\}/gi, '')
    .replace(/\{CITY\}/gi, '')
    .replace(/\[Cidade\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function countTextWords(value: unknown): number {
  if (typeof value === 'string') {
    return (
      value.match(/[\p{L}\p{N}]+(?:[.'\u2019-][\p{L}\p{N}]+)*/gu)?.length ?? 0
    );
  }
  if (Array.isArray(value)) {
    const items: unknown[] = value;
    return items.reduce<number>(
      (total, item) => total + countTextWords(item),
      0,
    );
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (total, item) => total + countTextWords(item),
      0,
    );
  }
  return 0;
}

export function buildExternalSlug(service: string, city?: string): string {
  return slugify(city ? `${service} em ${city}` : service);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

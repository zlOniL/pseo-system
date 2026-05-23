import { BadRequestException } from '@nestjs/common';
import { slugify } from '../../common/slug';
import {
  SECTION_KEYS,
  SectionKey,
} from '../../service-templates/service-templates.types';
import {
  WhitelabelContentJson,
  WhitelabelGeneratedPage,
} from './whitelabel.types';

const ARTICLE_SECTION_KEYS = SECTION_KEYS.filter(
  (key) => key !== 'intro' && key !== 'perguntas_frequentes',
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

export function stripJsonMarkdown(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .replace(/^json\s*(?=[{[])/i, '')
    .trim();
}

export function parseGeneratedPage(raw: string): WhitelabelGeneratedPage {
  const cleaned = extractJsonPayload(stripJsonMarkdown(raw));
  let parsed: WhitelabelGeneratedPage;
  try {
    parsed = JSON.parse(cleaned) as WhitelabelGeneratedPage;
  } catch {
    throw new BadRequestException(
      `A IA retornou JSON invalido para a integracao whitelabel. Trecho recebido: ${cleaned.slice(0, 500)}`,
    );
  }
  if (!parsed.page || !parsed.sections) {
    throw new BadRequestException(
      'Resposta da IA sem os campos obrigatorios page/sections.',
    );
  }
  return parsed;
}

function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

export function generatedToContentJson(
  page: WhitelabelGeneratedPage,
): WhitelabelContentJson {
  const intro = (page.sections.intro ?? {}) as {
    topbar?: { left?: string[] };
    hero?: Record<string, unknown>;
    form?: Record<string, unknown>;
  };

  const articleBlocks: Array<Record<string, unknown>> = [];
  for (const key of ARTICLE_SECTION_KEYS) {
    const section = page.sections[key];
    if (!section) continue;
    if (Array.isArray(section)) {
      articleBlocks.push(...(section as Array<Record<string, unknown>>));
    } else if (typeof section === 'object') {
      articleBlocks.push(section as Record<string, unknown>);
    }
  }

  const faqsSection = page.sections.perguntas_frequentes;
  const faqs = Array.isArray(faqsSection) ? faqsSection.filter(isFaqItem) : [];

  return {
    topbar: intro.topbar,
    hero: intro.hero,
    form: intro.form,
    article: { blocks: articleBlocks },
    faqs,
  };
}

export function extractSectionMap(
  page: WhitelabelGeneratedPage,
): Map<SectionKey, unknown> {
  const result = new Map<SectionKey, unknown>();
  for (const key of SECTION_KEYS) {
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
    return value.match(/[\p{L}\p{N}]+(?:[.'’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
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

import { BadRequestException } from '@nestjs/common';
import { SECTION_KEYS, SectionKey } from './service-templates.types';
import { stripLocalityBacklinksSection } from '../common/locality-backlinks-stripper';
import { parse } from 'node-html-parser';

const H2_MAP: Array<[RegExp, SectionKey | 'atendemos_tambem']> = [
  [/Assist[eê]ncia Especializada/i, 'assistencia_especializada'],
  [/Tipos de/i, 'tipos'],
  [/Servi[cç]os Realizados/i, 'servicos'],
  [/Integra[cç][aã]o/i, 'integracao_servicos'],
  [/Servi[cç]os de /i, 'servicos'],
  [/Principais Problemas/i, 'avarias_comuns'],
  [/Avarias Comuns/i, 'avarias_comuns'],
  [/Como Funciona/i, 'como_funciona'],
  [/24H\/7/i, 'servico_24h'],
  [/Manuten[cç][aã]o.*Preven/i, 'prevencao'],
  [/Preven[cç][aã]o/i, 'prevencao'],
  [/Reparar ou Substituir/i, 'reparar_ou_substituir'],
  [/Por Que Escolher/i, 'por_que_escolher'],
  [/Zonas de Atendimento/i, 'contexto_local'],
  [/Contexto Local/i, 'contexto_local'],
  [/Perguntas Frequentes/i, 'perguntas_frequentes'],
  [/Contacte a Empresa/i, 'contacte_empresa'],
  [/Mais sobre/i, 'mais_sobre'],
  [/Atendemos/i, 'atendemos_tambem'],
];

function classifyH2(h2Text: string): SectionKey | 'atendemos_tambem' | null {
  for (const [pattern, key] of H2_MAP) {
    if (pattern.test(h2Text)) return key;
  }
  return null;
}

/** Normalises injected <img> blocks back to {{IMAGE_N}} placeholders. */
function normaliseImages(html: string): string {
  let counter = 0;
  return html.replace(
    /\n?<hr\s*\/?>\n<img[^>]+>\n<hr\s*\/?>\n?/gi,
    () => `{{IMAGE_${++counter}}}`,
  );
}

export function stripHtmlDocumentShell(html: string): string {
  if (
    !/<!doctype\b|<\s*\/?\s*(html|head|body|nav|footer|script|meta|title)\b/i.test(
      html,
    )
  )
    return html;

  const root = parse(html.replace(/<!doctype\b[^>]*>/gi, ''), {
    comment: true,
  });
  const container =
    root.querySelector('body') ?? root.querySelector('html') ?? root;
  for (const tag of ['head', 'nav', 'footer', 'script', 'meta', 'title'])
    for (const element of container.getElementsByTagName(tag)) element.remove();
  return container.innerHTML;
}

export interface ParsedSections {
  sections: Map<SectionKey, string>;
  imageCount: number;
}

function countWords(value: string): number {
  return value.match(/[\p{L}\p{N}]+(?:[.'’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function sectionsFromMarkers(html: string): Map<SectionKey, string> {
  const sections = new Map<SectionKey, string>();
  const marker =
    /<!--\s*BIB_SECTION:([a-z0-9_/-]+)\s*-->([\s\S]*?)<!--\s*\/BIB_SECTION:\1\s*-->/gi;
  for (const match of html.matchAll(marker)) {
    const key = match[1] as SectionKey;
    if ((SECTION_KEYS as readonly string[]).includes(key))
      sections.set(key, match[2].trim());
  }
  return sections;
}

function sectionsFromHeadings(html: string): Map<SectionKey, string> {
  const root = parse(html, { comment: true });
  const content = root.querySelector('.pseo-content')?.innerHTML ?? html;
  const parts = content.split(/(?=<h2\b)/i);
  const sections = new Map<SectionKey, string>();
  let current: SectionKey | null = 'intro';

  for (const part of parts) {
    const h2Match = part.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    if (h2Match) {
      const h2Text = h2Match[1].replace(/<[^>]+>/g, '').trim();
      const key = classifyH2(h2Text);
      if (key === 'atendemos_tambem') {
        current = null;
        continue;
      }
      if (key && (SECTION_KEYS as readonly string[]).includes(key))
        current = key as SectionKey;
    }
    if (!current || !part.trim()) continue;
    sections.set(current, `${sections.get(current) ?? ''}${part}`.trim());
  }
  return sections;
}

/**
 * Extracts marked sections first, then falls back to known H2 headings.
 * Returns only sections present in SECTION_KEYS (excludes atendemos_tambem).
 * Image blocks are normalised to {{IMAGE_N}} placeholders.
 */
export function parseHtmlSections(html: string): ParsedSections {
  const normalised = normaliseImages(
    stripHtmlDocumentShell(stripLocalityBacklinksSection(html)),
  );
  const marked = sectionsFromMarkers(normalised);
  const sections = SECTION_KEYS.every((key) => marked.has(key))
    ? marked
    : sectionsFromHeadings(normalised);
  const imageCount = [...sections.values()].reduce(
    (total, section) =>
      total + (section.match(/\{\{IMAGE_\d+\}\}/g)?.length ?? 0),
    0,
  );

  return { sections, imageCount };
}

export function validateExtractedSections(
  sections: Map<SectionKey, string>,
): void {
  const missing = SECTION_KEYS.filter((key) => !sections.has(key));
  if (missing.length)
    throw new BadRequestException(
      `Secções não extraídas: ${missing.join(', ')}.`,
    );

  const intro = parse(sections.get('intro') ?? '');
  intro
    .querySelectorAll('h1, h2, h3, h4, h5, h6')
    .forEach((heading) => heading.remove());
  const introWords = countWords(intro.text);
  if (introWords === 0)
    throw new BadRequestException(
      'Introdução incompleta: não há texto além do título.',
    );

  for (const key of SECTION_KEYS.filter(
    (sectionKey) => sectionKey !== 'intro',
  )) {
    const section = parse(sections.get(key) ?? '');
    section
      .querySelectorAll('h1, h2, h3, h4, h5, h6')
      .forEach((heading) => heading.remove());
    if (countWords(section.text) === 0)
      throw new BadRequestException(`Secção sem conteúdo textual: ${key}.`);
  }
}

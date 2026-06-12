import { SECTION_KEYS, SectionKey } from './service-templates.types';

const EXCLUDED_KEYS = new Set(['atendemos_tambem']);

const H2_MAP: Array<[RegExp, SectionKey | 'atendemos_tambem']> = [
  [/Assist[eê]ncia Especializada/i, 'assistencia_especializada'],
  [/Tipos de/i, 'tipos'],
  [/Servi[cç]os Realizados/i, 'servicos'],
  [/Servi[cç]os de /i, 'servicos'],
  [/Principais Problemas/i, 'avarias_comuns'],
  [/Avarias Comuns/i, 'avarias_comuns'],
  [/Como Funciona/i, 'como_funciona'],
  [/24H\/7/i, 'servico_24h'],
  [/Manuten[cç][aã]o.*Preven/i, 'prevencao'],
  [/Preven[cç][aã]o/i, 'prevencao'],
  [/Reparar ou Substituir/i, 'reparar_ou_substituir'],
  [/Por Que Escolher/i, 'por_que_escolher'],
  [/Integra[cç][aã]o/i, 'integracao_servicos'],
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

export interface ParsedSections {
  sections: Map<SectionKey, string>;
  imageCount: number;
}

/**
 * Splits a fully-processed HTML page into named sections delimited by H2 tags.
 * Returns only sections present in SECTION_KEYS (excludes atendemos_tambem).
 * Image blocks are normalised to {{IMAGE_N}} placeholders.
 */
export function parseHtmlSections(html: string): ParsedSections {
  const normalised = normaliseImages(html);
  const parts = normalised.split(/(?=<h2[\s>])/i);

  const sections = new Map<SectionKey, string>();
  let imageCounter = 0;

  if (parts[0] && parts[0].trim()) {
    sections.set('intro', parts[0].trim());
    const matches = parts[0].match(/\{\{IMAGE_\d+\}\}/g);
    if (matches) imageCounter += matches.length;
  }

  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const h2Match = chunk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    if (!h2Match) continue;

    const h2Text = h2Match[1].replace(/<[^>]+>/g, '').trim();
    const key = classifyH2(h2Text);

    if (!key || EXCLUDED_KEYS.has(key)) continue;
    if (!(SECTION_KEYS as readonly string[]).includes(key)) continue;

    sections.set(key as SectionKey, chunk.trim());
    const matches = chunk.match(/\{\{IMAGE_\d+\}\}/g);
    if (matches) imageCounter += matches.length;
  }

  return { sections, imageCount: imageCounter };
}

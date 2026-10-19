import { createHash } from 'node:crypto';
import { parse, NodeType, TextNode } from 'node-html-parser';

export interface HybridSlot {
  id: string;
  kind: 'text' | 'link';
  value: string;
}
export interface HybridConfig {
  revision: 1;
  source_hash: string;
  strategy: 'generic' | 'local';
  reason: string;
  values: Record<string, string>;
}

export function sourceHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const escapeText = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Only text, accessible labels and HTTP anchor destinations are editable.
 * Tags, CSS, media, JSON keys, block types and hierarchy never go through AI.
 */
export function slotDocument(
  value: unknown,
  format: 'html' | 'whitelabel_json',
) {
  const slots: HybridSlot[] = [];
  let replacements: Record<string, string> | undefined;
  let index = 0;
  const slot = (text: string, kind: HybridSlot['kind'] = 'text') => {
    if (!text.trim() || /^\{\{IMAGE_\d+\}\}$/.test(text.trim())) return text;
    const id = `s${index++}`;
    if (!replacements) slots.push({ id, kind, value: text });
    return replacements?.[id] ?? text;
  };
  const html = (text: string) => {
    const root = parse(text, { comment: true });
    const walk = (node: typeof root) => {
      if (['SCRIPT', 'STYLE'].includes(node.tagName)) return;
      if (node.tagName === 'A') {
        const href = node.getAttribute('href');
        if (
          href &&
          /^https?:\/\//i.test(href) &&
          !/^https?:\/\/(?:wa\.me|(?:api|web)\.whatsapp\.com)(?:\/|$)/i.test(
            href,
          )
        )
          node.setAttribute('href', slot(href, 'link'));
      }
      for (const attr of ['alt', 'title', 'aria-label']) {
        const val = node.getAttribute(attr);
        if (val) node.setAttribute(attr, slot(val));
      }
      for (const child of [...node.childNodes]) {
        if (child.nodeType === NodeType.TEXT_NODE) {
          const original = child.text;
          const updated = slot(original);
          if (updated !== original)
            (child as TextNode).rawText = escapeText(
              (original.match(/^\s*/)?.[0] ?? '') +
                updated.trim() +
                (original.match(/\s*$/)?.[0] ?? ''),
            );
        } else if (child.nodeType === NodeType.ELEMENT_NODE)
          walk(child as typeof root);
      }
    };
    walk(root);
    return root.toString();
  };
  const json = (item: unknown, key = ''): unknown => {
    if (typeof item === 'string') {
      if (
        /^(type|id|class|className|style|icon|src|image|image_url|video_url)$/i.test(
          key,
        )
      )
        return item;
      if (/^https?:\/\//i.test(item))
        return /^(href|url|link)$/i.test(key) ? slot(item, 'link') : item;
      return item.includes('<') ? html(item) : slot(item);
    }
    if (Array.isArray(item)) return item.map((entry) => json(entry, key));
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item).map(([k, v]) => [k, json(v, k)]),
      );
    return item;
  };
  const run = () =>
    format === 'html'
      ? html(typeof value === 'string' ? value : '')
      : json(value);
  run();
  return {
    slots,
    render(values: Record<string, string>) {
      replacements = values;
      index = 0;
      return run();
    },
  };
}

export function validateSlotValues(
  slots: HybridSlot[],
  values: unknown,
): asserts values is Record<string, string> {
  if (!values || typeof values !== 'object' || Array.isArray(values))
    throw new Error('Resposta sem textos das secções.');
  const map = values as Record<string, unknown>;
  if (
    Object.keys(map).length !== slots.length ||
    slots.some(
      (s) => typeof map[s.id] !== 'string' || !(map[s.id] as string).trim(),
    )
  ) {
    throw new Error('A IA devolveu campos em falta ou desconhecidos.');
  }
  for (const s of slots) {
    const value = map[s.id] as string;
    if (s.kind === 'text' && /<\/?[a-z][^>]*>/i.test(value))
      throw new Error('A IA inseriu HTML num campo de texto.');
    const tokens = (s.value.match(/\{\{IMAGE_\d+\}\}/g) ?? []).sort();
    if (
      JSON.stringify(tokens) !==
      JSON.stringify((value.match(/\{\{IMAGE_\d+\}\}/g) ?? []).sort())
    )
      throw new Error('A IA alterou placeholders de imagem.');
  }
}

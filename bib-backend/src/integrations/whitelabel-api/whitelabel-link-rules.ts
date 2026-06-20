import type { WhitelabelContentJson } from './whitelabel.types';

export const WHITELABEL_INLINE_LINK_RULES = `Regras para links inline na API Whitelabel:
- Podes inserir links no meio do texto usando apenas HTML simples.
- Formato obrigatorio para links externos: <a href="https://exemplo.pt/pagina" target="_blank" rel="noopener">texto ancora</a>.
- Para links internos do proprio site, usa href absoluto ou caminho publico, por exemplo <a href="/picheleiros">picheleiros 24 horas</a>.
- Usa links apenas nestes campos: content_json.hero.intro; article.blocks[].text quando type="paragraph"; article.blocks[].text quando type="callout"; article.blocks[].items[] quando type="list"; article.blocks[].items[].answer quando type="faq_list"; content_json.faqs[].answer.
- Nao uses HTML nem links em headings/H2/H3/H4, hero.bullets, perguntas de FAQ, title, seo_title, seo_description, home_card_title, home_card_excerpt, textos de botoes ou labels.
- O link deve ficar natural dentro da frase e o texto ancora deve descrever o destino.
- Nao inserir links em excesso: usa poucos backlinks relevantes, naturais e distribuidos.
- Nao inventes URLs. Usa URLs reais e verificaveis, preferencialmente oficiais.
- Usa apenas tags simples como <a> e, quando fizer sentido, <strong>. Nao uses HTML complexo.`;

export function normalizeWhitelabelContentLinks(
  contentJson: WhitelabelContentJson,
): WhitelabelContentJson {
  const hero = normalizeHero(contentJson.hero);
  const articleBlocks = contentJson.article.blocks.map(normalizeArticleBlock);
  const faqs = contentJson.faqs?.map((faq) => ({
    question: stripInlineHtml(faq.question),
    answer: normalizeAllowedInlineHtml(faq.answer),
  }));

  return {
    topbar: stripHtmlDeep(contentJson.topbar) as WhitelabelContentJson['topbar'],
    hero,
    form: stripHtmlDeep(contentJson.form) as WhitelabelContentJson['form'],
    article: { blocks: articleBlocks },
    ...(faqs ? { faqs } : {}),
  };
}

function normalizeHero(
  hero: WhitelabelContentJson['hero'],
): WhitelabelContentJson['hero'] {
  if (!hero) return hero;

  return Object.fromEntries(
    Object.entries(hero).map(([key, value]) => [
      key,
      key === 'intro' && typeof value === 'string'
        ? normalizeAllowedInlineHtml(value)
        : stripHtmlDeep(value),
    ]),
  );
}

function normalizeArticleBlock(
  block: Record<string, unknown>,
): Record<string, unknown> {
  const type = String(block.type ?? '');
  const normalized = Object.fromEntries(
    Object.entries(block).map(([key, value]) => [key, stripHtmlDeep(value)]),
  );

  if (
    (type === 'paragraph' || type === 'callout') &&
    typeof block.text === 'string'
  ) {
    normalized.text = normalizeAllowedInlineHtml(block.text);
  }

  if (type === 'list' && Array.isArray(block.items)) {
    normalized.items = block.items.map((item) =>
      typeof item === 'string'
        ? normalizeAllowedInlineHtml(item)
        : stripHtmlDeep(item),
    );
  }

  if (type === 'faq_list' && Array.isArray(block.items)) {
    normalized.items = block.items.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return stripHtmlDeep(item);
      }

      const faqItem = item as Record<string, unknown>;
      const strippedFaqItem = stripHtmlDeep(faqItem) as Record<string, unknown>;
      return {
        ...strippedFaqItem,
        question:
          typeof faqItem.question === 'string'
            ? stripInlineHtml(faqItem.question)
            : faqItem.question,
        answer:
          typeof faqItem.answer === 'string'
            ? normalizeAllowedInlineHtml(faqItem.answer)
            : faqItem.answer,
      };
    });
  }

  return normalized;
}

function stripHtmlDeep(value: unknown): unknown {
  if (typeof value === 'string') return stripInlineHtml(value);
  if (Array.isArray(value)) return value.map(stripHtmlDeep);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      stripHtmlDeep(item),
    ]),
  );
}

function stripInlineHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/\s{2,}/g, ' ').trim();
}

function normalizeAllowedInlineHtml(value: string): string {
  return value
    .replace(/<(?!\/?(?:a|strong)\b)[^>]+>/gi, '')
    .replace(/<strong\b[^>]*>/gi, '<strong>')
    .replace(/<\/strong>/gi, '</strong>')
    .replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
      const href = getAttribute(attrs, 'href');
      if (!href || !isAllowedHref(href)) return '';

      const safeHref = escapeHtmlAttribute(href);
      if (/^https?:\/\//i.test(href)) {
        return `<a href="${safeHref}" target="_blank" rel="noopener">`;
      }

      return `<a href="${safeHref}">`;
    })
    .replace(/<\/a>/gi, '</a>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function getAttribute(attrs: string, name: string): string | null {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = attrs.match(pattern);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function isAllowedHref(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('/');
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

import { parse } from 'node-html-parser';
import {
  buildLocalityLinks,
  withLocalityLinksHtml,
  withLocalityLinksJson,
} from './locality-links';
import { stripLocalityBacklinksSection } from './locality-backlinks-stripper';
import { parseHtmlSections } from '../service-templates/html-section-parser';

const links = buildLocalityLinks(
  ['Lisboa', 'Porto', 'Amadora'],
  'Reparação de Janelas',
  'https://example.pt/',
);

describe('dynamic locality links', () => {
  it('uses the same prepositions and slugs as published pages, deduplicating destinations', () => {
    expect(links.map((link) => link.url)).toEqual([
      'https://example.pt/reparacao-de-janelas-em-lisboa/',
      'https://example.pt/reparacao-de-janelas-no-porto/',
      'https://example.pt/reparacao-de-janelas-na-amadora/',
    ]);
    expect(
      buildLocalityLinks(
        ['Lisboa', ' lisboa ', ''],
        'Janelas',
        'https://example.pt',
      ),
    ).toHaveLength(1);
  });

  it('inserts outside editable markers and remains identical when refreshed twice', () => {
    const local =
      '<!-- BIB_SECTION:contexto_local --><h2>Contexto Local</h2><p>Texto local</p><!-- /BIB_SECTION:contexto_local -->';
    const faq =
      '<!-- BIB_SECTION:perguntas_frequentes --><h2>Perguntas Frequentes</h2><p>Resposta</p><!-- /BIB_SECTION:perguntas_frequentes -->';
    const result = withLocalityLinksHtml(`<main>${local}${faq}</main>`, links);
    expect(result).toContain(local);
    expect(result).toContain(faq);
    expect(result.indexOf('data-bib-locality-links')).toBeGreaterThan(
      result.indexOf('/BIB_SECTION:contexto_local'),
    );
    expect(result.indexOf('data-bib-locality-links')).toBeLessThan(
      result.indexOf('<!-- BIB_SECTION:perguntas'),
    );
    expect(withLocalityLinksHtml(result, links)).toBe(result);
    const { sections } = parseHtmlSections(result);
    for (const value of sections.values())
      expect(value).not.toContain('data-bib-locality-links');
  });

  it.each([
    '<main><h1>Janelas</h1><h2>Também Atendemos</h2><ul><li>Velho</li></ul></main>',
    '<main><h1>Janelas</h1><section><h2>Cidades Onde Atendemos</h2><div><ul><li>Velho</li></ul></div></section></main>',
    '<main><h1>Janelas</h1><div id="dynamic-neighborhood-links"></div></main>',
  ])('preserves outer wrappers when replacing legacy HTML: %s', (html) => {
    const result = withLocalityLinksHtml(html, links);
    const root = parse(result);
    expect(root.querySelectorAll('main')).toHaveLength(1);
    expect(root.querySelectorAll('[data-bib-locality-links]')).toHaveLength(1);
    expect(root.querySelector('main [data-bib-locality-links]')).not.toBeNull();
    expect(result).not.toContain('Velho');
    expect(result.endsWith('</main>')).toBe(true);
    expect(withLocalityLinksHtml(result, links)).toBe(result);
  });

  it('preserves following section markers when stripping an unwrapped legacy block', () => {
    const next =
      '<!-- BIB_SECTION:perguntas_frequentes --><h2>Perguntas Frequentes</h2><p>FAQ</p><!-- /BIB_SECTION:perguntas_frequentes -->';
    expect(
      stripLocalityBacklinksSection(
        `<div><h2>Também Atendemos</h2><ul><li>Velho</li></ul>${next}</div>`,
      ),
    ).toBe(`<div>${next}</div>`);
  });

  it('does not render an empty heading and escapes labels', () => {
    expect(withLocalityLinksHtml('<h1>Teste</h1>', [])).toBe('<h1>Teste</h1>');
    const result = withLocalityLinksHtml('<h1>Teste</h1>', [
      { label: 'A < B & "C"', url: 'https://site.pt/?a=1&b=2' },
    ]);
    expect(result).toContain('A &lt; B &amp; &quot;C&quot;');
    expect(result).toContain('?a=1&amp;b=2');
  });

  it('keeps whitelabel FAQ order, shell and schema while replacing old destinations', () => {
    const faq = {
      type: 'faq_list',
      hide_title: true,
      items: [{ question: 'Como?', answer: 'Assim.' }],
    };
    const original = {
      hero: { h1: 'Janelas' },
      faqs: [{ question: 'Como?', answer: 'Assim.' }],
      article: {
        blocks: [
          { type: 'heading', level: 2, text: 'Contexto Local' },
          { type: 'paragraph', text: 'Original' },
          { type: 'heading', level: 2, text: 'Perguntas Frequentes' },
          faq,
        ],
      },
    };
    const result = withLocalityLinksJson(original, links);
    expect(result.hero).toBe(original.hero);
    expect(result.faqs).toBe(original.faqs);
    expect(result.article.blocks[2]).toEqual({
      type: 'heading',
      level: 2,
      text: 'Também atendemos',
    });
    expect(result.article.blocks.at(-1)).toBe(faq);
    expect(withLocalityLinksJson(result, links)).toEqual(result);
    expect(withLocalityLinksJson(result, [])).toEqual(original);
    expect(
      withLocalityLinksJson(result, links.slice(0, 1)).article.blocks[3].items,
    ).toHaveLength(1);
  });
  it('preserves a FAQ list with no preceding heading in tolerant JSON', () => {
    const faq = {
      type: 'faq_list',
      items: [{ question: 'Como?', answer: 'Assim.' }],
    };
    const result = withLocalityLinksJson({ article: { blocks: [faq] } }, links);
    expect(withLocalityLinksJson(result, links)).toEqual(result);
    expect(result.article.blocks.at(-1)).toBe(faq);
  });
});

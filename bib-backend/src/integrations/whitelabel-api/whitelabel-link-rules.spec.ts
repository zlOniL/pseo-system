import { normalizeWhitelabelContentLinks } from './whitelabel-link-rules';
import { WhitelabelContentJson } from './whitelabel.types';

describe('normalizeWhitelabelContentLinks', () => {
  it('keeps simple links only in API-supported text fields', () => {
    const contentJson: WhitelabelContentJson = {
      topbar: { left: ['<a href="https://example.pt">topo</a>'] },
      hero: {
        h1: '<a href="https://example.pt">Titulo</a>',
        intro:
          'Veja <a href="https://example.pt/recurso">este recurso especializado</a> e <strong>confirme</strong> detalhes.',
        bullets: ['<a href="/picheleiros">picheleiros</a>'],
        cta_label: '<strong>Pedir assistencia</strong>',
      },
      form: {
        title: '<a href="https://example.pt/form">Formulario</a>',
      },
      article: {
        blocks: [
          {
            type: 'heading',
            text: '<a href="https://example.pt/h2">Assistencia</a>',
          },
          {
            type: 'paragraph',
            text: 'Consulte <a href="https://example.pt/pagina">a pagina oficial</a> e ignore <a href="javascript:alert(1)">atalhos invalidos</a>.',
          },
          {
            type: 'callout',
            text: 'Leia tambem <a href="/picheleiros">picheleiros 24 horas</a>.',
          },
          {
            type: 'list',
            items: [
              'Confirmar <a href="https://example.pt/check">checklist tecnica</a>',
            ],
          },
          {
            type: 'faq_list',
            items: [
              {
                question: '<a href="https://example.pt/q">Pergunta?</a>',
                answer:
                  'Resposta com <a href="https://example.pt/a">fonte oficial</a>.',
              },
            ],
          },
        ],
      },
      faqs: [
        {
          question: '<strong>FAQ?</strong>',
          answer:
            'Resposta geral com <a href="https://example.pt/faq">guia externo</a>.',
        },
      ],
    };

    const result = normalizeWhitelabelContentLinks(contentJson);

    expect(result.topbar?.left?.[0]).toBe('topo');
    expect(result.hero?.h1).toBe('Titulo');
    expect(result.hero?.intro).toContain(
      '<a href="https://example.pt/recurso" target="_blank" rel="noopener">',
    );
    expect(result.hero?.intro).toContain('<strong>confirme</strong>');
    expect(result.hero?.bullets).toEqual(['picheleiros']);
    expect(result.hero?.cta_label).toBe('Pedir assistencia');
    expect(result.form?.title).toBe('Formulario');

    expect(result.article.blocks[0].text).toBe('Assistencia');
    expect(result.article.blocks[1].text).toContain(
      '<a href="https://example.pt/pagina" target="_blank" rel="noopener">',
    );
    expect(result.article.blocks[1].text).not.toContain('javascript:');
    expect(result.article.blocks[2].text).toContain(
      '<a href="/picheleiros">picheleiros 24 horas</a>',
    );
    expect((result.article.blocks[3].items as string[])[0]).toContain(
      '<a href="https://example.pt/check" target="_blank" rel="noopener">',
    );
    expect(
      (
        result.article.blocks[4].items as Array<{
          question: string;
          answer: string;
        }>
      )[0],
    ).toEqual({
      question: 'Pergunta?',
      answer:
        'Resposta com <a href="https://example.pt/a" target="_blank" rel="noopener">fonte oficial</a>.',
    });
    expect(result.faqs?.[0]).toEqual({
      question: 'FAQ?',
      answer:
        'Resposta geral com <a href="https://example.pt/faq" target="_blank" rel="noopener">guia externo</a>.',
    });
  });
});

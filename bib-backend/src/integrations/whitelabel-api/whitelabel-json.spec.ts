import { WHITELABEL_MODULES } from '../../service-templates/service-templates.types';
import { generatedToContentJson } from './whitelabel-json';
import { WhitelabelGeneratedPage } from './whitelabel.types';

describe('generatedToContentJson module boundaries', () => {
  it('allows legitimate question headings outside the FAQ module', () => {
    const sections = {
      intro: {
        topbar: { left: [] },
        hero: { h1: 'Canalizador', intro: 'Introducao' },
        form: { title: 'Contacto' },
      },
    } as WhitelabelGeneratedPage['sections'];

    for (const module of WHITELABEL_MODULES) {
      sections[module.key] =
        module.key === 'modulo_13_perguntas_frequentes'
          ? [
              { type: 'heading', level: 2, text: 'Perguntas Frequentes' },
              {
                type: 'faq_list',
                items: [{ question: 'Atendem?', answer: 'Sim.' }],
              },
            ]
          : [
              { type: 'heading', level: 2, text: module.display_title },
              { type: 'subheading', level: 3, text: 'Como prevenir fugas?' },
              {
                type: 'subheading',
                level: 3,
                text: 'Quando pedir manutencao?',
              },
              { type: 'paragraph', text: 'Conteudo explicativo normal.' },
            ];
    }

    const result = generatedToContentJson({
      page: {
        title: 'Canalizador',
        slug: 'canalizador',
        seo_title: 'Canalizador',
        seo_description: 'Servico de canalizador.',
      },
      sections,
    });

    expect(result.article.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Como prevenir fugas?' }),
        expect.objectContaining({ text: 'Quando pedir manutencao?' }),
      ]),
    );
  });
});

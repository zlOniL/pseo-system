import { ContentSectionsService } from './content-sections.service';
import { LocalityLinksService } from '../cities/locality-links.service';
import {
  buildLocalityLinks,
  withLocalityLinksHtml,
  withLocalityLinksJson,
} from '../common/locality-links';
import {
  WHITELABEL_MODULES,
  SectionKey,
} from '../service-templates/service-templates.types';
import { generatedToContentJson } from '../integrations/whitelabel-api/whitelabel-json';
import type { WhitelabelContentJson } from '../integrations/whitelabel-api/whitelabel.types';

const links = buildLocalityLinks(['Porto'], 'Janelas', 'https://site.pt');

function setup(
  content: Record<string, unknown>,
  rows: Array<Record<string, unknown>>,
) {
  const writes: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const from = (table: string) => {
    let patch: Record<string, unknown> | undefined;
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        filters[key] = value;
        return query;
      },
      update: (value: Record<string, unknown>) => {
        patch = value;
        writes.push({ table, patch });
        return query;
      },
      single: async () => ({
        error: null,
        data: {
          ...(table === 'contents'
            ? content
            : rows.find((row) =>
                filters.section_key
                  ? row.section_key === filters.section_key
                  : row.id === filters.id,
              )),
          ...patch,
        },
      }),
      order: async () => ({ error: null, data: rows }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ error: null }).then(resolve),
    };
    return query;
  };
  const ai = {
    generateText: jest.fn(
      async () => '<h2>Contexto Local</h2><p>Regenerado</p>',
    ),
  };
  const locality = new LocalityLinksService(
    {} as never,
    {
      findById: async () => ({ integration_type: 'whitelabel_api' }),
    } as never,
  );
  const service = new ContentSectionsService(
    { getClient: () => ({ from }) } as never,
    ai as never,
    { validate: () => ({ score: 90, issues: [] }) } as never,
    locality as never,
  );
  return { service, writes, ai };
}

describe('section editing preserves dynamic locality links', () => {
  it.each(['edit', 'regenerate'])(
    'keeps HTML links outside the replaced local section on %s',
    async (mode) => {
      const html = withLocalityLinksHtml(
        '<h1>Janelas</h1><!-- BIB_SECTION:contexto_local --><h2>Contexto Local</h2><p>Antigo</p><!-- /BIB_SECTION:contexto_local --><!-- BIB_SECTION:perguntas_frequentes --><h2>Perguntas Frequentes</h2><!-- /BIB_SECTION:perguntas_frequentes -->',
        links,
      );
      const { service, writes } = setup(
        {
          id: 'c',
          html,
          main_keyword: 'Janelas',
          service: 'Janelas',
          site_id: 'site',
        },
        [
          {
            id: 's',
            section_key: 'contexto_local',
            html: '<h2>Contexto Local</h2><p>Antigo</p>',
            output_format: 'html',
          },
        ],
      );
      if (mode === 'edit')
        await service.updateSection('c', 'contexto_local', {
          html: '<h2>Contexto Local</h2><p>Novo</p>',
        });
      else await service.regenerateSection('c', 'contexto_local');
      const page = writes.find((write) => write.table === 'contents')!.patch;
      expect(page.status).toBe('draft');
      expect(String(page.html).match(/data-bib-locality-links/g)).toHaveLength(
        1,
      );
      expect(page.html).toContain('https://site.pt/janelas-no-porto/');
      expect(page.html).not.toContain('<p>Antigo</p>');
    },
  );

  it.each([false, true])(
    'rebuilds whitelabel without locality links, even when previously present (skip=%s)',
    async (skip) => {
      const sections: Record<string, unknown> = {
        intro: { hero: { h1: 'Janelas' } },
      };
      for (const module of WHITELABEL_MODULES)
        sections[module.key] = [
          { type: 'heading', level: 2, text: module.display_title },
          module.key === 'modulo_13_perguntas_frequentes'
            ? {
                type: 'faq_list',
                items: [{ question: 'Como?', answer: 'Assim.' }],
              }
            : { type: 'paragraph', text: 'Original' },
        ];
      const contentJson = withLocalityLinksJson(
        generatedToContentJson({
          page: {
            title: 'Janelas',
            slug: 'janelas',
            seo_title: 'Janelas',
            seo_description: 'Original',
          },
          sections: sections as Record<SectionKey, unknown>,
        }),
        skip ? [] : links,
      );
      const rows = Object.entries(sections).map(
        ([section_key, content_json], index) => ({
          id: `s-${index}`,
          section_key,
          content_json,
          output_format: 'whitelabel_json',
        }),
      );
      const { service, writes } = setup(
        {
          id: 'c',
          main_keyword: 'Janelas',
          service: 'Janelas',
          site_id: 'site',
          content_json: contentJson,
        },
        rows,
      );
      await service.updateSection('c', 'modulo_12_zonas_contexto_local', {
        content_json: [
          { type: 'heading', level: 2, text: 'Zonas de Atendimento' },
          { type: 'paragraph', text: 'Novo contexto' },
        ],
      });
      const next = writes.find((write) => write.table === 'contents')!.patch
        .content_json as WhitelabelContentJson;
      expect(
        next.article.blocks.filter(
          (block) => block.text === 'Também atendemos',
        ),
      ).toHaveLength(0);
      expect(
        next.article.blocks.some((block) => block.text === 'Novo contexto'),
      ).toBe(true);
      expect(next.faqs).toEqual([{ question: 'Como?', answer: 'Assim.' }]);
    },
  );
});

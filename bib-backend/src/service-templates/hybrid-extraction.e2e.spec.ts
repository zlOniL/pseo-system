import { HybridService } from './hybrid.service';
import { ServiceTemplatesController } from './service-templates.controller';
import { SectionAssemblerService } from './section-assembler.service';
import { SECTION_KEYS, SectionLibraryRow } from './service-templates.types';

describe('hybrid generation after template section extraction', () => {
  it('re-extracts a template with a promo H2 and saves a complete hybrid page', async () => {
    const sections = new Map(
      SECTION_KEYS.map((key) => {
        const html =
          key === 'intro'
            ? '<h1>Reparação de Termoacumuladores em Lisboa</h1><p>PRIMEIRO PARÁGRAFO: assistência técnica de termoacumuladores em Lisboa para residências e empresas.</p><p>SEGUNDO PARÁGRAFO: diagnóstico e reparação com atendimento especializado em Lisboa.</p>'
            : key === 'contexto_local'
              ? '<h2>Contexto Local em Lisboa</h2><p>Atendimento técnico em Lisboa.</p>'
              : `<h2>${key === 'assistencia_especializada' ? 'Assistência Especializada' : key}</h2><p>Conteúdo de ${key} em Lisboa.</p>`;
        return [
          key,
          `<!-- BIB_SECTION:${key} -->${html}<!-- /BIB_SECTION:${key} -->`,
        ] as const;
      }),
    );
    const fullTemplate = `<!doctype html><html><body>
      <main><h1>Título promocional</h1><h2>Excelentes serviços a baixo custo</h2></main>
      <div class="pseo-content"><video src="https://video.test/demo.mp4"></video>
      ${[...sections.values()].join('\n')}
      </div></body></html>`;
    const extractedRows = new Map<string, string>();
    const templates = {
      findById: jest.fn(async () => ({
        id: 'template-15',
        is_main_page: false,
        output_format: 'html',
        html: fullTemplate,
        base_city: 'Lisboa',
        site_id: 'site-1',
      })),
    };
    const library = {
      deleteByTemplate: jest.fn(async () => {}),
      saveAll: jest.fn(
        async (
          _serviceId: string,
          _templateId: string,
          parsed: Map<string, string>,
        ) => {
          parsed.forEach((html, key) => extractedRows.set(key, html));
        },
      ),
      getRandomVersions: jest.fn(),
    };
    const controller = new ServiceTemplatesController(
      templates as never,
      library as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const extracted = await controller.reextract('service-1', 'template-15');
    expect(extracted.sections_saved).toBe(SECTION_KEYS.length);
    expect(extractedRows.get('intro')).toContain('PRIMEIRO PARÁGRAFO');
    expect(extractedRows.get('intro')).toContain('SEGUNDO PARÁGRAFO');

    const ai = {
      generateText: jest
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify({
            values: {
              s0: 'Contexto Local em Carcavelos',
              s1: 'Atendimento técnico em Carcavelos.',
            },
            geography_valid: true,
          }),
        )
        .mockResolvedValueOnce(JSON.stringify({ valid: true, issue: '' })),
    };
    const hybrid = new HybridService(
      {} as never,
      ai as never,
      { findRegion: () => 'Grande Lisboa' } as never,
      { research: jest.fn().mockResolvedValue([]) } as never,
    );
    const rows = SECTION_KEYS.map(
      (key, index) =>
        ({
          id: `row-${key}`,
          created_at: '',
          service_id: 'service-1',
          site_id: 'site-1',
          template_id: 'template-15',
          section_key: key,
          version: index + 1,
          html: extractedRows.get(key) ?? '',
          content_json: null,
          output_format: 'html',
          base_city: 'Lisboa',
        }) as SectionLibraryRow,
    );
    jest.spyOn(hybrid, 'rows').mockResolvedValue(rows);

    const savedContents = {
      save: jest.fn(
        async (
          _input: Record<string, unknown>,
          _html: string,
          _validation: unknown,
          _metaDescription: string,
          _mode: string,
          _options: {
            hybrid_manifest: { sections: Array<{ row_id: string }> };
          },
        ) => ({ id: 'hybrid-draft-1' }),
      ),
    };
    const assembler = new SectionAssemblerService(
      library as never,
      { validate: () => ({ score: 90, issues: [] }) } as never,
      savedContents as never,
      {
        findById: async () => ({ integration_type: 'wordpress' }),
      } as never,
      {} as never,
      { html: async (html: string) => html } as never,
      {} as never,
      hybrid,
    );

    await assembler.assemble({
      service: {
        id: 'service-1',
        site_id: 'site-1',
        name: 'Reparação de Termoacumuladores',
        images: ['https://images.test/first.jpg'],
        video_url: 'https://video.test/demo.mp4',
        related_services: [],
        min_words: 1,
      } as never,
      serviceId: 'service-1',
      city: 'Carcavelos',
      mode: 'hybrid',
    });

    const [, generatedHtml, , , mode, options] =
      savedContents.save.mock.calls[0];
    expect(mode).toBe('hybrid');
    expect(options.hybrid_manifest.sections).toHaveLength(SECTION_KEYS.length);
    expect(options.hybrid_manifest.sections[0].row_id).toBe('row-intro');
    expect(generatedHtml).toContain('PRIMEIRO PARÁGRAFO');
    expect(generatedHtml).toContain('SEGUNDO PARÁGRAFO');
    expect(generatedHtml).toContain('em Carcavelos');
    expect(generatedHtml).toContain('Contexto Local em Carcavelos');
    expect(generatedHtml).not.toContain('em Lisboa');
    expect(generatedHtml.indexOf('SEGUNDO PARÁGRAFO')).toBeLessThan(
      generatedHtml.indexOf('src="https://images.test/first.jpg"'),
    );
    expect(
      generatedHtml.indexOf('src="https://images.test/first.jpg"'),
    ).toBeLessThan(generatedHtml.indexOf('<h2>Assistência Especializada'));
    expect(savedContents.save.mock.calls[0][0].video_url).toBe(
      'https://video.test/demo.mp4',
    );
    expect(ai.generateText).toHaveBeenCalledTimes(2);
  });
});
